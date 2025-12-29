import torch
from PIL import Image
import re
import gc
from app.services.model_manager import manager

def _clean_output(text):
    if not text: return ""
    patterns = [
        r"<\|system\|>.*?<\|user\|>", 
        r"<\|user\|>.*?<\|assistant\|>", 
        r"<\|assistant\|>",
        r"^Sure, here is.*?:", 
        r"^Here is.*?:", 
        r"^The image shows"
    ]
    cleaned = text
    for p in patterns:
        cleaned = re.sub(p, "", cleaned, flags=re.IGNORECASE | re.DOTALL).strip()
    return cleaned

def analyze_images(image_path, task=None, **kwargs):
    try:
        if isinstance(image_path, list):
            image_path = image_path[0] if image_path else ""

        if isinstance(image_path, str):
            image = Image.open(image_path).convert("RGB")
        elif isinstance(image_path, Image.Image):
            image = image_path.convert("RGB")
        else:
            return {"status": "error", "message": "Invalid input"}

        # 1. PREPARE INPUTS
        print("INFO: Processing image inputs...")
        model, processor, device = manager.get_vision_model()
        
        user_prompt = "Describe the geometric shapes, labels, and connections in this image."
        conversation = [{"role": "user", "content": [{"type": "image"}, {"type": "text", "text": user_prompt}]}]
        
        text_prompt = processor.apply_chat_template(conversation, add_generation_prompt=True)
        inputs = processor(images=[image], text=[text_prompt], return_tensors="pt").to(device)

        # 2. GENERATE (CRITICAL SECTION)
        print("INFO: Waiting for GPU Lock...")
        output_tokens = None
        
        with manager.gpu_lock:
            try:
                print("INFO: GPU Lock Acquired. Running Inference...")
                
                # Double check memory before starting
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                
                output_tokens = model.generate(**inputs, max_new_tokens=200, do_sample=False)
                
                # Move result to CPU immediately
                output_tokens = output_tokens.to("cpu")
                
            finally:
                # --- THE FIX: FORCE CLEANUP BEFORE RELEASING LOCK ---
                print("INFO: Inference done. Flushing GPU memory...")
                # Delete the inputs from GPU
                del inputs
                
                # Force Python to trash the variables
                gc.collect()
                
                # Force PyTorch to release VRAM back to OS
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                # ----------------------------------------------------

        print("INFO: Lock released. Decoding...")
        
        # 3. DECODE (Safe on CPU)
        if output_tokens is not None:
            raw_text = processor.decode(output_tokens[0], skip_special_tokens=True)
            final_summary = _clean_output(raw_text)
            return {"status": "ok", "analysis": {"summary": final_summary}}
        else:
            return {"status": "error", "message": "No output generated", "analysis": {"summary": "Error."}}

    except Exception as e:
        print(f"ERROR in Vision Service: {e}")
        # Emergency cleanup just in case
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        return {"status": "error", "message": str(e), "analysis": {"summary": "Error."}}