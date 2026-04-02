# Model Manager Report (`model_manager.py`)

## Overview

`ModelManager` is the backend model lifecycle controller. It detects available hardware, configures compute precision, loads all AI models, tracks their health, and provides runtime control over device placement and GPU memory cleanup. All service modules import the singleton `manager` and call model methods through it.

There is one key architectural decision here: the **same model — IBM Granite Vision 3.3-2B — handles both image understanding and text-only chat**. There is no separate language model. This reduces VRAM usage while keeping the full multimodal capability available when needed.

---

## Singleton Instance

```python
manager = ModelManager()   # initialized at import time
```

The constructor immediately detects hardware, configures dtypes, initializes model references to `None`, configures the GPU cleanup policy, then loads models (or skips loading in mock mode). All services access models via `manager.vision_model`, `manager.ar_model`, etc.

---

## Environment Setup

At import time, `model_manager.py` sets two environment variables before any PyTorch imports:

```python
os.environ['HF_HOME'] = "/dcs/large/u2287990/AI_models"
os.environ.setdefault('PYTORCH_CUDA_ALLOC_CONF', 'expandable_segments:True')
```

- `HF_HOME` points to the shared model cache on large storage rather than the home directory.
- `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` enables CUDA's expandable segment allocator, which significantly reduces fragmentation when allocation patterns vary between inference passes (e.g., text-only vs. vision+text).

`run.py` also sets `PYTORCH_CUDA_ALLOC_CONF` as a safety net for cases where `model_manager` is not the first import.

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

There is no separate chat model. `granite_ai_service.py` calls `manager.vision_model.generate(...)` with text-only inputs (no `pixel_values`) for text generation tasks. This means:
- Only one model needs to be loaded.
- VRAM savings of ~4 GB compared to loading two separate models.
- Text-only inference uses the same generate path; the model simply ignores the missing image modality.

---

## AR Model Configuration — SAM 2 Large

The AR service uses **SAM 2 Large** (`sam2_l.pt`) via the Ultralytics API. SAM 2 replaces the earlier MobileSAM — it is more accurate than the previous Tiny variant at the cost of slightly higher VRAM usage and inference time.

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

2. **SAM 2 Large** — `_load_ar_model` — loads via `ultralytics.SAM("sam2_l.pt")`. Device placement is chosen based on remaining free VRAM after the vision model is loaded.

CUDA cache is cleared between loads to give each model the maximum possible contiguous VRAM.

---

## Adaptive GPU Cleanup Policy

The cleanup policy is configured by `_configure_cleanup_policy` at construction time. All thresholds are configurable via environment variables:

| Env Var                      | Default | Meaning                                                   |
|------------------------------|---------|-----------------------------------------------------------|
| `GPU_CLEANUP_LOW_VRAM_GB`    | 1.5     | Trigger pre-inference cleanup if free VRAM < this        |
| `GPU_CLEANUP_POST_LOW_VRAM_GB` | 2.5   | Trigger post-inference cleanup if free VRAM < this       |
| `GPU_CLEANUP_HIGH_ALLOC_RATIO` | 0.80  | Trigger post-inference cleanup if allocated ratio > this |
| `GPU_CLEANUP_MIN_INTERVAL_S` | 2.0     | Minimum seconds between adaptive cleanups (avoid churn) |
| `GPU_CLEANUP_MAX_INTERVAL_S` | 45.0    | Force periodic cleanup even under low pressure           |

### `between_requests_cleanup()`

Frees fragmented / intermediate CUDA memory between inference requests **without unloading model weights**. Calls `gc.collect()` to release Python-held tensor references, then `torch.cuda.synchronize()` to flush pending ops, then `torch.cuda.empty_cache()` to return cached blocks to the allocator.

Called both before and after each request in the process route:
- **Before**: gives the incoming request maximum VRAM headroom.
- **After**: prevents leftover activations from being inherited by the next queued request.

Safe to call when CUDA is not available (no-op on CPU/MPS).

### `maybe_cleanup_before_inference()`

Adaptive pre-inference cleanup. Triggers `between_requests_cleanup` only when:
- Free VRAM is below `cleanup_low_vram_gb`, OR
- The periodic maintenance interval (`cleanup_max_interval_s`) has elapsed since the last cleanup.

Skips cleanup if called within `cleanup_min_interval_s` of the previous cleanup to avoid overhead churn.

### `maybe_cleanup_after_inference()`

Adaptive post-inference cleanup. Triggers `between_requests_cleanup` only when:
- Free VRAM is below `cleanup_post_low_vram_gb`, OR
- Allocated ratio exceeds `cleanup_high_alloc_ratio`, OR
- The periodic maintenance interval has elapsed.

Same minimum-interval guard as the pre-inference variant.

These adaptive methods are called by each individual route handler (ai_routes, ar_routes, vision_routes) to clean up around their specific inference calls. The process route uses `between_requests_cleanup` directly at the queue boundary.

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

- **Single model for vision and chat**: Reduces VRAM pressure and simplifies the loading sequence.
- **No quantization on vision**: Prevents numerical instability issues. The 2B parameter count means the unquantized model fits comfortably in 8 GB+ VRAM.
- **SAM 2 Large**: Upgraded from Tiny to improve component detection recall on complex diagrams. Slightly higher VRAM cost, significantly better segmentation quality.
- **Expandable segments allocator**: Reduces CUDA memory fragmentation between passes that have different allocation sizes (e.g., text-only vs. image+text inputs).
- **Adaptive cleanup vs. always-cleanup**: Unconditional `empty_cache` calls after every inference add latency. The adaptive policy only cleans when necessary, preserving throughput under light load while preventing OOM under pressure.
- **MPS fallback**: Vision model load failure on MPS automatically retries on CPU rather than failing the startup entirely.

---

## Dependencies

- `os`, `time`, `torch`
- `transformers` (`AutoProcessor`, `AutoModelForImageTextToText`, `BitsAndBytesConfig`)
- `ultralytics.SAM`
