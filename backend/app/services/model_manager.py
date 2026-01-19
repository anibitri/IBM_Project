import os
import torch
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
        self.device = self._get_device()
        self.vision_model = None
        self.vision_processor = None
        self.chat_model = None
        self.chat_tokenizer = None
        self.ar_model = None
        
        # Load immediately on init
        self.load_models()

    def _get_device(self):
        """Auto-detects the best hardware (CUDA -> MPS -> CPU)"""
        if torch.cuda.is_available():
            print("🚀 Hardware: NVIDIA GPU (CUDA) detected.")
            return "cuda"
        elif torch.backends.mps.is_available():
            print("🍎 Hardware: Apple Silicon (MPS) detected.")
            return "mps"
        else:
            print("⚠️ Hardware: CPU only. Inference will be slow.")
            return "cpu"

    def _get_quantization_config(self):
        """
        Creates a 4-bit config for NVIDIA GPUs.
        Returns None for Mac/CPU (falls back to float16).
        """
        if self.device == "cuda":
            return BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.float16
            )
        return None

    def load_models(self):
        print("\n--- MODEL MANAGER: Loading Local Models ---")
        quant_config = self._get_quantization_config()
        
        # --- 1. Load Granite Vision (Quantized) ---
        print("👁️ Loading Granite Vision...")
        try:
            vision_path = "ibm-granite/granite-vision-3.1-2b-preview"
            
            self.vision_processor = AutoProcessor.from_pretrained(vision_path)
            
            # Determine loading strategy based on hardware
            if self.device == "cuda":
                # 4-bit Quantization (Linux/Windows NVIDIA)
                self.vision_model = AutoModelForVision2Seq.from_pretrained(
                    vision_path,
                    quantization_config=quant_config,
                    device_map="auto",
                    trust_remote_code=True
                )
            else:
                # Half-Precision (Mac/CPU) - Saves 50% RAM
                self.vision_model = AutoModelForVision2Seq.from_pretrained(
                    vision_path,
                    torch_dtype=torch.float16,
                    trust_remote_code=True
                ).to(self.device)
                
            print("✅ Vision Model Loaded.")
        except Exception as e:
            print(f"❌ Failed to load Vision Model: {e}")

        # --- 2. Load Granite Chat (Quantized) ---
        print("💬 Loading Granite Chat...")
        try:
            chat_path = "ibm-granite/granite-3.0-2b-instruct" # Using 2B for speed
            
            self.chat_tokenizer = AutoTokenizer.from_pretrained(chat_path)
            
            if self.device == "cuda":
                self.chat_model = AutoModelForCausalLM.from_pretrained(
                    chat_path,
                    quantization_config=quant_config,
                    device_map="auto"
                )
            else:
                self.chat_model = AutoModelForCausalLM.from_pretrained(
                    chat_path,
                    torch_dtype=torch.float16
                ).to(self.device)
                
            print("✅ Chat Model Loaded.")
        except Exception as e:
            print(f"❌ Failed to load Chat Model: {e}")

        # --- 3. Load MobileSAM (Standard) ---
        print("📐 Loading MobileSAM (AR)...")
        try:
            # We assume the file is in 'services/mobile_sam.pt' or downloaded automatically
            self.ar_model = SAM('mobile_sam.pt')
            print("✅ MobileSAM Loaded.")
        except Exception as e:
            print(f"❌ Failed to load MobileSAM: {e}")

manager = ModelManager()