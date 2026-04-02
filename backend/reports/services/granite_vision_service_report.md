# Granite Vision Service Report (`granite_vision_service.py`)

## Overview

`granite_vision_service.py` provides image understanding by running IBM Granite Vision 3.3-2B through the vision processor. It handles two distinct use cases:

1. **Full diagram analysis** (`analyze_images`) — produces a summary, a component list, and a **diagram type classification** that feeds directly into the AR pipeline.
2. **Targeted Q&A** (`query_image`) — answers a specific natural-language question about an image, used by the AI service and the AR service (for component labeling) for focused visual lookups.

Both functions share the same model inference backend and output cleaning logic, and both perform **explicit tensor cleanup** after inference to reduce VRAM fragmentation.

---

## Public APIs

### `analyze_images(input_data, task='general_analysis', **kwargs) -> Dict`

Accepts an image path (string), a PIL Image, or a list of PIL Images.

**Task modes:**
- `"ar_extraction"` — uses `AR_EXTRACTION_PROMPT`, which asks the model to classify the diagram type and list every component in `NAME — ROLE` format.
- `"general_analysis"` (default) — uses `GENERAL_IMAGE_ANALYSIS_PROMPT` for free-form description.

**Returns:**
```python
{
  "status": "success" | "error",
  "analysis": {"summary": str},   # full cleaned model output
  "components": [str, ...],       # component names extracted from the text
  "diagram_type": str,            # "sequence" | "uml" | "flowchart" | "architecture" | "other"
  "answer": str                   # same as summary (compatibility alias)
}
```

The `diagram_type` field is critical — it is passed as the first element of the `hints` list to `ar_service.extract_document_features`, allowing the AR service to select the correct detection strategy without re-running any analysis.

### `query_image(image_path: str, question: str) -> str`

Answers a targeted question about an image. Used in two places:
- By the AI chat service for specific visual facts.
- By `ar_service._try_vision_label` for component labeling — a crop of each detected component is saved to a temporary file and passed here with `COMPONENT_LABEL_PROMPT`.

Returns a plain string answer, empty on failure.

---

## Diagram Type Classification

The vision model is prompted with `AR_EXTRACTION_PROMPT`, which begins with separate example lines showing each possible value:

```
DIAGRAM_TYPE: sequence
DIAGRAM_TYPE: uml
DIAGRAM_TYPE: flowchart
DIAGRAM_TYPE: architecture
DIAGRAM_TYPE: other
```

(The previous format used `sequence | uml | flowchart | architecture | other` on one line, which caused some models to copy the format string literally rather than choosing one value.)

**`_extract_diagram_type(text)`** parses this line using a two-stage strategy:

**Stage 1 — Explicit `DIAGRAM_TYPE:` line:**
- Looks for the first line beginning with `DIAGRAM_TYPE:`.
- If the value contains `|` (model copied the format line), skips to stage 2.
- Otherwise, matches value against `_DIAGRAM_TYPE_ALIASES` using word-boundary regex (not substring match) to avoid partial hits like "flow" matching inside "overflow".

**Stage 2 — Keyword fallback scan:**

If stage 1 fails (line absent, unrecognised, or contained `|`), the full model output is keyword-scanned in priority order:

| Keyword              | Canonical type  |
|----------------------|-----------------|
| `"sequence diagram"` | `sequence`      |
| `"lifeline"`         | `sequence`      |
| `"class diagram"`    | `uml`           |
| `"uml"`              | `uml`           |
| `"flowchart"`        | `flowchart`     |
| `"flow chart"`       | `flowchart`     |
| `"flow diagram"`     | `flowchart`     |
| `"architecture"`     | `architecture`  |
| `"infrastructure"`   | `architecture`  |
| `"system diagram"`   | `architecture`  |

More specific terms appear first to avoid false matches (e.g., "sequence diagram" before just "sequence").

Defaults to `"other"` if neither stage produces a match.

---

## Processing Flow (both functions)

### 1. Input Validation

Before any model call:
- Empty list → returns error without touching the model.
- String path to non-existent file → returns error.
- No model loaded + mock mode → returns a fixed mock response.
- No model loaded, not mock → returns error.

### 2. Image Loading and Resizing

- String path → `Image.open()` → convert to RGB.
- PIL Image → convert to RGB.
- List → take the first element.

Images are capped at **560 px on the longest side** using Lanczos resampling. Granite Vision 2B performs optimally with smaller inputs; larger inputs increase inference time quadratically without improving output quality for diagram understanding.

### 3. Prompt Construction

`build_vision_chat_text(user_prompt)` wraps the prompt in Granite's chat image format:
```
<|user|>
<image>
{user_prompt}
<|assistant|>
```

The `<image>` token signals the model to integrate the `pixel_values` tensor at that position.

### 4. Tensor Preparation

The vision processor converts the prompt text and image into input tensors. Tensors are moved to the model device with dtype handling:
- `pixel_values` → cast to `vision_compute_dtype` (float16 or bfloat16 on GPU, float32 on CPU).
- `input_ids` → integer type, no dtype cast.
- Other float tensors → cast to `vision_compute_dtype`.
- A NaN guard (`torch.nan_to_num`) is applied to `pixel_values` to prevent rare preprocessing artifacts from crashing inference.

### 5. Generation

```python
manager.vision_model.generate(
    **processed_inputs,
    max_new_tokens=150,    # for analyze_images
    max_new_tokens=100,    # for query_image
    do_sample=False,
    repetition_penalty=1.1
)
```

Greedy decoding (`do_sample=False`) is used because the AR extraction task requires structured, deterministic output.

### 6. Tensor Cleanup (after generation, before decode)

Both `analyze_images` and `query_image` free input tensors immediately after the forward pass:

```python
del processed_inputs, inputs
gc.collect()
torch.cuda.empty_cache()
```

This returns intermediate activation buffers to the allocator **before** the decode step, reducing peak VRAM. Output tokens (`output_ids`) are similarly deleted after decoding.

### 7. Decoding

Only the **new tokens** are decoded — the function slices off the prompt length from `output_ids` and decodes the remaining tokens.

### 8. Text Cleaning — `_clean_generated_text`

Removes:
- Noise tokens: `<|end_of_text|>`, `<fim_prefix>`, `<|system|>`, `<|user|>`, `<|assistant|>`
- Markdown bold markers: `**`, `__`
- List prefix characters: `-`, `*`, `•`
- Lines shorter than 2 characters.

### 9. Component Extraction — `_extract_components_from_text`

Extracts component names from the cleaned model output using three strategies:

1. **Dash-structured lines**: Matches `NAME — ROLE` format from `AR_EXTRACTION_PROMPT`. Extracts the `NAME` part (before em-dash, en-dash, or hyphen). Accepts names 2–50 characters.

2. **Plain lines**: If a line doesn't match the structured format but is 2–50 characters with alphanumeric content, it's included as-is.

3. **Quoted terms**: Extracts any `"quoted"` or `'quoted'` strings.

Results are deduplicated (case-insensitive) and capped at 20 components.

---

## Why the Vision Service Is Called Before AR

The preprocessing pipeline calls the vision service first because:
1. The vision model classifies the diagram type as a side effect — no additional cost.
2. The AR service needs the diagram type to select the right detection strategy.
3. The vision model's component name list provides hints for AR label assignment.

The vision model runs exactly once per image, and its outputs feed forward into both the AI service (summarization) and the AR service (type-aware detection).

---

## Risks and Notes

- **Quantization is disabled** for the vision model. Both 4-bit and 8-bit quantization cause type errors or NaN propagation when applied to multimodal image tensors.
- **Diagram type classification accuracy**: the keyword fallback scan in `_extract_diagram_type` handles cases where the model doesn't produce the explicit `DIAGRAM_TYPE:` line, improving coverage for verbose model outputs.
- **Component list quality** is heuristic — the text parsing may include role descriptions as component names if the model doesn't follow the `NAME — ROLE` format exactly.
- **560 px cap** may cause loss of fine text detail in very dense diagrams.

---

## Dependencies

- `torch`, `Pillow`, `re`
- `app.services.model_manager.manager` (vision model and processor)
- `app.services.prompt_builder` (`AR_EXTRACTION_PROMPT`, `GENERAL_IMAGE_ANALYSIS_PROMPT`, `build_vision_chat_text`, `build_vision_qa_prompt`)
