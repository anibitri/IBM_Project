# Granite Vision Service Report (`granite_vision_service.py`)

## Overview

`granite_vision_service.py` provides image understanding by running IBM Granite Vision 3.3-2B through the vision processor. It handles two distinct use cases:

1. **Full diagram analysis** (`analyze_images`) — produces a summary, a component list, and a **diagram type classification** that feeds directly into the AR pipeline.
2. **Targeted Q&A** (`query_image`) — answers a specific natural-language question about an image, used by the AI service for focused visual lookups.

Both functions share the same model inference backend and output cleaning logic.

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

The `diagram_type` field is new and critical — it is passed as the first element of the `hints` list to `ar_service.extract_document_features`, allowing the AR service to select the correct detection strategy without re-running any analysis.

### `query_image(image_path: str, question: str) -> str`

Answers a targeted question about an image. Used when the AI chat service needs a specific visual fact (e.g., "What color is the arrow between Service A and the Database?"). Returns a plain string answer, empty on failure.

---

## Diagram Type Classification

The vision model is prompted with `AR_EXTRACTION_PROMPT`, which now begins with:

```
Analyse this technical diagram.
First, on a single line, state the diagram type using EXACTLY one of these labels:
DIAGRAM_TYPE: sequence | uml | flowchart | architecture | other
```

The `_extract_diagram_type(text)` function parses this line from the model's output using `_DIAGRAM_TYPE_ALIASES`:

```python
_DIAGRAM_TYPE_ALIASES = {
    "sequence":     "sequence",
    "uml":          "uml",
    "class":        "uml",       # "class diagram" → uml
    "flowchart":    "flowchart",
    "flow":         "flowchart",
    "architecture": "architecture",
    "other":        "other",
}
```

If the `DIAGRAM_TYPE:` line is absent or uses an unrecognised label, the function falls back to `"other"`. This is defensive — even if the model produces slightly non-standard output (e.g., `"DIAGRAM_TYPE: class diagram"`), the substring match in `_DIAGRAM_TYPE_ALIASES` still returns the correct canonical type.

---

## Processing Flow (both functions)

### 1. Input Validation

Before any model call, the function validates the input:
- Empty list → returns error without touching the model.
- String path to non-existent file → returns error.
- No model loaded + mock mode → returns a fixed mock response so the rest of the pipeline continues.
- No model loaded, not mock → returns error.

### 2. Image Loading and Resizing

- String path → `Image.open()` → convert to RGB.
- PIL Image → convert to RGB.
- List → take the first element.

Images are capped at **560 px on the longest side** using Lanczos resampling. This is a deliberate tradeoff:
- Granite Vision 2B performs optimally with smaller inputs (its vision encoder was trained at lower resolution).
- Larger inputs increase inference time quadratically without improving output quality for diagram understanding.
- 560 px preserves enough text detail for label reading while keeping inference fast.

### 3. Prompt Construction

`build_vision_chat_text(user_prompt)` wraps the prompt in Granite's chat image format:
```
<|user|>
<image>
{user_prompt}
<|assistant|>
```

This format is required by Granite Vision's chat template — the `<image>` token signals the model to integrate the pixel_values tensor at that position.

### 4. Tensor Preparation

The vision processor converts the prompt text and image into input tensors. The function then moves tensors to the model device with careful dtype handling:
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

Greedy decoding (`do_sample=False`) is used because the AR extraction task requires structured, deterministic output (the `DIAGRAM_TYPE:` line must be exact). The repetition penalty prevents the model from looping the component list.

### 6. Decoding

Only the **new tokens** are decoded — the function slices off the prompt length from `output_ids` and decodes the remaining tokens. This prevents the prompt from appearing in the output.

### 7. Text Cleaning — `_clean_generated_text`

Removes:
- Noise tokens: `<|end_of_text|>`, `<fim_prefix>`, `<|system|>`, `<|user|>`, `<|assistant|>`
- Markdown bold markers: `**`, `__`
- List prefix characters: `-`, `*`, `•`
- Lines shorter than 2 characters.

### 8. Component Extraction — `_extract_components_from_text`

Extracts component names from the cleaned model output using three strategies applied in sequence:

1. **Strategy 1 — Dash-structured lines**: Matches the `NAME — ROLE` format from `AR_EXTRACTION_PROMPT`. Extracts the `NAME` part (before the em-dash, en-dash, or hyphen). Accepts names 2–50 characters with at least one alphanumeric character.

2. **Strategy 2 — Plain lines**: If a line doesn't match the structured format but is 2–50 characters with alphanumeric content, it's included as-is.

3. **Strategy 3 — Quoted terms**: Extracts any `"quoted"` or `'quoted'` strings, useful for model outputs that wrap names in quotes instead of using the dash format.

Results are deduplicated (case-insensitive) and capped at 20 components.

---

## Summary Truncation — `_truncate_summary`

Used elsewhere to safely shorten a summary to a character limit while ending at a sentence boundary (`.`, `!`, or `?`). Falls back to hard truncation with `...` if no sentence boundary is found within the limit.

---

## Why the Vision Service Is Called Before AR

The preprocessing pipeline calls the vision service first because:
1. The vision model classifies the diagram type as a side effect of its analysis — there is no additional cost.
2. The AR service needs the diagram type to select the right detection strategy (e.g., the dedicated sequence pipeline).
3. The vision model's component name list provides useful hints for AR label assignment in some diagram types.

This means the vision model runs exactly once per image, and its outputs feed forward into both the AI service (for summarization) and the AR service (for type-aware detection).

---

## Risks and Notes

- **Quantization is disabled** for the vision model. Both 4-bit and 8-bit quantization cause type errors or NaN propagation when applied to multimodal image tensors (`pixel_values`). The model runs in native fp16/bf16 on GPU.
- **Diagram type classification accuracy** depends on the model correctly following the `DIAGRAM_TYPE:` instruction. For ambiguous diagrams (e.g., a sequence diagram with UML-style actor boxes), the model may choose `"other"`. The AR service handles this gracefully by falling back to the general pipeline.
- **Component list quality** is heuristic — the text parsing may include role descriptions as component names if the model doesn't follow the `NAME — ROLE` format exactly.
- **560 px cap** may cause loss of fine text detail in very dense diagrams. Increasing the cap improves label reading but increases inference time significantly.

---

## Dependencies

- `torch`, `Pillow`, `re`
- `app.services.model_manager.manager` (vision model and processor)
- `app.services.prompt_builder` (`AR_EXTRACTION_PROMPT`, `GENERAL_IMAGE_ANALYSIS_PROMPT`, `build_vision_chat_text`, `build_vision_qa_prompt`)
