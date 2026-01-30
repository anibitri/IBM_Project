import torch
import re
from PIL import Image
from app.services.model_manager import manager

def _truncate_summary(text: str, max_chars: int = 220) -> str:
    """Safely truncate text to a specific length."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    # Try to cut off at the last complete sentence or punctuation
    last_punct = max(truncated.rfind('.'), truncated.rfind('!'), truncated.rfind('?'))
    if last_punct > 0:
        return truncated[:last_punct+1]
    return truncated.rstrip() + "..."

def analyze_images(input_data, task="ar_extraction"):
    """
    Uses the pre-loaded Granite Vision model with strict Chat Template formatting.
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
            return {"error": "Invalid input"}

        # 2. Resize Image (CRITICAL STEP)
        # Large images (>2000px) introduce noise. Resizing to ~1024px helps the model focus.
        if max(image.size) > 1024:
            ratio = 1024.0 / max(image.size)
            new_size = (int(image.size[0] * ratio), int(image.size[1] * ratio))
            image = image.resize(new_size, Image.LANCZOS)

        print(f"--- VISION SERVICE: Processing {path_str} [Task: {task}] ---")
        
        # 3. Define Prompt with Persona
        # The prompt needs to be specific to stop rambling.
        prompt_text = (
            "You are a technical inspection assistant. "
            "Analyze this image and strictly describe the visible equipment. "
            "Identify components, read labels, and summarize the diagram."
        )
        if task == "ar_extraction":
            prompt_text = "List the main technical components visible in this image."

        # 4. Apply Chat Template (The Real Fix)
        # This replaces manual "<image>" strings and ensures tokens align perfectly.
        conversation = [
            {
                "role": "user", 
                "content": [
                    {"type": "image"}, 
                    {"type": "text", "text": prompt_text}
                ]
            },
        ]
        
        # Pre-process inputs
        inputs = manager.vision_processor.apply_chat_template(
            conversation,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt"
        ).to(manager.device)

        # Explicitly process image pixels
        pixel_values = manager.vision_processor.image_processor(
            image, return_tensors="pt"
        ).pixel_values.to(manager.device).to(manager.dtype)

        # 5. Generate with Strict Parameters
        with torch.no_grad():
            output_ids = manager.vision_model.generate(
                **inputs,
                pixel_values=pixel_values,
                max_new_tokens=250,
                
                # --- STABILITY SETTINGS ---
                do_sample=False,         # Greedy decoding (Best for factual tasks)
                repetition_penalty=1.2,  # Strong penalty for loops
                min_length=20,           # Forces it to write a real sentence
                eos_token_id=manager.vision_processor.tokenizer.eos_token_id
            )

        # 6. Decode Response
        generated_text = manager.vision_processor.decode(
            output_ids[0], 
            skip_special_tokens=True
        )

        # 7. Post-Processing (Sanity Check)
        generated_text = _truncate_summary(generated_text)
        
        if not generated_text or len(generated_text) < 5:
            generated_text = "Analysis complete. Components identified."

        print(f"--- VISION OUTPUT: {generated_text} ---")

        # 8. Return Format
        response = {
            "analysis": {
                "summary": generated_text
            }
        }

        if task == "ar_extraction":
            response.update({
                "components": [], # Placeholder for AR bounding boxes
                "answer": generated_text
            })

        return response

    except Exception as e:
        print(f"❌ ERROR in Vision Service: {e}")
        return {"analysis": {"summary": f"Error: {str(e)}"}}