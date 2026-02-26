


import torch
import os
os.environ['HF_HOME'] = "/dcs/large/u2287990/AI_models"
import logging
from typing import Optional

logger = logging.getLogger(__name__)

class ModelManager:
    def __init__(self):
        self._configure_hardware()
        self._configure_vision()
        self._configure_chat()
        self._initialise_model_refs()
        self.load_models()

    # ============================================================
    # 1. HARDWARE CONFIGURATION
    # ============================================================

    def _configure_hardware(self):
        """Detect and configure available hardware"""
        if torch.cuda.is_available():
            self.device = "cuda"
            self.dtype = torch.float16

            gpu = torch.cuda.get_device_properties(0)
            self.gpu_name = gpu.name
            self.total_vram_gb = gpu.total_memory / (1024 ** 3)
            self.bf16_supported = torch.cuda.is_bf16_supported()

            print(f"🚀 GPU Detected: {self.gpu_name}")
            print(f"   VRAM         : {self.total_vram_gb:.1f} GB")
            print(f"   BF16 Support : {'✅' if self.bf16_supported else '❌'}")
        else:
            self.device = "cpu"
            self.dtype = torch.float32
            self.gpu_name = None
            self.total_vram_gb = 0
            self.bf16_supported = False
            print("⚠️ No GPU detected - Running on CPU")

    # ============================================================
    # 2. VISION MODEL CONFIGURATION
    # ============================================================

    def _configure_vision(self):
        """
        Configure vision model dtype.
        
        Why NO quantization for vision:
        - 4-bit: Causes Half/Char matmul errors on pixel_values tensors
        - 8-bit: Can cause NaN/assertion errors in image preprocessing
        - Safe choice: Native fp16/bf16 on GPU, fp32 on CPU
        """
        if torch.cuda.is_available():
            # bf16 is safer for vision models - avoids NaN issues seen with fp16
            self.vision_compute_dtype = (
                torch.bfloat16 if self.bf16_supported 
                else torch.float16
            )
            self.vision_device_map = "cuda"
        else:
            self.vision_compute_dtype = torch.float32
            self.vision_device_map = "cpu"

        # No quantization for vision - type errors with image tensors
        self.vision_quant_config = None

        print(
            f"👁️  Vision Config  : "
            f"dtype={self.vision_compute_dtype}, "
            f"quantization=None (required for stability)"
        )

    # ============================================================
    # 3. CHAT MODEL CONFIGURATION
    # ============================================================

    def _configure_chat(self):
        """
        Configure chat model with 4-bit quantization on GPU.
        Falls back to full precision on CPU.
        """
        if torch.cuda.is_available():
            self.chat_device = "cuda"
            self.chat_compute_dtype = (
                torch.bfloat16 if self.bf16_supported 
                else torch.float16
            )
            self.chat_quant_config = self._build_4bit_quant_config()
            print(
                f"💬 Chat Config    : "
                f"4-bit quantization, "
                f"dtype={self.chat_compute_dtype}"
            )
        else:
            self.chat_device = "cpu"
            self.chat_compute_dtype = torch.float32
            self.chat_quant_config = None
            print("💬 Chat Config    : Full precision on CPU")

    def _build_4bit_quant_config(self):
        """Build 4-bit quantization config for chat model"""
        from transformers import BitsAndBytesConfig

        compute_dtype = (
            torch.bfloat16 if self.bf16_supported 
            else torch.float16
        )

        return BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=compute_dtype
        )

    # ============================================================
    # 4. MODEL REFERENCES
    # ============================================================

    def _initialise_model_refs(self):
        """Initialise all model references to None"""
        self.vision_model = None
        self.vision_processor = None
        self.chat_model = None
        self.chat_tokenizer = None
        self.ar_model = None
        self.ar_device = "cpu"

    # ============================================================
    # 5. MODEL LOADING
    # ============================================================

    def load_models(self):
        """
        Load all models in order.
        Order matters for VRAM management:
        1. Vision (largest, loads first while VRAM is free)
        2. Chat (4-bit quantized, loads second)
        3. SAM (CPU or GPU depending on remaining VRAM)
        """
        print("\n" + "=" * 55)
        print("  MODEL MANAGER: Loading Models")
        print("=" * 55)

        self._load_vision_model()
        self._clear_cuda_cache()

        self._load_chat_model()
        self._clear_cuda_cache()

        self._load_ar_model()
        self._clear_cuda_cache()

        print("=" * 55)
        self._print_status()
        print("=" * 55 + "\n")

    def _load_vision_model(self):
        """Load Granite Vision model"""
        try:
            from transformers import AutoProcessor, AutoModelForImageTextToText

            print("\n👁️  Loading Granite Vision...")
            self._log_vram("Before vision load")

            vision_path = "ibm-granite/granite-vision-3.3-2b"

            self.vision_processor = AutoProcessor.from_pretrained(vision_path)

            self.vision_model = AutoModelForImageTextToText.from_pretrained(
                vision_path,
                device_map=self.vision_device_map,
                torch_dtype=self.vision_compute_dtype,
                trust_remote_code=True,
                quantization_config=self.vision_quant_config
            )
            self.vision_model.eval()  # Set to eval mode (disables dropout)

            self._log_vram("After vision load")
            print("   ✅ Granite Vision loaded")

        except Exception as e:
            print(f"   ❌ Vision load failed: {e}")
            logger.exception("Vision model load failed")
            self.vision_model = None
            self.vision_processor = None

    def _load_chat_model(self):
        """Load Granite Chat model"""
        try:
            from transformers import AutoModelForCausalLM, AutoTokenizer

            print("\n💬 Loading Granite Chat...")
            self._log_vram("Before chat load")

            chat_path = "ibm-granite/granite-3.1-1b-a400m-instruct"

            # Load tokenizer
            self.chat_tokenizer = AutoTokenizer.from_pretrained(chat_path)
            self.chat_tokenizer.padding_side = "left"

            # Ensure pad token is defined
            if self.chat_tokenizer.pad_token_id is None:
                self.chat_tokenizer.pad_token = self.chat_tokenizer.eos_token

            # Load model
            self.chat_model = AutoModelForCausalLM.from_pretrained(
                chat_path,
                device_map=self.chat_device,
                torch_dtype=self.chat_compute_dtype,
                quantization_config=self.chat_quant_config
            )
            self.chat_model.eval()  # Set to eval mode

            # Sync pad token config
            if self.chat_model.config.pad_token_id is None:
                self.chat_model.config.pad_token_id = self.chat_tokenizer.pad_token_id

            self._log_vram("After chat load")
            print("   ✅ Granite Chat loaded")

        except Exception as e:
            print(f"   ❌ Chat load failed: {e}")
            logger.exception("Chat model load failed")
            self.chat_model = None
            self.chat_tokenizer = None

    def _load_ar_model(self):
        """
        Load SAM2-L model for AR segmentation.
        
        Why SAM2-L over MobileSAM:
        - Significantly better mask quality on structured diagrams
        - Tighter bounding boxes reduce post-processing burden
        - Higher-quality stability/confidence scores
        - Same ultralytics API, no code changes needed downstream
        
        Device strategy:
        - Checks remaining VRAM after vision + chat are loaded
        - If > 2.5GB free: loads on GPU for faster inference
        - Otherwise: loads on CPU to avoid OOM errors
        """
        try:
            from ultralytics import SAM

            print("\n📐 Loading SAM2-L (AR Model)...")
            self._log_vram("Before SAM2 load")

            self.ar_model = SAM('sam2_l.pt')

            # Determine SAM device based on remaining VRAM
            # self.ar_device = self._get_ar_device()
            self.ar_device = "cpu"
            self.ar_model.to(self.ar_device)

            self._log_vram("After SAM2 load")
            print(f"   ✅ SAM2-L loaded on {self.ar_device.upper()}")

        except Exception as e:
            print(f"   ❌ SAM2 load failed: {e}")
            logger.exception("SAM2 model load failed")
            self.ar_model = None
            self.ar_device = "cpu"

    # ============================================================
    # 6. HELPER METHODS
    # ============================================================

    def _get_ar_device(self) -> str:
        """
        Determine best device for SAM based on available VRAM.
        Returns 'cuda' if enough VRAM is free, 'cpu' otherwise.
        """
        if not torch.cuda.is_available():
            return "cpu"

        free_vram_gb = self._get_free_vram_gb()

        # SAM2-L needs ~2.5GB VRAM - use GPU only if enough is free
        if free_vram_gb > 2.5:
            print(f"   💡 {free_vram_gb:.1f}GB VRAM free - Loading SAM on GPU")
            return "cuda"
        else:
            print(f"   💡 {free_vram_gb:.1f}GB VRAM free - Loading SAM on CPU")
            return "cpu"

    def _get_free_vram_gb(self) -> float:
        """Get current free VRAM in GB"""
        if not torch.cuda.is_available():
            return 0.0
        
        free_bytes = torch.cuda.mem_get_info()[0]
        return free_bytes / (1024 ** 3)

    def _get_used_vram_gb(self) -> float:
        """Get current used VRAM in GB"""
        if not torch.cuda.is_available():
            return 0.0
        
        return torch.cuda.memory_allocated() / (1024 ** 3)

    def _clear_cuda_cache(self):
        """Clear CUDA cache to free fragmented memory"""
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def _log_vram(self, label: str = ""):
        """Log current VRAM usage"""
        if not torch.cuda.is_available():
            return

        used = self._get_used_vram_gb()
        free = self._get_free_vram_gb()

        print(
            f"   📊 VRAM [{label}]: "
            f"{used:.1f}GB used / "
            f"{free:.1f}GB free / "
            f"{self.total_vram_gb:.1f}GB total"
        )

    # ============================================================
    # 7. STATUS AND HEALTH
    # ============================================================

    def _print_status(self):
        """Print final model loading status"""
        print("\n📦 MODEL STATUS:")
        print(f"   Vision Model  : {'✅ Loaded' if self.vision_model else '❌ Failed'}")
        print(f"   Chat Model    : {'✅ Loaded' if self.chat_model else '❌ Failed'}")
        print(f"   SAM2-L (AR)   : {'✅ Loaded on ' + self.ar_device.upper() if self.ar_model else '❌ Failed'}")

        if torch.cuda.is_available():
            used = self._get_used_vram_gb()
            free = self._get_free_vram_gb()
            print(f"\n📊 Final VRAM    : {used:.1f}GB used / {free:.1f}GB free")

    def get_status(self) -> dict:
        """
        Return current status of all models.
        Used by health check endpoints.
        """
        status = {
            'vision': {
                'loaded': self.vision_model is not None,
                'processor_loaded': self.vision_processor is not None,
                'dtype': str(self.vision_compute_dtype),
                'device': self.vision_device_map,
                'quantization': 'none'
            },
            'chat': {
                'loaded': self.chat_model is not None,
                'tokenizer_loaded': self.chat_tokenizer is not None,
                'dtype': str(self.chat_compute_dtype),
                'device': self.chat_device,
                'quantization': '4-bit NF4' if self.chat_quant_config else 'none'
            },
            'ar': {
                'loaded': self.ar_model is not None,
                'model': 'SAM2-L',
                'device': self.ar_device
            },
            'hardware': {
                'device': self.device,
                'gpu_name': self.gpu_name,
                'total_vram_gb': round(self.total_vram_gb, 1),
                'free_vram_gb': round(self._get_free_vram_gb(), 1),
                'bf16_supported': self.bf16_supported
            }
        }

        # All models loaded = healthy
        status['all_loaded'] = all([
            self.vision_model is not None,
            self.chat_model is not None,
            self.ar_model is not None
        ])

        return status

    def reload_model(self, model_name: str) -> bool:
        """
        Reload a specific model without restarting the server.
        Useful for recovering from model failures.
        
        Args:
            model_name: 'vision', 'chat', or 'ar'
        
        Returns:
            True if reload succeeded, False otherwise
        """
        self._clear_cuda_cache()

        if model_name == 'vision':
            self._load_vision_model()
            return self.vision_model is not None

        elif model_name == 'chat':
            self._load_chat_model()
            return self.chat_model is not None

        elif model_name == 'ar':
            self._load_ar_model()
            return self.ar_model is not None

        else:
            logger.warning(f"Unknown model name: {model_name}")
            return False


# ============================================================
# SINGLETON INSTANCE
# ============================================================

manager = ModelManager()