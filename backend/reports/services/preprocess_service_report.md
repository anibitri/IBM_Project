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
        "connections": [...],
        "relationships": {...},
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

Same top-level structure, with `"type": "pdf"` and `"images"` containing one entry per diagram page extracted from the PDF.

---

## Image Pipeline

When a single image file is uploaded, the pipeline runs as follows:

### Step 1 — Diagram Classification (Vision Model)

```python
vision_result = analyze_images(file_path, task="ar_extraction")
```

`analyze_images` runs the IBM Granite Vision 3.3-2B model on the image. It:
- Builds the `AR_EXTRACTION_PROMPT` which asks the model to output a `DIAGRAM_TYPE:` classification line followed by a `NAME — ROLE` component list.
- Returns `vision_result` containing `summary`, `components` (extracted names), and `diagram_type` (e.g., `"sequence"`, `"uml"`, `"architecture"`, `"other"`).

The `diagram_type` from this step is critical — it is passed forward as the first hint to the AR service.

### Step 2 — AR Component Detection

```python
diagram_type = vision_result.get('diagram_type', 'other')
ar_result = ar_service.extract_document_features(
    file_path,
    hints=[diagram_type] + vision_components
)
```

The `hints` list is constructed as `[diagram_type, component_name_1, component_name_2, ...]`. Passing the diagram type as the first element means the AR service always receives an explicit classification hint before any component names, allowing it to immediately select the right detection strategy (e.g., the dedicated sequence pipeline).

The AR service returns components with normalized coordinates, confidence, shape features, and connectivity information.

### Step 3 — AI Summarization

```python
ai_result = ai_service.summarize_components(
    components=ar_components,
    relationships=relationships,
    document_type=diagram_type
)
```

The AI service generates a plain-language technical summary of the detected components and their relationships. The `document_type` is passed so the AI can tailor its language to the diagram style (e.g., "sequence diagram showing interactions between...").

---

## PDF Pipeline

PDFs are processed page by page:

### Step 1 — Page Rendering

Pages are rendered to images using PyMuPDF (`fitz`). Rendering resolution is chosen to produce a clear, adequately-sized image without excessive file size.

### Step 2 — Diagram Filtering

Before running the full vision + AR pipeline on every page, the service uses a quick vision classification check using `DIAGRAM_CLASSIFICATION_PROMPT`:
```
Is this image a technical diagram (e.g. schematic, flowchart, UML, sequence diagram)?
Answer with ONLY 'yes' or 'no'.
```

Pages that answer `"no"` are skipped. This prevents the heavier AR and AI steps from running on photo pages, gantt charts, or title slides.

### Step 3 — Text Extraction (Docling)

If Docling is installed, structured text is extracted from each page. This text is passed to the AI service as additional context for summarization and Q&A. If Docling is unavailable, text context degrades but vision + AR still run.

### Step 4 — Per-Page Vision + AR + AI

Each diagram page goes through the same three-step pipeline as the image mode (Vision → AR → AI summarization), with the diagram type forwarded from the vision result to the AR service on each page.

---

## Why the Pipeline Order Matters

The order Vision → AR → AI is intentional:

1. **Vision runs first** because it classifies the diagram type as a side effect. The AR service needs this classification to pick the right detection strategy without doing its own analysis.

2. **AR runs second** because it has the diagram type available. It also gets the vision component names as hints, which can assist label assignment in some pipelines.

3. **AI runs last** because it needs both the vision summary and the AR component list to generate a coherent description. It combines all available context — text from Docling, the vision summary, AR components, and connection metadata — into a compact, accurate explanation.

---

## Error Handling

Each stage is wrapped in a `try/except`. A failure in one stage does not abort the others:
- If vision fails, `diagram_type` defaults to `"other"` and `vision_components` is empty. AR still runs with a generic configuration.
- If AR fails, the image entry is returned with an empty `ar` block and the vision and AI results are still included.
- If AI summarization fails, a fallback summary derived from the component list is used.

---

## Dependencies

- `Pillow` — image loading and conversion.
- `fitz` (PyMuPDF) — PDF page rendering.
- `docling` (optional) — structured text extraction from PDFs.
- `app.services.granite_vision_service.analyze_images` — vision analysis and diagram type classification.
- `app.services.granite_ai_service.ai_service` — text-based summarization and Q&A.
- `app.services.ar_service.ar_service` — component detection.
- `app.services.prompt_builder.DIAGRAM_CLASSIFICATION_PROMPT` — quick diagram filter prompt.

---

## Risks and Notes

- **Latency** — each page runs three model passes. On CPU, a single image can take several minutes. On GPU, a typical diagram takes 5–30 seconds.
- **Docling availability** — if not installed, text context for AI summarization is absent. The service warns but continues.
- **Diagram classification reliability** — the `yes/no` filter for PDFs relies on the vision model. Misclassifying a diagram page as a non-diagram will silently skip it. The threshold can be adjusted if too many diagram pages are being skipped.
- **Memory** — running three models (Granite Vision, AR/SAM) simultaneously can cause VRAM pressure on smaller GPUs. The model manager handles VRAM monitoring and SAM CPU fallback, but very large PDFs may require streaming pages rather than parallel processing.
