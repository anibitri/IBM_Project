import torch
import re
from PIL import Image
from app.services.model_manager import manager

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
    """Process generated text into clean component list."""
    # Split lines, remove empty or nonsense lines
    lines = [line.strip("-* ").strip() for line in text.splitlines()]
    lines = [l for l in lines if re.search(r"[A-Za-z]", l) and len(l) < 60]
    return "\n".join(lines) or "No components identified."

def _load_image(input_data):
    if isinstance(input_data, str):
        return Image.open(input_data).convert("RGB"), input_data
    if isinstance(input_data, list) and input_data:
        return input_data[0], "InMemoryImage"
    return None, "Invalid"

def analyze_images(input_data, task="ar_extraction"):
    """Run Granite Vision and return a clean component list."""
    if not manager.vision_model or not manager.vision_processor:
        return {"analysis": {"summary": "Error: Vision Model not loaded."}}

    try:
        image, path_str = _load_image(input_data)
        if image is None:
            return {"analysis": {"summary": "Invalid input."}}

        # Resize large images
        if max(image.size) > 1024:
            ratio = 1024.0 / max(image.size)
            image = image.resize((int(image.size[0] * ratio), int(image.size[1] * ratio)), Image.LANCZOS)

        print(f"--- VISION SERVICE: Processing {path_str} [Task: {task}] ---")

        # --- Improved Prompt ---
        prompt = f"""<image>
You are a technical inspection assistant.
Carefully identify all visible components in this image.
List each component on a separate line using only the name.
Do NOT repeat characters or generate gibberish.
If labels or text are visible, include them as well.
Begin your list immediately, one component per line:
- """

        # Tokenize inputs
        inputs = manager.vision_processor(images=image, text=prompt, return_tensors="pt")
        target_dtype = getattr(manager, "vision_compute_dtype", manager.dtype)
        processed_inputs = {k: v.to(manager.device, dtype=torch.long if k in ["input_ids", "attention_mask"] else target_dtype)
                            for k, v in inputs.items()}

        # --- Generate ---
        with torch.no_grad():
            output_ids = manager.vision_model.generate(
                **processed_inputs,
                max_new_tokens=120,
                do_sample=True,
                temperature=0.25,
                top_p=0.85,
                repetition_penalty=1.5,
                no_repeat_ngram_size=2,
                eos_token_id=manager.vision_processor.tokenizer.eos_token_id
            )

        # Decode only the new tokens
        prompt_len = processed_inputs["input_ids"].shape[1]
        generated_text = manager.vision_processor.batch_decode(
            output_ids[:, prompt_len:], skip_special_tokens=True
        )[0]

        # --- Clean generated text ---
        lines = [line.strip("-* ").strip() for line in generated_text.splitlines()]
        lines = [l for l in lines if re.search(r"[A-Za-z0-9]", l) and len(l) < 60]

        summary = "\n".join(lines)
        if not summary.strip():
            summary = "No components identified."

        print(f"--- VISION OUTPUT:\n{summary}")

        response = {"analysis": {"summary": summary}}
        if task == "ar_extraction":
            response.update({"components": summary.splitlines(), "answer": summary})

        return response

    except Exception as e:
        print(f"❌ ERROR in Vision Service: {e}")
        return {"analysis": {"summary": f"Error: {str(e)}"}}
