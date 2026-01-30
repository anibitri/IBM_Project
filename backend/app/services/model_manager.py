import torch
import os
os.environ['HF_HOME'] = "/dcs/large/u2287990/AI_models"
from transformers import (
    AutoModelForCausalLM, 
    AutoTokenizer, 
    AutoProcessor, 
    AutoModelForImageTextToText,
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
        
        # Configure Chat Model
        # Strategy: If GPU is available, use 4-bit quantization to save VRAM and keep tensors on GPU.
        # If GPU missing, forced to CPU standard precision.
        if torch.cuda.is_available():
            print("🚀 Chat Model: enabling 4-bit quantization on CUDA")
            self.chat_device = "cuda"
            self.chat_quant_config = self._build_4bit_quant_config()
            self.chat_compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        else:
            print("⚠️ Chat Model: CUDA unavailable. Loading on CPU (Full Precision).")
            self.chat_device = "cpu"
            self.chat_quant_config = None
            self.chat_compute_dtype = torch.float32

        self.vision_quant_config = None  # keep vision in fp16 to avoid Half/Char matmul issues
        
        # Determine safest dtype for Vision (prevents NaN asserts)
        if torch.cuda.is_available():
            if torch.cuda.is_bf16_supported():
                self.vision_compute_dtype = torch.bfloat16
            else:
                self.vision_compute_dtype = torch.float16
        else:
            self.vision_compute_dtype = torch.float32

        self.vision_model = None
        self.vision_processor = None
        self.chat_model = None
        self.chat_tokenizer = None
        self.ar_model = None

        
        self.load_models()

    def _build_4bit_quant_config(self):
        # Dynamically select support compute dtype
        compute_dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16

        return BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=compute_dtype
        )

    def load_models(self):
        print("\n--- MODEL MANAGER: Loading Models (Standard Precision) ---")


        # 1. Vision Model
        try:
            print("👁️ Loading Granite Vision...")
            vision_path = "ibm-granite/granite-vision-3.3-2b"
            self.vision_processor = AutoProcessor.from_pretrained(vision_path)

            self.vision_model = AutoModelForImageTextToText.from_pretrained(
                vision_path,
                device_map="cuda" if torch.cuda.is_available() else self.device,
                torch_dtype=self.vision_compute_dtype,
                trust_remote_code=True,
                quantization_config=self.vision_quant_config
            )

        except Exception as e:
            print(f"❌ Vision Load Failed: {e}")

        # 2. Chat Model
        try:
            print("💬 Loading Granite Chat...")
            chat_path = "ibm-granite/granite-3.1-1b-a400m-instruct"
            self.chat_tokenizer = AutoTokenizer.from_pretrained(chat_path)
            # Ensure padding is defined to avoid attention mask inference warnings.
            self.chat_tokenizer.padding_side = "left"
            if self.chat_tokenizer.pad_token_id is None:
                self.chat_tokenizer.pad_token = self.chat_tokenizer.eos_token
            self.chat_model = AutoModelForCausalLM.from_pretrained(
                chat_path,
                device_map=self.chat_device,
                torch_dtype=self.chat_compute_dtype,
                quantization_config=self.chat_quant_config # This is now None
            )
            if self.chat_model.config.pad_token_id is None:
                self.chat_model.config.pad_token_id = self.chat_tokenizer.pad_token_id
        except Exception as e:
            print(f"❌ Chat Load Failed: {e}")

        # 3. MobileSAM (AR)
        try:
            print("📐 Loading MobileSAM...")
            # Ensure 'mobile_sam.pt' is in your backend folder or root
            self.ar_model = SAM('sam2_l.pt')
            # Prefer GPU for SAM to speed up AR while chat stays on CPU to free VRAM.
            self.ar_model.to("cpu")
        except Exception as e:
            print(f"❌ MobileSAM Failed: {e}")

manager = ModelManager()