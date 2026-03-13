# Preprocess Service Report (`preprocess_service.py`)

## Overview
`PreprocessService` is the backend orchestration entrypoint for document preprocessing. It routes PDFs and images through extraction, vision analysis, AR component extraction, and AI summarization.

## Core Responsibilities
- File-type routing (`pdf` vs image formats).
- PDF pipeline:
  - image extraction from pages (PyMuPDF)
  - optional non-diagram filtering via vision Q&A
  - text extraction via Docling (when available)
  - per-image Vision + AR analysis
  - aggregate AI summary generation
- Image pipeline:
  - vision analysis
  - AR extraction
  - AI summary

## Primary API
- `preprocess_document(file_path, mock=False, extract_ar=True, generate_ai_summary=True) -> Dict[str, Any]`

Singleton + wrapper:
- `preprocess_service = PreprocessService()`
- `preprocess_document(*args, **kwargs)` compatibility function

## Output Shape
Returns normalized dictionaries with:
- `status`, `type`, `file_path`
- `vision`, `ar`, and `ai` payloads
- `images` list (single-item for image mode)
- metadata fields under `meta`

## Dependencies
- `Pillow`, `fitz` (PyMuPDF)
- optional `docling`
- `app.services.granite_vision_service`
- `app.services.granite_ai_service.ai_service`
- `app.services.ar_service.ar_service`

## Risks / Notes
- Pipeline complexity and multi-model dependencies can increase latency.
- If Docling is missing, text context degrades.
- Results quality depends heavily on extracted image quality and diagram classifier reliability.
