from transformers import AutoModelForImageTextToText, AutoProcessor
import torch
from PIL import Image
import os
import json
import re
from typing import Optional, List, Dict, Any
import logging

MODEL_ID = "ibm-granite/granite-vision-3.3-2b"

IS_MOCK = False
_processor = None
_model = None
# Robust device selection
device = "mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu")

logger = logging.getLogger(__name__)

def _ensure_model_loaded():
    global _processor, _model
    if _processor is not None and _model is not None:
        return
    try:
        logger.info('Loading Granite Vision model...')
        _processor = AutoProcessor.from_pretrained(MODEL_ID)
        
        # Determine torch dtype based on device capabilities
        torch_dtype = torch.float16 if device != "cpu" else torch.float32
        
        _model = AutoModelForImageTextToText.from_pretrained(
            MODEL_ID, 
            device_map="auto", 
            torch_dtype=torch_dtype, 
            low_cpu_mem_usage=True
        )
        _model.eval()
        logger.info('Granite Vision model loaded successfully.')
    except Exception as e:
        logger.error(f'Granite Vision model load failed: {e}')
        _processor = None
        _model = None

def _is_mock(override: Optional[bool]) -> bool:
    return IS_MOCK or (override is True)

def _clean_json_output(text: str) -> List[Dict]:
    """
    Helper to extract and parse JSON from the model's chatty output.
    """
    try:
        # 1. Try to find a JSON block ```json ... ```
        match = re.search(r"```json\s*(.*?)```", text, re.DOTALL)
        if match:
            json_str = match.group(1)
        else:
            # 2. Fallback: Try to find the first [ or {
            match = re.search(r"(\[.*\]|\{.*\})", text, re.DOTALL)
            json_str = match.group(0) if match else text
        
        data = json.loads(json_str)
        
        # Ensure it's a list (some prompts return a dict wrapper)
        if isinstance(data, dict) and "components" in data:
            return data["components"]
        return data if isinstance(data, list) else []
    except Exception as e:
        logger.warning(f"Failed to parse JSON from model output: {e}. Raw text: {text[:100]}...")
        return []

def analyze_images(images: List[Image.Image], prompt: Optional[str] = None, task: str = "summary", mock: Optional[bool] = None) -> dict:
    """
    Analyze images.
    Args:
        task: 'summary' (default text description) or 'ar_extraction' (returns bbox components)
    """
    try:
        if not images:
            return {'status': 'error', 'error': 'No images provided.'}

        # --- PROMPT ENGINEERING ---
        if prompt:
            final_prompt = prompt
        elif task == "ar_extraction":
            # Specialized prompt for AR Coordinates
            final_prompt = (
                "Analyze this diagram. Identify the distinct functional components. "
                "For each component, provide a JSON object with: "
                "'label' (name), 'description' (short function), and 'box_2d' "
                "([ymin, xmin, ymax, xmax] normalized 0-1000). "
                "Output strictly valid JSON."
            )
        else:
            final_prompt = "Provide a concise technical summary. Identify key entities and relationships."

        # --- MOCK MODE ---
        if _is_mock(mock):
            if task == "ar_extraction":
                return {
                    'status': 'ok',
                    'answer': 'Mock JSON generated.',
                    'components': [
                        {'label': 'Mock Battery', 'box_2d': [100, 100, 200, 200], 'description': 'Power source'},
                        {'label': 'Mock Resistor', 'box_2d': [300, 300, 400, 400], 'description': 'Resistance'}
                    ]
                }
            return {
                'status': 'ok',
                'answer': f'[MOCK] Analyzed {len(images)} image(s).',
                'meta': {'images_count': len(images)}
            }

        _ensure_model_loaded()
        if _model is None:
            return {'status': 'error', 'error': 'Model failed to initialize.'}

        # --- INFERENCE ---
        def _run_inference(imgs):
            inputs = _processor(text=final_prompt, images=imgs, return_tensors="pt")
            model_device = next(_model.parameters()).device
            inputs = {k: v.to(model_device) if torch.is_tensor(v) else v for k, v in inputs.items()}
            
            with torch.no_grad():
                generate_ids = _model.generate(
                    **inputs,
                    max_new_tokens=1024, # Increased for JSON
                    do_sample=False if task == "ar_extraction" else True, # DETERMINISTIC for AR
                    temperature=0.0 if task == "ar_extraction" else 0.7
                )
            output = _processor.batch_decode(generate_ids, skip_special_tokens=True)
            return (output[0] if output else '').strip()

        raw_answer = _run_inference(images)

        # --- OUTPUT FORMATTING ---
        result = {
            'status': 'ok',
            'answer': raw_answer,
            'meta': {'images_count': len(images)}
        }

        # If this was an AR task, parse the JSON and attach it so preprocess_service can find it
        if task == "ar_extraction":
            components = _clean_json_output(raw_answer)
            
            # Normalize boxes (Granite usually outputs 0-1000 integers, Unity needs 0.0-1.0 floats)
            for comp in components:
                if 'box_2d' in comp:
                    # Convert [100, 100, 500, 500] -> [0.1, 0.1, 0.5, 0.5]
                    comp['bbox'] = [x / 1000.0 for x in comp['box_2d']]
            
            result['components'] = components

        return result

    except Exception as e:
        logger.exception('Granite Vision analysis failed')
        return {'status': 'error', 'error': str(e)}

def analyze_document(file_path: str, prompt: Optional[str] = None, mock: Optional[bool] = None) -> dict:
    # Helper wrapper stays largely the same
    try:
        ext = os.path.splitext(file_path)[1].lower()
        if ext in {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'}:
            img = Image.open(file_path).convert('RGB')
            # Default to summary unless specified otherwise via new method calls
            return analyze_images([img], prompt=prompt, mock=mock)
        return {'status': 'error', 'error': 'Unsupported file type'}
    except Exception as e:
        return {'status': 'error', 'error': str(e)}