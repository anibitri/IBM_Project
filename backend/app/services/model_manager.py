import torch
import os
from transformers import (
    AutoModelForCausalLM, 
    AutoTokenizer, 
    AutoProcessor, 
    AutoModelForVision2Seq,
    BitsAndBytesConfig
)
from ultralytics import SAM

class ModelManager:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🚀 Hardware Detected: {self.device.upper()}")
        
        self.vision_model = None
        self.vision_processor = None
        self.chat_model = None
        self.chat_tokenizer = None
        self.ar_model = None
        
        self.load_models()

    def load_models(self):
        print("\n--- MODEL MANAGER: Loading Models (4-bit Mode) ---")
        
        # 4-bit Config
        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_use_double_quant=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_compute_dtype=torch.float16
        )
        
        # 1. Vision Model
        try:
            print("👁️ Loading Granite Vision...")
            vision_path = "ibm-granite/granite-vision-3.1-2b-preview"
            self.vision_processor = AutoProcessor.from_pretrained(vision_path)
            self.vision_model = AutoModelForVision2Seq.from_pretrained(
                vision_path,
                quantization_config=quant_config,
                device_map="auto",
                trust_remote_code=True
            )
        except Exception as e:
            print(f"❌ Vision Load Failed: {e}")

        # 2. Chat Model
        try:
            print("💬 Loading Granite Chat...")
            chat_path = "ibm-granite/granite-3.0-2b-instruct"
            self.chat_tokenizer = AutoTokenizer.from_pretrained(chat_path)
            self.chat_model = AutoModelForCausalLM.from_pretrained(
                chat_path,
                quantization_config=quant_config,
                device_map="auto"
            )
        except Exception as e:
            print(f"❌ Chat Load Failed: {e}")

        # 3. MobileSAM (AR)
        try:
            print("📐 Loading MobileSAM...")
            # Ensure 'mobile_sam.pt' is in your backend folder or root
            self.ar_model = SAM('mobile_sam.pt')
        except Exception as e:
            print(f"❌ MobileSAM Failed: {e}")

manager = ModelManager()