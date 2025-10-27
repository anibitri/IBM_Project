from vllm import LLM, SamplingParams
from vllm.assets.image import ImageAsset
from huggingface_hub import hf_hub_download
from PIL import Image
import os

model_path = "ibm-granite/granite-vision-3.3-2b"

# --- new: safe model init with mock fallback ---
IS_MOCK = os.getenv("GRANITE_MOCK") == "1"
model = None
if not IS_MOCK:
    try:
        model = LLM(model=model_path)
    except Exception:
        # Fallback to mock if model/GPU init fails
        IS_MOCK = True

sampling_params = SamplingParams(
    temperature=0.7,
    max_tokens=1024
)

def _is_mock(override):
    return IS_MOCK or (override is True)

# --- New: document analysis helper ---
def analyze_document(file_path: str, prompt: str | None = None, mock: bool | None = None) -> dict:
    """
    Process an uploaded/scanned document with Granite Vision.
    Supports images directly; for PDFs, rasterizes first pages via pdf2image when available.

    Returns:
      { status: 'ok', answer: str } on success
      { status: 'error', error: str } on failure
    """
    try:
        ext = os.path.splitext(file_path)[1].lower()
        images = []

        if ext in {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'}:
            img = Image.open(file_path).convert('RGB')
            images.append(img)
        elif ext == '.pdf':
            try:
                # Prefer pdf2image for robust rasterization
                from pdf2image import convert_from_path
                # Convert first 1–3 pages for speed
                pages = convert_from_path(file_path, dpi=200, fmt='png')
                images = pages[:3] if pages else []
            except Exception as e:
                return {
                    'status': 'error',
                    'error': f'PDF to image conversion failed. Install pdf2image and poppler. Details: {e}'
                }
        else:
            return {'status': 'error', 'error': f'Unsupported file type: {ext}'}

        if not images:
            return {'status': 'error', 'error': 'No pages/images to analyze.'}

        question = prompt or (
            'Summarize this document and list key entities, relationships, and any diagrams. '
            'If multiple pages are provided, consider them together.'
        )

        # --- new: mock mode path ---
        if _is_mock(mock):
            fname = os.path.basename(file_path)
            return {
                'status': 'ok',
                'answer': f'[MOCK] Analyzed {fname}. Pages/Images: {len(images)}. Prompt: {question[:120]}'
            }

        if model is None:
            return {'status': 'error', 'error': 'Model not initialized. Enable GPU or run in mock mode (GRANITE_MOCK=1).'}

        # vLLM multimodal call
        outputs = model.generate(
            [question],
            sampling_params,
            multi_modal_data={
                'image': [images]
            }
        )
        answer = outputs[0].outputs[0].text if outputs and outputs[0].outputs else ''
        return {'status': 'ok', 'answer': answer}
    except Exception as e:
        return {'status': 'error', 'error': f'Granite Vision inference failed: {e}'}