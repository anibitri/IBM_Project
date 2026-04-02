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
    generate_ai_summary: bool = True
) -> Dict[str, Any]
```

### Output Shape (image mode)

```python
{
  "status": "success" | "error",
  "type": "image",
  "file_path": str,
  "images": [
    {
      "vision": {
        "summary": str,
        "components": [str, ...],
        "diagram_type": str
      },
      "ar": {
        "components": [...],
        "connections": [],
        "relationships": {},
        "metadata": {...}
      },
      "ai": {
        "summary": str,
        "insights": [...]
      }
    }
  ],
  "meta": {...}
}
```

### Output Shape (PDF mode)

Same top-level structure, with `"type": "pdf"` and `"images"` containing one entry per diagram image extracted from the PDF.

---

## Image Pipeline

When a single image file is uploaded, the pipeline runs as follows:

### Step 1 — Orientation Correction

Before any analysis, `ImageOps.exif_transpose` is applied to the loaded image to correct camera-rotated photos. This ensures the image is always processed in the correct orientation regardless of EXIF metadata. (AR service also applies this independently during its own image load.)

### Step 2 — Diagram Classification (Vision Model)

```python
vision_result = analyze_images(file_path, task="ar_extraction")
```

`analyze_images` runs the IBM Granite Vision 3.3-2B model on the image. It returns `vision_result` containing `summary`, `components` (extracted names), and `diagram_type` (e.g., `"sequence"`, `"uml"`, `"architecture"`, `"other"`).

The `diagram_type` from this step is critical — it is passed forward as the first hint to the AR service.

### Step 3 — AR Component Detection

```python
diagram_type = vision_result.get('diagram_type', 'other')
ar_result = ar_service.extract_document_features(
    file_path,
    hints=[diagram_type] + vision_components
)
```

The `hints` list is constructed as `[diagram_type, component_name_1, ...]`. The AR service returns components with normalized coordinates, confidence, shape features, and semantic labels.

### Step 4 — AI Summarization

```python
ai_result = ai_service.summarize_components(
    components=ar_components,
    relationships=relationships,
    document_type=diagram_type
)
```

The AI service generates a plain-language technical summary of the detected components.

---

## PDF Pipeline

PDFs are processed image by image:

### Step 1 — Embedded Image Extraction

The service extracts **embedded raster images** from the PDF using PyMuPDF (`fitz`). It does not render full pages or crop vector graphics regions — only image objects already present in the PDF are extracted.

For each page (up to `max_images_per_pdf = 30`):
- `page.get_images(full=True)` enumerates all embedded image xrefs.
- Images smaller than `min_image_size` (100×100 px) are skipped.
- `pdf_document.extract_image(xref)` retrieves the raw image bytes and extension.
- Images are written to the upload extraction directory and recorded with their page number and dimensions.

This approach targets the actual diagrams that authors embedded in the document, avoiding false positives from background textures, watermarks, or layout artifacts that page-rendering would capture.

### Step 2 — Diagram Filtering

Before running the full vision + AR pipeline on every extracted image, the service uses a quick vision classification check using `DIAGRAM_CLASSIFICATION_PROMPT` — a binary yes/no classification against explicit criteria for what counts as a technical diagram (UML diagrams, architecture diagrams, flowcharts, circuit schematics, block diagrams) vs. non-diagrams (photos, UI screenshots, tables, Gantt charts, plain text pages). Uncertain cases default to `"no"` to reduce false positives.

Images that answer `"no"` are skipped.

### Step 3 — Text Extraction (Docling)

If Docling is installed, structured text is extracted from the full PDF. This text is passed to the AI service as additional context. If Docling is unavailable, the service warns but continues with vision + AR only.

### Step 4 — Per-Image Vision + AR + AI

Each diagram image goes through the same three-step pipeline as the image mode (Vision → AR → AI summarization), with the diagram type forwarded from the vision result to the AR service on each image.

---

## Why the Pipeline Order Matters

The order Vision → AR → AI is intentional:

1. **Vision runs first** because it classifies the diagram type as a side effect. The AR service needs this classification to pick the right detection strategy.

2. **AR runs second** because it has the diagram type available. It also gets the vision component names as hints.

3. **AI runs last** because it needs both the vision summary and the AR component list. It combines all available context — text from Docling, the vision summary, AR components — into a compact explanation.

---

## Error Handling

Each stage is wrapped in a `try/except`. A failure in one stage does not abort the others:
- If vision fails, `diagram_type` defaults to `"other"` and `vision_components` is empty. AR still runs with generic configuration.
- If AR fails, the image entry is returned with an empty `ar` block; vision and AI results are still included.
- If AI summarization fails, a fallback summary derived from the component list is used.

---

## Dependencies

- `Pillow` (including `ImageOps`) — image loading, orientation correction, and conversion.
- `fitz` (PyMuPDF) — PDF embedded image extraction.
- `docling` (optional) — structured text extraction from PDFs.
- `app.services.granite_vision_service.analyze_images` — vision analysis and diagram type classification.
- `app.services.granite_ai_service.ai_service` — text-based summarization and Q&A.
- `app.services.ar_service.ar_service` — component detection.
- `app.services.prompt_builder.DIAGRAM_CLASSIFICATION_PROMPT` — quick diagram filter prompt.

---

## Risks and Notes

- **Latency** — each image runs three model passes. On GPU, a typical diagram takes 5–30 seconds.
- **Embedded-only extraction**: PDFs that contain vector-drawn diagrams (no embedded raster images) will yield zero extractable images. The vision+AR pipeline will not run on such documents. Page rendering was removed because it produced too many false positives from layout elements.
- **Docling availability** — if not installed, text context for AI summarization is absent. The service warns but continues.
- **Diagram classification reliability** — the `yes/no` filter for PDFs relies on the vision model. Misclassifying a diagram image as a non-diagram will silently skip it.
- **Memory** — running Granite Vision and SAM simultaneously can cause VRAM pressure on smaller GPUs. The model manager handles VRAM monitoring and SAM CPU fallback.
