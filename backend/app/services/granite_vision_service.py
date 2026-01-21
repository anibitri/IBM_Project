import torch
from PIL import Image
from app.services.model_manager import manager

def analyze_images(input_data, task=None):
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
        if task == "ar_extraction":
            prompt = "Locate all technical components like pumps, valves, and sensors. List them."
        else:
            prompt = "Describe the technical diagram in detail, focusing on components like pumps and valves."

        # 3. Process
        inputs = manager.vision_processor(
            images=image, 
            text=prompt, 
            return_tensors="pt"
        ).to(manager.device)

        with torch.no_grad():
            output_ids = manager.vision_model.generate(
                **inputs,
                max_new_tokens=200,
                do_sample=True,      
                temperature=0.7,     
                top_p=0.9
            )

        generated_text = manager.vision_processor.batch_decode(
            output_ids, 
            skip_special_tokens=True
        )[0]

        # Clean Prompt Echo
        if generated_text.startswith(prompt):
            generated_text = generated_text[len(prompt):].strip()

        # 4. Return Format
        # If AR Extraction was requested, we return the text in 'answer' 
        # (Real implementation would parse coords, but text summary works for now)
        if task == "ar_extraction":
            return {
                "components": [], # Placeholder for actual parsed boxes
                "answer": generated_text
            }

        return {
            "analysis": {
                "summary": generated_text
            }
        }

    except Exception as e:
        print(f"❌ ERROR in Vision Service: {e}")
        return {"analysis": {"summary": f"Error: {str(e)}"}}