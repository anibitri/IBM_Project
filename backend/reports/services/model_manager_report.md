# Model Manager Report (`model_manager.py`)

## Overview
`ModelManager` is the backend model lifecycle controller. It detects hardware, configures dtypes/devices, loads all major models (vision, chat, AR/SAM), tracks health, and supports runtime reload.

## Core Responsibilities
- Hardware detection (GPU/CPU, VRAM, BF16 support).
- Vision/chat compute configuration.
- Ordered model loading to manage VRAM pressure:
  1. Granite Vision
  2. Granite Chat
  3. MobileSAM
- Runtime VRAM logging and cache control.
- Failover/recovery actions for SAM device placement.

## Key APIs
- `load_models()`
- `get_status() -> dict`
- `reload_model(model_name: str) -> bool`
- `move_sam_to_cpu()` / `try_restore_sam_to_gpu()`

Singleton instance:
- `manager = ModelManager()` (initialized at import time)

## Device and Quantization Strategy
- Vision model: no quantization (`vision_quant_config = None`) for stability.
- Chat model: 4-bit quantization on GPU when available.
- AR model (MobileSAM): placed on GPU only if sufficient free VRAM; otherwise CPU.

## Dependencies
- `torch`
- `transformers` (`AutoProcessor`, `AutoModelForImageTextToText`, `AutoModelForCausalLM`, `AutoTokenizer`, `BitsAndBytesConfig`)
- `ultralytics.SAM`

## Risks / Notes
- Import-time model loading increases startup latency and failure surface.
- Multiple large models loaded simultaneously can create VRAM contention.
- Runtime reliability depends on graceful OOM handling and clear health endpoints.
