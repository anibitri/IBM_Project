import torch
from PIL import Image
from app.services.model_manager import manager
from app.services.prompt_builder import (
    AR_EXTRACTION_PROMPT,
    GENERAL_IMAGE_ANALYSIS_PROMPT,
    build_vision_chat_text,
    build_vision_qa_prompt,
)
import re


def _truncate_summary(text: str, max_chars: int = 220) -> str:
    """Safely truncate text to specific length"""
    if len(text) <= max_chars:
        return text.strip()
    truncated = text[:max_chars]
    last_punct = max(truncated.rfind('.'), truncated.rfind('!'), truncated.rfind('?'))
    if last_punct > 0:
        return truncated[:last_punct+1].strip()
    return truncated.rstrip() + "..."


def _clean_generated_text(text: str) -> str:
    """Clean generated text"""
    if not text:
        return ""
    
    # Remove metadata tokens
    for noise in ['<|end_of_text|>', '<fim_prefix>', '<|system|>', '<|user|>', '<|assistant|>']:
        text = text.replace(noise, '')

    # Remove markdown
    text = text.replace('**', '').replace('__', '')

    lines = [line.strip("-* ").strip() for line in text.splitlines()]
    lines = [l for l in lines if len(l) > 1]
    
    cleaned = "\n".join(lines).strip()
    return cleaned if cleaned else text.strip()


def _extract_components_from_text(text: str) -> list:
    """Extract component list from generated text"""
    components = []
    
    lines = text.splitlines()
    for line in lines:
        line = line.strip("-* •·0123456789.)").strip()
        if not line or len(line) < 2:
            continue

        # Strategy 1: Parse "NAME — ROLE" or "NAME - ROLE" structured output
        # (matches the AR_EXTRACTION_PROMPT format)
        dash_match = re.match(r'^(.+?)\s*[—–\-]\s+(.+)$', line)
        if dash_match:
            name = dash_match.group(1).strip().strip('"\'')
            if 1 < len(name) < 50 and any(c.isalnum() for c in name):
                components.append(name)
                continue

        # Strategy 2: Plain lines that look like component names (2-50 chars)
        if 2 < len(line) < 50 and any(c.isalnum() for c in line):
            components.append(line)
    
    # Strategy 3: Extract quoted terms
    quoted = re.findall(r'["\']([A-Za-z0-9_\-\s]+)["\']', text)
    components.extend([q.strip() for q in quoted if 2 < len(q.strip()) < 50])
    
    # Deduplicate preserving order
    seen = set()
    unique_components = []
    for comp in components:
        if comp.lower() not in seen:
            seen.add(comp.lower())
            unique_components.append(comp)
    
    return unique_components[:20]  # Limit to top 20


_DIAGRAM_TYPE_ALIASES = {
    "sequence":     "sequence",
    "uml":          "uml",
    "class":        "uml",
    "flowchart":    "flowchart",
    "flow":         "flowchart",
    "architecture": "architecture",
    "other":        "other",
}


def _extract_diagram_type(text: str) -> str:
    """
    Parse the DIAGRAM_TYPE line produced by AR_EXTRACTION_PROMPT.
    Returns one of: 'sequence', 'uml', 'flowchart', 'architecture', 'other'.

    Strategy:
    1. Look for an explicit "DIAGRAM_TYPE: <label>" line.
       If the value contains multiple labels (model copied the format line),
       treat it as unrecognised and fall through.
    2. Keyword-scan the full text for diagram-type vocabulary as a fallback.
    3. Default to 'other'.
    """
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.upper().startswith("DIAGRAM_TYPE:"):
            value = stripped.split(":", 1)[1].strip().lower()
            # If the model copied multiple options (contains "|"), skip this line
            if "|" in value:
                break
            for key, canonical in _DIAGRAM_TYPE_ALIASES.items():
                if re.search(rf'\b{re.escape(key)}\b', value):
                    return canonical
            break  # Found the line but couldn't parse it — stop here

    # Fallback: keyword scan of the full text (handles prose descriptions)
    text_lower = text.lower()
    # Order matters: more specific terms first
    fallback_keywords = [
        ("sequence diagram", "sequence"),
        ("lifeline",         "sequence"),
        ("class diagram",    "uml"),
        ("uml",              "uml"),
        ("flowchart",        "flowchart"),
        ("flow chart",       "flowchart"),
        ("flow diagram",     "flowchart"),
        ("architecture",     "architecture"),
        ("infrastructure",   "architecture"),
        ("system diagram",   "architecture"),
    ]
    for keyword, canonical in fallback_keywords:
        if keyword in text_lower:
            return canonical

    return "other"


def analyze_images(input_data, task="general_analysis", **kwargs):
    """
    Analyze images using Granite Vision model.

    Args:
        input_data: Image path (str), PIL Image, or list of PIL Images
        task: Analysis task type ("general_analysis", "ar_extraction", etc.)

    Returns:
        dict with 'analysis', 'components', 'answer' keys
    """
    import os

    # Validate inputs before any model/mock check
    if isinstance(input_data, list) and len(input_data) == 0:
        return {
            "status": "error",
            "error": "No images provided",
            "analysis": {"summary": "No images provided."},
            "components": [],
            "answer": ""
        }
    if isinstance(input_data, str) and not os.path.isfile(input_data):
        return {
            "status": "error",
            "error": f"File not found: {input_data}",
            "analysis": {"summary": "File not found."},
            "components": [],
            "answer": ""
        }

    if not manager.vision_model or not manager.vision_processor:
        if manager.mock_mode:
            return {
                "status": "success",
                "analysis": {"summary": "Mock vision analysis: diagram contains interconnected components."},
                "components": ["Component A", "Component B", "Component C"],
                "answer": "Mock response (GRANITE_MOCK=1): vision model not loaded."
            }
        return {
            "status": "error",
            "error": "Vision model not loaded",
            "analysis": {"summary": "Error: Vision Model not loaded."},
            "components": [],
            "answer": ""
        }

    try:
        # Load image
        if isinstance(input_data, str):
            image = Image.open(input_data).convert("RGB")
            path_str = input_data
        elif isinstance(input_data, Image.Image):
            image = input_data.convert("RGB")
            path_str = "PIL Image"
        elif isinstance(input_data, list) and input_data:
            image = input_data[0] if isinstance(input_data[0], Image.Image) else Image.open(input_data[0])
            image = image.convert("RGB")
            path_str = "Image List"
        else:
            return {
                "status": "error",
                "error": "Invalid input",
                "analysis": {"summary": "Invalid input."},
                "components": [],
                "answer": ""
            }
        
        # Resize large images
        if max(image.size) > 560:
            ratio = 560.0 / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.LANCZOS)

        print(f"🔍 VISION SERVICE: Analyzing {path_str} [Task: {task}]")

        # Prepare prompt based on task
        if task == "ar_extraction":
            user_prompt = AR_EXTRACTION_PROMPT
        else:
            user_prompt = GENERAL_IMAGE_ANALYSIS_PROMPT

        chat_text = build_vision_chat_text(user_prompt)

        # Process inputs
        print(f"   ⏳ Preparing inputs (device={manager.vision_device_map})...")
        inputs = manager.vision_processor(
            images=[image],
            text=chat_text,
            return_tensors="pt"
        )

        device = manager.vision_model.device
        target_dtype = getattr(manager, "vision_compute_dtype", manager.dtype)

        processed_inputs = {}
        for k, v in inputs.items():
            if k == "pixel_values":
                if not torch.isfinite(v).all():
                    v = torch.nan_to_num(v)
                processed_inputs[k] = v.to(device, dtype=target_dtype)
            elif k == "input_ids":
                processed_inputs[k] = v.to(device)
            elif v.dtype in [torch.float32, torch.float64]:
                processed_inputs[k] = v.to(device, dtype=target_dtype)
            else:
                processed_inputs[k] = v.to(device)

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        print(f"   ⏳ Running generation (max_new_tokens=300, device={device})...")
        print(f"      ⚠️  CPU inference can take 5–15 min on large models — still running...")
        import time as _time
        _t0 = _time.time()

        # Generate
        with torch.no_grad():
            output_ids = manager.vision_model.generate(
                **processed_inputs,
                max_new_tokens=150,
                do_sample=False,
                repetition_penalty=1.1
            )

        print(f"   ✅ Generation done in {_time.time() - _t0:.1f}s")

        prompt_len = processed_inputs.get("input_ids", torch.empty(1, 0)).shape[1]

        # Free input tensors immediately — they are no longer needed
        del processed_inputs, inputs
        import gc as _gc
        _gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        # Decode
        print(f"   ⏳ Decoding output...")
        generated_text = ""
        if output_ids.shape[1] > prompt_len:
            new_tokens = output_ids[:, prompt_len:]
            generated_text = manager.vision_processor.batch_decode(
                new_tokens, skip_special_tokens=True
            )[0]

        del output_ids
        _gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        # Clean and process output
        summary = _clean_generated_text(generated_text)
        if not summary or summary.strip() == "":
            summary = "No visible components detected."

        # Extract diagram type classification if present
        diagram_type = _extract_diagram_type(summary)

        # Extract components
        components = _extract_components_from_text(summary)

        print(f"✅ Vision analysis complete: diagram_type={diagram_type}, {len(components)} components identified")
        print(f"   Summary: {summary[:100]}...")

        return {
            "status": "success",
            "analysis": {"summary": summary},
            "components": components,
            "diagram_type": diagram_type,
            "answer": summary
        }

    except Exception as e:
        print(f"❌ Vision Service Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "status": "error",
            "error": str(e),
            "analysis": {"summary": f"Analysis failed: {str(e)}"},
            "components": [],
            "answer": ""
        }


def query_image(image_path: str, question: str) -> str:
    """
    Ask a specific question about an image using the vision model.

    Args:
        image_path: Path to the image file.
        question: The user's natural-language question.

    Returns:
        The vision model's answer as a plain string (empty on failure).
    """
    if not manager.vision_model or not manager.vision_processor:
        return ""

    try:
        image = Image.open(image_path).convert("RGB")

        # Resize large images to fit model context
        if max(image.size) > 560:
            ratio = 560.0 / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.LANCZOS)

        prompt = build_vision_qa_prompt(question)

        chat_text = build_vision_chat_text(prompt)

        inputs = manager.vision_processor(
            images=[image],
            text=chat_text,
            return_tensors="pt"
        )

        device = manager.vision_model.device
        target_dtype = getattr(manager, "vision_compute_dtype", manager.dtype)

        processed_inputs = {}
        for k, v in inputs.items():
            if k == "pixel_values":
                if not torch.isfinite(v).all():
                    v = torch.nan_to_num(v)
                processed_inputs[k] = v.to(device, dtype=target_dtype)
            elif k == "input_ids":
                processed_inputs[k] = v.to(device)
            elif v.dtype in [torch.float32, torch.float64]:
                processed_inputs[k] = v.to(device, dtype=target_dtype)
            else:
                processed_inputs[k] = v.to(device)

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        with torch.no_grad():
            output_ids = manager.vision_model.generate(
                **processed_inputs,
                max_new_tokens=100,
                do_sample=False,
            )

        prompt_len = processed_inputs.get("input_ids", torch.empty(1, 0)).shape[1]

        # Free input tensors immediately
        del processed_inputs, inputs
        import gc as _gc
        _gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        if output_ids.shape[1] <= prompt_len:
            del output_ids
            return ""

        new_tokens = output_ids[:, prompt_len:]
        answer = manager.vision_processor.batch_decode(
            new_tokens, skip_special_tokens=True
        )[0]

        del output_ids
        _gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        answer = _clean_generated_text(answer)
        print(f"👁️ Vision Q&A: '{question[:60]}' → '{answer[:100]}'")
        return answer

    except Exception as e:
        print(f"⚠️ Vision Q&A failed: {e}")
        return ""