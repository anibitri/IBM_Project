


import torch
import os
# os.environ['HF_HOME'] = "/dcs/large/u2287990/AI_models"
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# IBM Granite Vision model — used for BOTH vision analysis and text chat
VISION_MODEL_ID = "ibm-granite/granite-vision-3.3-2b"

class ModelManager:
    def __init__(self):
        self.mock_mode = os.environ.get("GRANITE_MOCK") == "1"
        self._configure_hardware()
        self._configure_vision()
        self._initialise_model_refs()
        if self.mock_mode:
            print("🧪 GRANITE_MOCK=1 detected - skipping model loading")
        else:
            self.load_models()

    # ============================================================
    # 1. HARDWARE CONFIGURATION
    # ============================================================

    def _configure_hardware(self):
        """Detect and configure available hardware. Priority: CUDA → MPS → CPU"""
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

        elif torch.backends.mps.is_available():
            self.device = "mps"
            self.dtype = torch.float16
            self.gpu_name = "Apple MPS"
            self.total_vram_gb = 0      # unified memory — not separately reported
            self.bf16_supported = False  # MPS does not support bfloat16
            print("🍎 Apple MPS detected - Running on GPU (Metal)")

        else:
            self.device = "cpu"
            self.dtype = torch.float32
            self.gpu_name = None
            self.total_vram_gb = 0
            self.bf16_supported = False
            # Use all available CPU cores for inference
            cpu_cores = os.cpu_count() or 4
            torch.set_num_threads(cpu_cores)
            torch.set_num_interop_threads(max(1, cpu_cores // 2))
            print(f"⚠️ No GPU detected - Running on CPU ({cpu_cores} threads)")

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
        if self.device == "cuda":
            # bf16 is safer for vision models - avoids NaN issues seen with fp16
            self.vision_compute_dtype = (
                torch.bfloat16 if self.bf16_supported
                else torch.float16
            )
            self.vision_device_map = "cuda"
        elif self.device == "mps":
            # Try MPS first — on 16GB+ unified memory Macs this works and is
            # 5-10x faster than CPU. Falls back to CPU in _load_vision_model if OOM.
            self.vision_compute_dtype = torch.float16
            self.vision_device_map = "mps"
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
        self.ar_model = None
        self.ar_device = "cpu"
        # No separate chat model — vision model handles both vision and text tasks

    # ============================================================
    # 5. MODEL LOADING
    # ============================================================

    def load_models(self):
        """
        Load models. Vision model handles both vision analysis and text chat.
        AR model (MobileSAM) is loaded separately for component detection.
        """
        print("\n" + "=" * 55)
        print("  MODEL MANAGER: Loading Models")
        print("=" * 55)

        self._load_vision_model()
        self._clear_cuda_cache()
        self._load_ar_model()
        self._clear_cuda_cache()
        self._print_status()

    def _load_vision_model(self):
        """
        Load IBM Granite Vision model (LLaVA-Next architecture).
        Used for BOTH image analysis and text-only chat generation.
        """
        try:
            from transformers import AutoProcessor, AutoModelForImageTextToText
            print(f"\n👁️  Loading Vision Model: {VISION_MODEL_ID}...")
            self._log_vram("Before vision load")

            self.vision_processor = AutoProcessor.from_pretrained(
                VISION_MODEL_ID,
                trust_remote_code=True,
            )
            self.vision_model = AutoModelForImageTextToText.from_pretrained(
                VISION_MODEL_ID,
                device_map=self.vision_device_map,
                dtype=self.vision_compute_dtype,
                trust_remote_code=True,
            )
            self.vision_model.eval()

            self._log_vram("After vision load")
            print(f"   ✅ Vision model loaded on {self.vision_device_map.upper()}")
        except Exception as e:
            if self.vision_device_map == "mps":
                print(f"   ⚠️ MPS load failed ({e}) — retrying on CPU...")
                self.vision_compute_dtype = torch.float32
                self.vision_device_map = "cpu"
                try:
                    self.vision_model = AutoModelForImageTextToText.from_pretrained(
                        VISION_MODEL_ID,
                        device_map="cpu",
                        dtype=torch.float32,
                        trust_remote_code=True,
                    )
                    self.vision_model.eval()
                    print("   ✅ Vision model loaded on CPU (fallback)")
                    return
                except Exception as e2:
                    print(f"   ❌ CPU fallback also failed: {e2}")
            else:
                print(f"   ❌ Vision model load failed: {e}")
            logger.exception("Vision model load failed")
            self.vision_model = None
            self.vision_processor = None

    def _load_ar_model(self):
        """
        Load SAM 2 (Tiny) for AR component detection.
        SAM 2 is faster and more accurate than MobileSAM with the same ultralytics API.
        ar_service.py calls: manager.ar_model(img_array, device=manager.ar_device, ...)
        """
        try:
            from ultralytics import SAM
            print("\n🎯 Loading SAM 2 (AR Model)...")
            self._log_vram("Before SAM 2 load")

            self.ar_device = self._get_ar_device()
            self.ar_model = SAM("sam2_t.pt")

            self._log_vram("After SAM 2 load")
            print(f"   ✅ SAM 2 loaded on {self.ar_device.upper()}")
        except Exception as e:
            print(f"   ❌ SAM 2 load failed: {e}")
            logger.exception("SAM 2 load failed")
            self.ar_model = None
            self.ar_device = "cpu"

    # ============================================================
    # 6. HELPER METHODS
    # ============================================================

    def _get_ar_device(self) -> str:
        """
        Determine best device for SAM 2 based on available hardware.
        Priority: CUDA (with free VRAM check) → MPS → CPU
        """
        if torch.cuda.is_available():
            free_vram_gb = self._get_free_vram_gb()
            if free_vram_gb > 0.5:
                print(f"   💡 {free_vram_gb:.1f}GB VRAM free — SAM 2 on CUDA")
                return "cuda"
            else:
                print(f"   💡 {free_vram_gb:.1f}GB VRAM free — SAM 2 falling back to CPU")
                return "cpu"
        if torch.backends.mps.is_available():
            print("   💡 SAM 2 on MPS")
            return "mps"
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

    def move_sam_to_cpu(self):
        """Move SAM model to CPU after an OOM error."""
        if self.ar_model is not None and self.ar_device != "cpu":
            print("   🔄 Moving SAM to CPU due to OOM...")
            self._clear_cuda_cache()
            self.ar_model.to("cpu")
            self.ar_device = "cpu"
            self._clear_cuda_cache()
            print("   ✅ SAM now running on CPU")

    def try_restore_sam_to_gpu(self):
        """Move SAM back to GPU if at least 3 GB VRAM is free."""
        if (self.ar_model is not None
                and self.ar_device == "cpu"
                and torch.cuda.is_available()):
            free_gb = self._get_free_vram_gb()
            if free_gb >= 3.0:
                try:
                    self.ar_model.to("cuda")
                    self.ar_device = "cuda"
                    print(f"   ✅ SAM restored to GPU ({free_gb:.1f}GB free)")
                except Exception as e:
                    print(f"   ⚠️ Failed to restore SAM to GPU: {e}")
                    self.ar_model.to("cpu")
                    self.ar_device = "cpu"

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
        print(f"   Vision Model  : {'✅ Loaded' if self.vision_model else '❌ Failed'} (handles vision + chat)")
        if self.ar_model:
            print(f"   SAM 2 (AR)    : ✅ Loaded on {self.ar_device.upper()}")
        else:
            print("   SAM 2 (AR)    : ❌ Failed")

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
            'mock_mode': self.mock_mode,
            'vision': {
                'loaded': self.vision_model is not None,
                'processor_loaded': self.vision_processor is not None,
                'model_id': VISION_MODEL_ID,
                'dtype': str(self.vision_compute_dtype),
                'device': self.vision_device_map,
                'note': 'handles both vision analysis and text chat'
            },
            'ar': {
                'loaded': self.ar_model is not None,
                'model': 'SAM2-Tiny',
                'device': self.ar_device
            },
            'hardware': {
                'device': self.device,
                'gpu_name': self.gpu_name,
                'total_vram_gb': round(self.total_vram_gb, 1),
                'free_vram_gb': round(self._get_free_vram_gb(), 1) if self.device == 'cuda' else None,
                'bf16_supported': self.bf16_supported
            }
        }

        # Healthy = mock mode OR vision model loaded
        status['all_loaded'] = self.mock_mode or (self.vision_model is not None)

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