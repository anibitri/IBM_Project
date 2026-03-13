# Granite Vision Service Report (`granite_vision_service.py`)

## Overview
This module provides image analysis and visual Q&A using Granite Vision. It includes output cleaning and lightweight component extraction from generated text.

## Core Responsibilities
- Run multimodal inference for image understanding (`analyze_images`).
- Ask targeted visual questions (`query_image`).
- Clean generated text and extract candidate component names.

## Public APIs
- `analyze_images(input_data, task='general_analysis', **kwargs) -> Dict`
- `query_image(image_path: str, question: str) -> str`

## Processing Flow
1. Validate and normalize input image.
2. Resize images above max dimension (800px cap).
3. Build task prompt (`AR_EXTRACTION_PROMPT` for AR extraction mode).
4. Process tensors via vision processor, with dtype handling and NaN guards.
5. Generate output tokens and decode only new tokens.
6. Clean text and parse component candidates.

## Dependencies
- `torch`, `Pillow`, `re`
- `app.services.model_manager.manager`
- `app.services.prompt_builder.AR_EXTRACTION_PROMPT`

## Risks / Notes
- Quantization is intentionally avoided for stability with multimodal tensors.
- Component extraction from free text is heuristic and can miss or over-include names.
- Output quality is sensitive to prompt format and image clarity.
