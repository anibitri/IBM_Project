# Model Manager Report (`model_manager.py`)

## Overview

`ModelManager` is the backend model lifecycle controller. It detects available hardware, configures compute precision, loads all AI models, tracks their health, and provides runtime control over device placement. All service modules import the singleton `manager` and call model methods through it.

There is one key architectural decision here: the **same model — IBM Granite Vision 3.3-2B — handles both image understanding and text-only chat**. There is no separate language model. This reduces VRAM usage while keeping the full multimodal capability available when needed.

---

## Singleton Instance

```python
manager = ModelManager()   # initialized at import time
```

The constructor immediately detects hardware, configures dtypes, initializes model references to `None`, then loads models (or skips loading in mock mode). All services access models via `manager.vision_model`, `manager.ar_model`, etc.

---

## Hardware Detection — `_configure_hardware`

Priority order: **CUDA → Apple MPS → CPU**

| Hardware   | Device String | Dtype           | Notes                                  |
|------------|---------------|-----------------|----------------------------------------|
| CUDA GPU   | `"cuda"`      | `float16`       | Detects total VRAM, BF16 support       |
| Apple MPS  | `"mps"`       | `float16`       | Unified memory (size not reported)     |
| CPU        | `"cpu"`       | `float32`       | Sets `torch.set_num_threads` to all cores |

On CPU, both `torch.set_num_threads` and `torch.set_num_interop_threads` are configured to maximize utilization across available cores.

---

## Vision Model Configuration — `_configure_vision`

The vision model (Granite Vision 3.3-2B) runs with **no quantization**. This is a deliberate stability choice:
- **4-bit quantization** causes `Half/Char` matmul errors on `pixel_values` tensors from the vision processor.
- **8-bit quantization** can cause NaN propagation or assertion errors during image preprocessing.

The vision model runs in native precision:

| Device | Dtype                                    |
|--------|------------------------------------------|
| CUDA   | `bfloat16` if supported, else `float16`  |
| MPS    | `float16`                                |
| CPU    | `float32`                                |

BF16 is preferred on CUDA because it avoids the NaN overflow risks of FP16 with large activation values in transformer blocks.

---

## Chat — Same Model as Vision

There is no separate chat model. The `_configure_chat` method and chat model references were removed. `granite_ai_service.py` calls `manager.vision_model.generate(...)` with text-only inputs (no `pixel_values`) for text generation tasks. This means:
- Only one model needs to be loaded.
- VRAM savings of ~4 GB compared to loading two separate models.
- Text-only inference uses the same generate path; the model simply ignores the missing image modality.

---

## AR Model Configuration — SAM 2 (Tiny)

The AR service uses **SAM 2 Tiny** (Segment Anything Model 2, smallest variant) via the Ultralytics API. SAM 2 replaces the earlier MobileSAM — it is faster and more accurate on the same hardware using the same API.

`ar_service.py` calls:
```python
manager.ar_model(img_array, device=manager.ar_device, verbose=False)
```

SAM placement is managed dynamically:
- `_load_ar_model` places SAM on GPU if there is adequate free VRAM after loading the vision model.
- If free VRAM is insufficient, SAM is placed on CPU.
- `move_sam_to_cpu()` and `try_restore_sam_to_gpu()` allow runtime migration if VRAM conditions change during inference.

---

## Model Loading — `load_models`

Loading order is chosen to minimize VRAM conflicts:

1. **Vision model** — `_load_vision_model` — loads `ibm-granite/granite-vision-3.3-2b` using `AutoModelForImageTextToText`. On MPS, if loading fails (OOM on smaller unified memory Macs), it automatically retries on CPU.

2. **SAM 2** — `_load_ar_model` — loads via `ultralytics.SAM`. Uses `"sam2_t.pt"` (Tiny variant). Device placement is chosen based on remaining free VRAM after the vision model is loaded.

CUDA cache is cleared between loads to give each model the maximum possible contiguous VRAM.

---

## Key APIs

### `get_status() -> dict`

Returns the current health of all models:
```python
{
  "vision_model": "loaded" | "not_loaded",
  "ar_model": "loaded" | "not_loaded",
  "device": "cuda" | "mps" | "cpu",
  "gpu_name": str | None,
  "total_vram_gb": float,
  "mock_mode": bool
}
```

Used by the `/health` API endpoint to expose model readiness to the frontend.

### `reload_model(model_name: str) -> bool`

Reloads a specific model by name (`"vision"` or `"ar"`). Clears the existing reference, frees VRAM, then re-calls the appropriate load function. Returns `True` on success.

### `move_sam_to_cpu()` / `try_restore_sam_to_gpu()`

Dynamic device migration for the AR model. Useful when a request sequence causes VRAM to spike — SAM can be moved to CPU to free VRAM for the vision model, then restored if conditions improve.

---

## Mock Mode

When `GRANITE_MOCK=1` is set in the environment, `model_manager` sets `self.mock_mode = True` and skips all model loading. Services check `manager.mock_mode` and return hardcoded responses. This allows the full backend to run without GPU hardware for development and testing.

---

## VRAM Logging

`_log_vram(label)` is called before and after each model load. It prints free/total VRAM to help diagnose memory pressure issues during startup.

---

## Key Design Decisions

- **Single model for vision and chat**: Reduces VRAM pressure and simplifies the loading sequence. The vision model handles text-only generation efficiently with `apply_chat_template` and no `pixel_values`.
- **No quantization on vision**: Prevents a class of numerical instability issues that are hard to debug. The 2B parameter count means the unquantized model fits comfortably in 8 GB+ VRAM.
- **SAM 2 Tiny**: The smallest SAM 2 variant provides good component segmentation at low latency. Larger variants improve recall slightly but increase inference time disproportionately for the diagram understanding task.
- **MPS fallback**: Vision model load failure on MPS automatically retries on CPU rather than failing the startup entirely. This makes the backend usable on Macs with less unified memory.

---

## Dependencies

- `torch`
- `transformers` (`AutoProcessor`, `AutoModelForImageTextToText`, `BitsAndBytesConfig`)
- `ultralytics.SAM`
