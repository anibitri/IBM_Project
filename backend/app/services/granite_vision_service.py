from transformers import AutoProcessor, AutoModelForVision2Seq
import torch
from PIL import Image
import os
from typing import Optional
import logging
from PyPDF2 import PdfReader

MODEL_ID = "ibm-granite/granite-vision-3.3-2b"

# Mock mode: set env GRANITE_MOCK=1 or pass mock=True to analyze_document
IS_MOCK = os.getenv("GRANITE_MOCK") == "1"

# Lazy-loaded model/processor
_processor = None
_model = None
_device = "cuda" if torch.cuda.is_available() else "cpu"
_dtype = torch.float16 if _device == "cuda" else torch.float32

def _ensure_model_loaded():
  global _processor, _model
  if _processor is not None and _model is not None:
    return
  try:
    _processor = AutoProcessor.from_pretrained(MODEL_ID)
    _model = AutoModelForVision2Seq.from_pretrained(MODEL_ID, torch_dtype=_dtype)
    _model.to(_device)
    _model.eval()
  except Exception as e:
    # If loading fails, stay in mock mode so API remains testable
    global IS_MOCK
    IS_MOCK = True

logger = logging.getLogger(__name__)

def _is_mock(override: Optional[bool]) -> bool:
  return IS_MOCK or (override is True)

def _extract_pdf_text(file_path: str, max_chars: int = 12000) -> str:
  """
  Extract raw text from a PDF using PyPDF2. Returns possibly-empty string.
  Does not require poppler.
  """
  try:
    
    reader = PdfReader(file_path)
    parts = []
    for page in reader.pages:
      try:
        txt = page.extract_text() or ""
      except Exception:
        txt = ""
      if txt:
        parts.append(txt)
      # stop if we exceed max_chars to avoid huge payloads
      if sum(len(p) for p in parts) > max_chars:
        break
    text = "\n".join(parts)
    if len(text) > max_chars:
      text = text[:max_chars]
    return text
  except Exception as e:
    logger.warning(f'PDF text extraction failed via PyPDF2: {e}')
    return ""

def analyze_document(file_path: str, prompt: Optional[str] = None, mock: Optional[bool] = None) -> dict:
  """
  Process an uploaded/scanned document.
  - Images: analyzed by Granite Vision (if available).
  - PDFs: extract text via PyPDF2 (no poppler needed). Optionally render pages via pdf2image for vision if available.
  Returns:
    { status: 'ok', answer: str, text_excerpt?: str, meta?: {...} } on success
    { status: 'error', error: str } on failure
  """
  logger.info("Here56")
  try:
    ext = os.path.splitext(file_path)[1].lower()
    images = []
    text_content = ""

    if ext in {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'}:
      images.append(Image.open(file_path).convert('RGB'))
    elif ext == '.pdf':
      # 1) Always try to extract text without heavy deps
      text_content = _extract_pdf_text(file_path)

      # 2) Try to render pages for vision if pdf2image/poppler are present; otherwise continue without images
      try:
        from pdf2image import convert_from_path
        pages = convert_from_path(file_path, dpi=200, fmt='png')
        images = pages[:3] if pages else []
      except Exception as e:
        logger.warning(f'PDF to image conversion unavailable or failed; proceeding with text only. Details: {e}')
        images = []
    else:
      return {'status': 'error', 'error': f'Unsupported file type: {ext}'}

    # Build a question that can leverage text context if available
    text_excerpt = (text_content or "").strip()
    if text_excerpt:
      # Limit excerpt to keep prompt size reasonable
      text_excerpt = text_excerpt[:1500]

    base_instruction = (
      "Provide a concise technical summary. Identify key entities, relationships, and any diagrams."
    )
    if text_excerpt:
      base_instruction += f"\nContext (text excerpt): {text_excerpt}"

    question = prompt or base_instruction

    # Mock mode: return synthetic response without loading the model
    if _is_mock(mock):
      fname = os.path.basename(file_path)
      return {
        'status': 'ok',
        'answer': f'[MOCK] Analyzed {fname}. Images processed: {len(images)}. '
                  f'Text excerpt chars: {len(text_excerpt)}. Prompt: {question[:200]}',
        'text_excerpt': text_excerpt,
        'meta': {
          'images_count': len(images),
          'has_text': bool(text_excerpt),
          'file_ext': ext
        }
      }

    # No model for pure text; if we have no images, still return extracted text excerpt
    if not images and ext == '.pdf':
      if text_excerpt:
        return {
          'status': 'ok',
          'answer': f'[TEXT-ONLY] No images processed. Returning extracted text excerpt:\n{text_excerpt}',
          'text_excerpt': text_excerpt,
          'meta': {
            'images_count': 0,
            'has_text': True,
            'file_ext': ext
          }
        }
      else:
        return {'status': 'error', 'error': 'No images could be rendered and no text was extracted.'}

    # If we got here, we have at least one image to run vision on
    _ensure_model_loaded()
    if _model is None or _processor is None:
      return {'status': 'error', 'error': 'Model not initialized. Enable GPU/CPU resources or run with GRANITE_MOCK=1.'}

    def _run_inference(imgs):
      inputs = _processor(text=question, images=imgs, return_tensors="pt")
      # Move tensor inputs to device
      for k, v in list(inputs.items()):
        if isinstance(v, torch.Tensor):
          inputs[k] = v.to(_device)
      with torch.no_grad():
        generate_ids = _model.generate(
          **inputs,
          max_new_tokens=512,
          do_sample=True,
          temperature=0.7
        )
      output = _processor.batch_decode(generate_ids, skip_special_tokens=True)
      return (output[0] if output else '').strip()

    try:
      answer = _run_inference(images)
    except Exception as e:
      logger.warning(f'Multi-image inference failed, falling back to first image: {e}')
      answer = _run_inference(images[:1])

    # Combine with a note about text context if present
    if text_excerpt:
      answer = f'{answer}\n\n[Context Note] The above considers a text excerpt from the PDF.'

    return {
      'status': 'ok',
      'answer': answer,
      'text_excerpt': text_excerpt if text_excerpt else None,
      'meta': {
        'images_count': len(images),
        'has_text': bool(text_excerpt),
        'file_ext': ext
      }
    }
  except Exception as e:
    return {'status': 'error', 'error': f'Granite Vision inference failed: {e}'}