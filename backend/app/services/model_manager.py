import torch
import os
os.environ['HF_HOME'] = "/dcs/large/u2287990/AI_models"
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
        if torch.cuda.is_available():
            self.device = "cuda"
            self.dtype = torch.float16
            print(f"🚀 Hardware Detected: {self.device.upper()}")
        else:
            self.device = "cpu"
            self.dtype = torch.float32
            print(f"🚀 Hardware Detected: {self.device.upper()}")
        
        self.vision_model = None
        self.vision_processor = None
        self.chat_model = None
        self.chat_tokenizer = None
        self.ar_model = None

        
        self.load_models()

    def load_models(self):
        print("\n--- MODEL MANAGER: Loading Models (4-bit Mode) ---")


        # 1. Vision Model
        try:
            print("👁️ Loading Granite Vision...")
            vision_path = "ibm-granite/granite-vision-3.1-2b-preview"
            self.vision_processor = AutoProcessor.from_pretrained(vision_path)

            self.vision_model = AutoModelForVision2Seq.from_pretrained(
                vision_path,
                device_map="cuda",
                torch_dtype=self.dtype,
                trust_remote_code=True
            )

        except Exception as e:
            print(f"❌ Vision Load Failed: {e}")

        # 2. Chat Model
        try:
            print("💬 Loading Granite Chat...")
            chat_path = "ibm-granite/granite-3.1-1b-a400m-instruct"
            self.chat_tokenizer = AutoTokenizer.from_pretrained(chat_path)
            self.chat_model = AutoModelForCausalLM.from_pretrained(
                chat_path,
                device_map="cpu"
            )
        except Exception as e:
            print(f"❌ Chat Load Failed: {e}")

        # 3. MobileSAM (AR)
        try:
            print("📐 Loading MobileSAM...")
            # Ensure 'mobile_sam.pt' is in your backend folder or root
            self.ar_model = SAM('sam2_l.pt')
            self.ar_model.to("cuda" if torch.cuda.is_available() else "cpu")
        except Exception as e:
            print(f"❌ MobileSAM Failed: {e}")

manager = ModelManager()