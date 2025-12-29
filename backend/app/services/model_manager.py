import torch
from transformers import AutoModelForImageTextToText, AutoModelForCausalLM, AutoProcessor, AutoTokenizer
import os
import shutil
import gc
import threading 

VISION_MODEL_ID = "ibm-granite/granite-vision-3.1-2b-preview"
CHAT_MODEL_ID = "ibm-granite/granite-3.1-1b-a400m-instruct"

class ModelManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ModelManager, cls).__new__(cls)
            cls._instance.init_models()
        return cls._instance

    def init_models(self):
        print("--- MODEL MANAGER: Vision-First + Strict Limits ---")
        
        self.gpu_lock = threading.Lock() 

        gc.collect()
        torch.cuda.empty_cache()

        offload_dir = os.path.join(os.getcwd(), "model_offload")
        if not os.path.exists(offload_dir):
            os.makedirs(offload_dir)

        print(f"Loading Vision Model ({VISION_MODEL_ID})...")
        try:
            self.vision_processor = AutoProcessor.from_pretrained(
                VISION_MODEL_ID, 
                use_fast=True 
            )
            
            self.vision_model = AutoModelForImageTextToText.from_pretrained(
                VISION_MODEL_ID, 
                dtype=torch.float16, 
                low_cpu_mem_usage=True, 
                trust_remote_code=True,
                device_map="auto",
                offload_folder=offload_dir,
                # --- THE CRITICAL FIX ---
                # Your previous logs crashed because 4.5GB was too high.
                # We lower it to 2.0GB to leave room for the calculation.
                max_memory={0: "2.0GiB", "cpu": "12GiB"} 
                # ------------------------
            )
            print("SUCCESS: Vision Model Loaded.")
        except Exception as e:
            print(f"CRITICAL FAIL: Vision Model crashed: {e}")

        print(f"Loading Chat Model ({CHAT_MODEL_ID}) to CPU...")
        try:
            self.chat_tokenizer = AutoTokenizer.from_pretrained(CHAT_MODEL_ID, use_fast=True)
            self.chat_model = AutoModelForCausalLM.from_pretrained(
                CHAT_MODEL_ID, 
                dtype=torch.float32, 
                low_cpu_mem_usage=True
            ).to("cpu")
            print("SUCCESS: Chat Model Loaded.")
        except Exception as e:
             print(f"CRITICAL FAIL: Chat Model crashed: {e}")

        print("--- Models Ready. ---")

    def get_vision_model(self):
        return self.vision_model, self.vision_processor, self.vision_model.device

    def get_chat_model(self):
        return self.chat_model, self.chat_tokenizer, "cpu"

manager = ModelManager()