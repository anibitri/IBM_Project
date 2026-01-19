import torch
from PIL import Image
from app.services.model_manager import manager

def analyze_images(image_path):
    """
    Uses the pre-loaded Quantized/Float16 Granite Vision model from RAM.
    """
    # Is the model loaded?
    if not manager.vision_model or not manager.vision_processor:
        return {
            "analysis": {
                "summary": "Error: Vision Model not loaded in ModelManager."
            }
        }

    try:
        print(f"--- VISION SERVICE: Processing {image_path} ---")
        
        # Load Image
        image = Image.open(image_path).convert("RGB")
        
        # Prepare Inputs (The "Processor" handles resizing/normalization)
        prompt = "Describe the technical diagram in detail, focusing on components like pumps and valves."
        
        inputs = manager.vision_processor(
            images=image, 
            text=prompt, 
            return_tensors="pt"
        ).to(manager.device) # <--- CRITICAL: Move input to GPU/MPS

        # 4. Generate Response (Inference)
        with torch.no_grad():
            output_ids = manager.vision_model.generate(
                **inputs,
                max_new_tokens=200,
                do_sample=True,      
                temperature=0.7,     
                top_p=0.9
            )

        #Decode Response 
        generated_text = manager.vision_processor.batch_decode(
            output_ids, 
            skip_special_tokens=True
        )[0]

        # Clean up the output (sometimes model repeats the prompt)
        if generated_text.startswith(prompt):
            generated_text = generated_text[len(prompt):].strip()

        print("--- VISION SERVICE: Success ---")
        
        return {
            "analysis": {
                "summary": generated_text
            }
        }

    except Exception as e:
        print(f"❌ ERROR in Vision Service: {e}")
        return {
            "analysis": {
                "summary": f"Error analyzing image: {str(e)}"
            }
        }