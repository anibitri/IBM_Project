from transformers import AutoProcessor, AutoModelForVision2Seq
import torch
from PIL import Image
import os
from typing import Optional, List  # <- add List
import logging

MODEL_ID = "ibm-granite/granite-vision-3.3-2b"

# Mock mode: set env GRANITE_MOCK=1 or pass mock=True to analyze_document
IS_MOCK = os.getenv("GRANITE_MOCK") == "1"

processor = AutoProcessor.from_pretrained(MODEL_ID)
# Lazy-loaded model/processor
_processor = None
_model = None
_device = "cuda" if torch.cuda.is_available() else "cpu"

def _ensure_model_loaded():
  global _processor, _model
  if _processor is not None and _model is not None:
    return
  try:
    _processor = AutoProcessor.from_pretrained(MODEL_ID)
    _model = AutoModelForVision2Seq.from_pretrained(MODEL_ID).to(_device)
    _model.to(_device)
    _model.eval()
  except Exception as e:
    # If loading fails, stay in mock mode so API remains testable
    global IS_MOCK
    IS_MOCK = True

logger = logging.getLogger(__name__)

def _is_mock(override: Optional[bool]) -> bool:
  return IS_MOCK or (override is True)

def analyze_images(images: List[Image.Image], prompt: Optional[str] = None, mock: Optional[bool] = None) -> dict:
  """
  Analyze a list of PIL images with Granite Vision. No extraction is performed here.
  Returns: { status: 'ok', answer: str, meta?: {...} } or { status: 'error', error: str }
  """
  try:
    logger.info(f'Starting Granite Vision analysis on {len(images)} image(s).')
    if not images:
      return {'status': 'error', 'error': 'No images provided for analysis.'}

    question = prompt or (
      "Provide a concise technical summary. Identify key entities, relationships, and any diagrams in the image(s)."
    )

    if _is_mock(mock):
      return {
        'status': 'ok',
        'answer': f'[MOCK] Analyzed {len(images)} image(s). Prompt: {question[:200]}',
        'meta': { 'images_count': len(images) }
      }

    _ensure_model_loaded()
    if _model is None or _processor is None:
      return {'status': 'error', 'error': 'Model not initialized. Set GRANITE_MOCK=1 for development.'}

    def _run_inference(imgs):
      inputs = _processor(text=question, images=imgs, return_tensors="pt")
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

    return {
      'status': 'ok',
      'answer': answer,
      'meta': { 'images_count': len(images) }
    }
  except Exception as e:
    return {'status': 'error', 'error': f'Granite Vision image analysis failed: {e}'}

def analyze_document(file_path: str, prompt: Optional[str] = None, mock: Optional[bool] = None) -> dict:
  """
  Backward-compatible helper:
  - If image path: loads and analyzes the single image.
  - If PDF: no extraction here; instruct caller to use preprocess_service.
  """
  try:
    logger.info(f'Starting Granite Vision document analysis for file: {file_path}')
    ext = os.path.splitext(file_path)[1].lower()
    if ext in {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'}:
      img = Image.open(file_path).convert('RGB')
      return analyze_images([img], prompt=prompt, mock=mock)
    if ext == '.pdf':
      return {'status': 'error', 'error': 'Use preprocess_service for PDFs (extraction is not done in vision service).'}
    return {'status': 'error', 'error': f'Unsupported file type: {ext}'}
  except Exception as e:
    return {'status': 'error', 'error': f'Granite Vision analyze_document failed: {e}'}