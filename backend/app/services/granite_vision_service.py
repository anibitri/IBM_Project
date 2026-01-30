import torch
import re
from PIL import Image
from app.services.model_manager import manager

def _truncate_summary(text: str, max_chars: int = 220) -> str:
    return text[:max_chars].rstrip()

def _clean_generated_text(text: str, prompt: str, base_prompt: str) -> str:
    """Remove prompt echoes and collapse repeated tokens."""
    cleaned = (
        text.replace(prompt, "")
            .replace(base_prompt, "")
            .replace("<image>", "")
            .strip()
    )
    # Remove long digit sequences and repeated filler tokens
    cleaned = re.sub(r"\b\d{4,}\b", "", cleaned)
    cleaned = re.sub(r"(Chat|Res|Blue|There|I|The)(?:\s+\1){2,}", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(?:I'm sorry[,\s]*){2,}", "I'm sorry ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(?:\bI\b[\s,;:.]*){3,}", "I ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(\b\w{3,}\b)(?:\s*\1){3,}", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(\w{3,})(?:\1){3,}", r"\1", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" .,:;")
    cleaned = _truncate_summary(cleaned)
    return cleaned or "No description generated."

def analyze_images(input_data, task="ar_extraction"):
    """
    Uses the pre-loaded Quantized/Float16 Granite Vision model.
    
    Args:
        input_data: Can be a file path (str) OR a list containing a PIL Image (from upload_route).
        task: If "ar_extraction", prompts for component locations.
    """
    if not manager.vision_model or not manager.vision_processor:
        return {"analysis": {"summary": "Error: Vision Model not loaded."}}

    try:
        # 1. Handle Input (Path vs PIL List)
        image = None
        path_str = "InMemoryImage"
        
        if isinstance(input_data, str):
            image = Image.open(input_data).convert("RGB")
            path_str = input_data
        elif isinstance(input_data, list) and len(input_data) > 0:
            image = input_data[0]
            
        if not image:
            return {"error": "Invalid input to analyze_images"}

        print(f"--- VISION SERVICE: Processing {path_str} [Task: {task}] ---")
        
        # 2. Select Prompt
        base_prompt = "Describe the technical diagram in detail, focusing on components."
        if task == "ar_extraction":
            base_prompt = "Locate all technical components. List them."

        prompt = f"<image>\n{base_prompt}"
        print(f"--- VISION PROMPT SENT ---\n{prompt}\n---------------------------")
        # 3. Process
        inputs = manager.vision_processor(
            images=image, 
            text=prompt, 
            return_tensors="pt",
            return_dict=True,
            tokenize=True
        ).to(device=manager.device)


        with torch.no_grad():
            output_ids = manager.vision_model.generate(
                **inputs,
                max_new_tokens=256,
                temperature=0.1,
                do_sample=True,
                top_p=0.9,
                repetition_penalty=1.35,
                no_repeat_ngram_size=6,
                eos_token_id=manager.vision_processor.tokenizer.eos_token_id
            )

        generated_text = manager.vision_processor.batch_decode(
            output_ids, 
            skip_special_tokens=True
        )[0]

        generated_text = _clean_generated_text(generated_text, prompt, base_prompt)
        if not generated_text:
            generated_text = "No summary generated."

        # 4. Return Format
        # Always provide an analysis summary for consistency with callers.
        response = {
            "analysis": {
                "summary": generated_text or "No summary generated."
            }
        }

        # For AR extraction, also return components/answer payload.
        if task == "ar_extraction":
            response.update({
                "components": [], # Placeholder for parsed boxes
                "answer": generated_text or "No summary generated."
            })

        return response

    except Exception as e:
        print(f"❌ ERROR in Vision Service: {e}")
        return {"analysis": {"summary": "No summary generated."}}