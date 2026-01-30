import torch
import re
from PIL import Image
from app.services.model_manager import manager

#STABLE BUT BAD SUMMARY VERSION

def _truncate_summary(text: str, max_chars: int = 220) -> str:
    """Safely truncate text to a specific length."""
    if len(text) <= max_chars:
        return text.strip()
    truncated = text[:max_chars]
    last_punct = max(truncated.rfind('.'), truncated.rfind('!'), truncated.rfind('?'))
    if last_punct > 0:
        return truncated[:last_punct+1].strip()
    return truncated.rstrip() + "..."

def _clean_generated_text(text: str) -> str:
    """Process generated text into a cleaner component list or summary."""
    if not text:
        return ""
    
    # Remove metadata tokens that might leak through
    for noise in ['<|end_of_text|>', '<fim_prefix>', '<|system|>', '<|user|>', '<|assistant|>']:
        text = text.replace(noise, '')

    # Remove markdown bold/italic
    text = text.replace('**', '').replace('__', '')

    lines = [line.strip("-* ").strip() for line in text.splitlines()]
    
    # Relaxed filtering: keep lines > 1 char
    lines = [l for l in lines if len(l) > 1]
    
    cleaned = "\n".join(lines).strip()
    if cleaned:
        return cleaned
    
    # If filtering removed everything, return raw text
    return text.strip()

def _load_image(input_data):
    if isinstance(input_data, str):
        return Image.open(input_data).convert("RGB"), input_data
    if isinstance(input_data, list) and input_data:
        return input_data[0], "InMemoryImage"
    return None, "Invalid"

def analyze_images(input_data, task="Component Identification", **kwargs):
    """Run Granite Vision and return a clean component list."""
    if not manager.vision_model or not manager.vision_processor:
        return {"analysis": {"summary": "Error: Vision Model not loaded."}}

    try:
        image, path_str = _load_image(input_data)
        if image is None:
            return {"analysis": {"summary": "Invalid input."}}
    
        # Resize large images comfortably within limits to avoid OOM
        if max(image.size) > 800:
            ratio = 800.0 / max(image.size)
            image = image.resize((int(image.size[0] * ratio), int(image.size[1] * ratio)), Image.LANCZOS)

        print(f"--- VISION SERVICE: Processing {path_str} [Task: {task}] ---")

        # --- Granite prompt Construction ---
        # Manual prompt formatting enables better control and avoids "system prompt" confusion
        user_prompt = "Describe the image in detail and list all visible technical components."
        chat_text = f"<|user|>\n<image>\n{user_prompt}\n<|assistant|>\n"

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
                # Do not clamp input_ids for vision models to avoid breaking special tokens
                processed_inputs[k] = v.to(device)
            elif v.dtype in [torch.float32, torch.float64]:
                processed_inputs[k] = v.to(device, dtype=target_dtype)
            else:
                processed_inputs[k] = v.to(device)

        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        # --- Generate ---
        with torch.no_grad():
            output_ids = manager.vision_model.generate(
                **processed_inputs,
                max_new_tokens=300,
                do_sample=True,
                temperature=0.6,
                top_p=0.9,
                repetition_penalty=1.1
            )

        prompt_len = processed_inputs.get("input_ids", torch.empty(1, 0)).shape[1]
        
        # Decode output
        generated_text = ""
        if output_ids.shape[1] > prompt_len:
            new_tokens = output_ids[:, prompt_len:]
            generated_text = manager.vision_processor.batch_decode(
                new_tokens, skip_special_tokens=True
            )[0]

        summary = _clean_generated_text(generated_text)
        if not summary or summary.strip() == "":
            summary = "No visible components detected."

        print(f"--- VISION OUTPUT:\n{summary}")

        response = {"analysis": {"summary": summary}}
        if task == "ar_extraction":
            # Ensure answer is never empty so downstream AR logic works
            response.update({
                "components": summary.splitlines() if summary else [], 
                "answer": summary
            })

        return response

    except Exception as e:
        print(f"❌ ERROR in Vision Service: {e}")
        return {"analysis": {"summary": f"Analysis failed: {str(e)}"}}
