# Preprocess Service Report (`preprocess_service.py`)

## Overview

`PreprocessService` is the backend orchestration layer for document ingestion. Every uploaded file — whether a PDF or a raster image — passes through this service, which coordinates vision analysis, AR component extraction, and AI summarization into a single structured result.

The service is exposed as a singleton (`preprocess_service`) and a top-level compatibility function (`preprocess_document`).

---

## Public API

```python
preprocess_document(
    file_path: str,
    mock: bool = False,
    extract_ar: bool = True,
    generate_ai_summary: bool = True,
    cancellation_event: threading.Event = None,
) -> Dict[str, Any]
```

`cancellation_event` is a `threading.Event` checked at multiple checkpoints throughout the pipeline. When set, `ProcessingCancelled` is raised, stopping the pipeline immediately. This is set by `process_route.py` when the client calls `POST /api/process/cancel`.

### Output Shape (image mode)

```python
{
  "status": "success" | "error",
  "type": "image",
  "file_path": str,          # POSIX-normalised (forward slashes on all platforms)
  "images": [
    {
      "page": 1,
      "image_path": str,     # POSIX path
      "image_filename": str,
      "image_size": (width, height),
      "vision": { ... },
      "vision_summary": str,
      "ar_components": [ ... ],
      "ar_relationships": { ... },
      "component_count": int
    }
  ],
  "ar": {
    "status": "success",
    "components": [ ... ],
    "componentCount": int,
    "connections": [ ... ],
    "relationships": { ... }
  },
  "ai_summary": str,
  "meta": {
    "width": int, "height": int, "mode": str,
    "aspect_ratio": float, "component_count": int
  }
}
```

### Output Shape (PDF mode)

Same top-level structure with `"type": "pdf"`, plus:
- `"images"` — one entry per diagram page extracted
- `"text_excerpt"` / `"full_text"` — Docling-extracted text
- `"extracted_image_paths"` — POSIX paths of all extracted images
- `"meta"` — `pages_with_images`, `total_components`, `text_length`, etc.

All path fields (`file_path`, `image_path`, `extracted_image_paths`) are normalised to POSIX forward-slash format via `_posix()` before serialisation, ensuring Windows backslash paths do not break frontend URL parsing.

---

## Pipeline Timing

Every run of `preprocess_document` emits a single timing summary to the log at completion. No timing values are printed mid-run — each step is measured silently and the results are collated into one block:

```
📊 Pipeline timing summary (image, 1 page(s)):
   Vision analysis              42.3s
   AR extraction                18.7s
   AI summary                   31.1s
   ──────────────────────────────────────────
   Total accounted              92.1s
⏱️  Total pipeline time for file.png: 92.4s
```

For PDFs with multiple pages, per-page step times are aggregated:

```
📊 Pipeline timing summary (pdf, 2 page(s)):
   PDF image extraction          1.2s
   Vision diagram filter        38.6s
   Docling text extraction       2.1s
   Vision/page                 81.8s  (avg 40.9s × 2 page(s))
   AR/page                     38.2s  (avg 19.1s × 2 page(s))
   AI summary                  33.2s
   ──────────────────────────────────────────
   Total accounted             195.1s
⏱️  Total pipeline time for doc.pdf: 195.6s
```

The "total accounted" vs. "total pipeline time" difference reflects overhead between steps (file I/O, GC, model loading).

---

## Cancellation Checkpoints

`_check_cancel(cancellation_event)` is called at these points:

- Before PDF image extraction
- After image extraction (before filtering)
- After filtering (before text extraction)
- Before each per-image Vision pass (PDF mode)
- Between Vision and AR for each image (PDF mode)
- Before AI summary
- Before vision analysis (image mode)
- Between vision and AR (image mode)
- Before AI summary (image mode)

If the event is set at any checkpoint, `ProcessingCancelled` is raised. The caller (`_run_processing_job`) catches this and transitions the job status to `cancelled`.

---

## Image Pipeline

When a single image file is uploaded, the pipeline runs as follows:

### Step 1 — Orientation Correction

Before any analysis, `ImageOps.exif_transpose` is applied to correct camera-rotated photos. This ensures processing is always in the correct orientation regardless of EXIF metadata.

### Step 2 — Vision Analysis

```python
vision_result = analyze_images(file_path, task="ar_extraction")
```

Runs the IBM Granite Vision model. Returns `vision_result` containing `summary`, `components` (extracted names), and `diagram_type` (e.g. `"sequence"`, `"uml"`, `"architecture"`, `"other"`). The `diagram_type` is forwarded as the first hint to the AR service.

### Step 3 — AR Component Detection

```python
ar_result = ar_service.extract_document_features(
    file_path,
    hints=[diagram_type] + vision_components
)
```

The `hints` list is `[diagram_type, component_name_1, ...]`. The AR service returns components with normalised coordinates, confidence, shape features, and semantic labels.

### Step 4 — AI Summarization

```python
ai_result = ai_service.analyze_context(
    vision=vision_result,
    components=ar_components,
    context_type=document_type,
    connections=relationships.get('connections', []),
)
```

Generates a plain-language technical summary combining vision output and AR components.

---

## PDF Pipeline

### Step 1 — Embedded Image Extraction

PyMuPDF (`fitz`) extracts **embedded raster images** from the PDF — not rendered pages. For each page (up to `max_images_per_pdf = 30`):
- `page.get_images(full=True)` enumerates embedded image xrefs
- Images smaller than `min_image_size` (100×100 px) are skipped
- Raw image bytes are written to `<pdf_name>_extracted/` beside the original file

This targets diagrams authors embedded intentionally, avoiding false positives from background textures or layout elements.

### Step 2 — Diagram Filtering

Each extracted image is sent to the vision model with `DIAGRAM_CLASSIFICATION_PROMPT` — a binary yes/no prompt against explicit criteria for technical diagrams (UML, architecture, flowcharts, circuit schematics, block diagrams) vs. non-diagrams (photos, screenshots, tables). Ambiguous answers fall back to keyword matching. Images classified as non-diagrams are skipped.

### Step 3 — Text Extraction (Docling)

If Docling is installed, structured text is extracted from the full PDF and passed to the AI service as additional context. The service warns but continues if Docling is unavailable.

### Step 4 — Per-Image Vision + AR + AI

Each retained diagram image goes through Vision → AR → AI, the same three steps as image mode. Results are collected into `image_analyses`. Components and connections from all pages are merged into the top-level `ar` block.

### Step 5 — Comprehensive AI Summary

After all pages are processed, a combined AI summary is generated using:
- All page vision summaries concatenated
- All AR components (up to 20)
- All connections (up to 30)
- Docling text excerpt

---

## Why the Pipeline Order Matters

The order Vision → AR → AI is intentional:

1. **Vision first** — classifies the diagram type as a side effect. AR needs this to choose the right detection strategy.
2. **AR second** — uses the diagram type and vision component names as hints.
3. **AI last** — requires both vision summary and AR component list to produce a coherent explanation.

---

## Path Normalisation

All path values written to the output dict are passed through `_posix()`:

```python
def _posix(path: str) -> str:
    return Path(path).as_posix() if path else path
```

On Windows, `os.path.join` produces backslash separators. The mobile frontend parses `image_path` with `split('uploads/')`, which fails if the path contains backslashes. Normalising to POSIX format at the service boundary ensures cross-platform compatibility.

---

## Error Handling

Each stage is wrapped in `try/except`. A failure in one stage does not abort the others:
- Vision failure → `diagram_type` defaults to `"other"`, AR still runs with generic configuration
- AR failure → image entry returned with empty `ar` block; vision and AI results still included
- AI failure → vision summary used as fallback; service continues

---

## Dependencies

- `Pillow` (including `ImageOps`) — image loading, orientation correction, size validation
- `fitz` (PyMuPDF) — PDF embedded image extraction
- `docling` (optional) — structured text extraction from PDFs
- `app.services.granite_vision_service.analyze_images` — vision analysis and diagram classification
- `app.services.granite_ai_service.ai_service` — text-based summarization and Q&A
- `app.services.ar_service.ar_service` — component detection
- `app.services.prompt_builder.DIAGRAM_CLASSIFICATION_PROMPT` — PDF diagram filter prompt
- `time` (standard library) — pipeline step timing

---

## Risks and Notes

- **Latency** — each image runs three model passes. On a 6GB GPU, a typical diagram takes 30–120 seconds.
- **Embedded-only extraction** — PDFs with only vector-drawn diagrams yield zero extractable images. Page rendering was removed because it produced too many false positives from layout elements.
- **Docling availability** — if not installed, the AI summary has no text context. The service warns but continues.
- **Diagram classification reliability** — the yes/no filter relies on the vision model. A misclassified diagram image is silently skipped.
- **Memory** — running Granite Vision and SAM simultaneously can cause VRAM pressure on smaller GPUs. The model manager handles VRAM monitoring and SAM CPU fallback.
- **Windows paths** — all output paths are POSIX-normalised. Raw `os.path` values must never be returned directly to clients.
