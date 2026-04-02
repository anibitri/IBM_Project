# AR Service Report (`ar_service.py`)

## Overview

`ARService` is the production AR component detection pipeline. It takes a diagram image and returns a structured list of detected components with normalized coordinates, confidence scores, shape metadata, and semantic labels.

The pipeline uses two detection strategies depending on diagram type:
- **Sequence diagrams** use a dedicated structural pipeline based on lifeline geometry.
- **All other types** use a hybrid SAM + classical contour pipeline with adaptive scoring.

Connection and relationship extraction are **intentionally disabled** — line/arrow detection accuracy was insufficient for reliable results, so `connections` is always `[]` and `relationships` is always `{}`.

---

## Public API

```python
ar_service.extract_document_features(image_path: str, hints: List[str] = None) -> Dict
```

### Input
- `image_path` — path to the image file to analyze.
- `hints` — optional list of strings that can include a diagram type (e.g. `"sequence"`, `"uml"`, `"flowchart"`, `"architecture"`) and/or component name hints from the vision model. The first hint from the vision model is typically the diagram type.

### Output
```python
{
  "components": [...],        # list of detected component dicts
  "componentCount": int,      # number of components
  "connections": [],          # always empty (disabled)
  "relationships": {},        # always empty (disabled)
  "metadata": {
    "image_size": {"width": int, "height": int},
    "diagram_type": str,      # e.g. "sequence", "uml", "architecture"
    "total_connections": 0,
    "connected_components": 0
  }
}
```

Each component in the list contains:
```python
{
  "id": "component_0",
  "label": "API Gateway",      # semantic label (OCR/vision first, shape fallback)
  "semantic_label": "API Gateway",
  "confidence": 0.85,          # capped at 0.95
  "x": 0.12, "y": 0.08,       # top-left corner, normalised 0–1
  "width": 0.22, "height": 0.10,
  "center_x": 0.23, "center_y": 0.13,
  "area": 0.022,
  "shape_features": {...},
  "terminals": [],
  "description": "API Gateway at (0.23, 0.13)"
}
```

---

## End-to-End Pipeline

### Step 1 — Hint Parsing and Threshold Calibration

Before detection begins, `extract_document_features` examines the hints list:

- If the first hint contains `"sequence"`, `"uml"`, `"flowchart"`, or `"architecture"`, that string is stored in `_hint_diagram_type` and used to override auto-detection.
- `_calculate_adaptive_thresholds` analyses the image using Canny edge density, Hough line orientation (horizontal / vertical / diagonal counts), lifeline clustering, rectangle counting, diamond counting, and compartmented rectangle detection.
- The result is a `diagram_type` string and a set of per-type thresholds:

| Diagram Type  | Min Area                | Max Area     | Aspect Ratio Range |
|---------------|-------------------------|--------------|--------------------|
| `sequence`    | 0.1 % of image          | 25 %         | 0.10 – 8.0         |
| `uml`         | 0.1 % of image          | 20 %         | 0.15 – 6.0         |
| `flowchart`   | 0.2 % of image          | 18 %         | 0.15 – 5.0         |
| `architecture`| 0.2 % of image          | **70 %**     | 0.10 – 10.0        |
| dense/medium/sparse | 0.2 % of image   | 20 %         | generic            |

Image loading applies `ImageOps.exif_transpose` to correct camera-rotated images before any processing.

**How auto-detection works:**
- `lifeline_count ≥ 3` + `h_lines > v_lines × 2.5` → `sequence`
- `compartmented ≥ 3` + `rect_count ≥ 5` + few diamonds → `uml`
- Any diamond present → `flowchart`
- Falls back to `dense`, `medium`, or `sparse` based on edge density.

---

### Step 2 — Sequence Structural Pipeline (sequence diagrams only)

When `diagram_type == "sequence"`, a dedicated structural pipeline runs instead of SAM. It exploits the predictable geometry of sequence diagrams rather than relying on appearance-based segmentation.

**`_detect_sequence_components(img_array, img)`**

Orchestrates the full sequence pipeline:

1. **`_find_lifeline_positions`** — detects vertical lifeline columns by clustering near-vertical Hough segments whose combined span covers ≥ 30 % of image height. Returns a list of pixel x-coordinates.

2. **`_find_seq_actor_boxes`** — searches the top 20 % and bottom 15 % of the image for rectangles (from multiple threshold variants) whose horizontal center aligns within 60 px of a known lifeline. These are the participant boxes at the top of a sequence diagram.

3. **`_find_seq_activation_bars`** — finds small filled rectangles anywhere in the diagram that sit on a lifeline (center within 40 px). No aspect ratio constraint is applied — activation boxes can be horizontal or vertical depending on diagram style.

4. **`_find_seq_fragment_boxes`** — finds combined-fragment frames (alt, loop, opt, ref boxes). These span multiple lifelines (width ≥ 6 % of image width), have low interior fill (5–80 % indicating mostly-empty interior), and have a clear polygon border (≥ 4 vertices after `approxPolyDP`).

5. **`_threshold_variants`** — all detection passes run on four binary images: Otsu threshold, fixed 180 threshold, fixed 100 threshold, and adaptive Gaussian threshold.

6. **`_dedup_boxes_list`** — IoU-based deduplication removes near-identical detections. Largest box wins ties.

Results are returned directly without going through SAM or the scoring pipeline. If the sequence pipeline returns zero results, the service falls back to the SAM pipeline.

---

### Step 3 — SAM Segmentation (non-sequence diagrams)

**`_run_sam(img_array)`** calls the SAM 2 Large model via `manager.ar_model`. For each detected mask, it:
- Resizes the mask to match image dimensions if needed.
- Computes bounding box from mask pixel coordinates.
- Stores: `segmentation`, `bbox`, `area`, `predicted_iou` (SAM confidence, used as quality score but capped at 0.95).
- Default quality score when boxes are unavailable: **0.5** (was 0.8 previously).

---

### Step 4 — Classical Contour Supplement

**`_detect_contour_components(img)`** always runs alongside SAM. It finds closed rectangular shapes that SAM may over-segment or miss:
- Runs Canny edge detection followed by morphological closing.
- Uses Otsu thresholding on both light and dark interpretations.
- Filters candidates via `_contour_to_candidate` (area, fill ratio, aspect, polygon vertex count).
- Merges with SAM results via `_merge_detection_results` using IoU uniqueness — a contour candidate is only kept if it does not substantially overlap any existing SAM mask.

---

### Step 4b — Adjacent Component Merging

**`_merge_adjacent_components(components, img_w, img_h)`** runs after mask conversion to component objects. It merges fragments that are directly adjacent (stacked vertically or side-by-side horizontally) and share a near-identical dimension.

Two components are merged when:
- **Width or height match**: the differing dimension is within 0.2 % of each other.
- **Vertical adjacency**: y-gap ≤ 0.5 % of image height, and x-overlap covers ≥ 70 % of the narrower component's width.
- **Horizontal adjacency**: x-gap ≤ 0.5 % of image width, and y-overlap covers ≥ 70 % of the shorter component's height.

The merge is greedy — the closest adjacent pair is merged first, then the process repeats until no more merges are possible. This corrects the common pattern where SAM segments each section of a UML class box separately along its horizontal divider lines. After merging, component IDs are re-indexed but semantic labels are preserved.

---

### Step 5 — Adaptive Mask Scoring and Filtering

**`_filter_masks_adaptive`** runs every mask through `_calculate_mask_score`. Masks above the keep threshold are retained:
- Threshold is `0.40` for structured types (uml, flowchart, sequence), `0.70` for generic.

**`_calculate_mask_score`** applies the following in order:

**Hard rejects (immediate discard, score = 0):**
- Mask covers > 40 % of image (background capture).
- Bounding box spans > 80 % in both dimensions.
- Large light-background canvas region with nearly zero interior content (edge density < 0.005, variance < 40).
- Normalised area outside per-type bounds.
- Thin band touching any image border (aspect > 6 and border-touching).
- Bottom toolbar zone (bottom 6 % of image, not touching top, small area).
- Triangle shape → arrowhead.
- Large blob with fill < 0.6 (merged multi-component over-segmentation).
- Floating text region in background color without a border frame (`_looks_like_floating_text`).
- Empty gap region (interior edge density < 0.8 %, interior variance < 50 for sequence; stricter for other types).

**Scored factors:**
- **Size score** — peak at 0.2–8 % of image for structured types, 0.5–5 % for generic.
- **Aspect ratio score** — 1.0 if within per-type bounds, degrades outside.
- **Edge density score** — clamped to `edge_density × 500`, rewards well-defined borders.
- **Texture variance score** — clamped to `variance / 100`, penalizes blank regions.
- **Shape compactness** — circularity-based bonus for clean convex shapes.
- **SAM confidence** — `predicted_iou` contributes directly to score.
- **Rectangularity bonus** — `+0.05` for masks that are nearly rectangular (fill ≥ 0.80, 4–6 vertices).

**`_type_specific_filter`** runs last before the final score is computed. It encodes per-diagram-type rules:

| Type          | Hard Rejects                              | Score Adjustments                                    |
|---------------|-------------------------------------------|------------------------------------------------------|
| `uml`         | area < 0.3 %, aspect > 6, fill < 0.65   | +0.15 for compartmented boxes; rejects empty framed boxes |
| `flowchart`   | area < 0.2 %, aspect > 7 or < 0.14      | +0.15 for diamonds, +0.10 for ovals/terminators      |
| `architecture`| thin connectors, small regions (< 0.5 %), empty framed boxes | +0.05 if visible border frame, −0.15 if no frame |
| `sequence`    | no hard rejects (handled separately)     | neutral (0.0, False)                                 |

**Empty framed box rejection** (UML and architecture): even if a border frame is detected, regions whose interior has edge density < 3–4 and variance < 400–500 are rejected as whitespace containers with no content.

**`_has_rect_frame(roi)`** — detects border frame lines to preserve text-in-box components. Accepts both full 4-sided frames AND 3-sided frames (e.g., the methods compartment of a UML class box whose top edge is an interior dividing line rather than a true outer border).

**`_has_compartments(roi)`** — used by the UML path. Detects horizontal divider lines inside a region using Hough line detection. A line spanning ≥ 35 % of the region width is taken as a UML class box section divider.

---

### Step 6 — Non-Maximum Suppression

**`_non_maximum_suppression`** removes duplicates and spanning artifacts using three rules:

1. **Pixel IoU** ≥ 0.25 → suppress lower-ranked mask.
2. **Containment ratio** ≥ 0.85 in either direction → suppress smaller/inner mask.
3. **Spanning-artifact detection** — a candidate mask is suppressed if it has bbox IoU > 0.12 with 2 or more already-kept masks, AND does not cleanly contain those masks (bbox containment < 0.88). This catches hollow outline masks whose pixel overlap with individual components is low (escaping rules 1 & 2) even though their bounding box spans multiple valid components. Legitimate container boxes are exempt because they cleanly contain their children (containment ≈ 1.0).

Two new bbox geometry helpers support rule 3:
- **`_bbox_iou(m, k)`** — axis-aligned bounding box IoU.
- **`_bbox_contain_k_in_m(m, k)`** — fraction of `k`'s bounding box that lies inside `m`'s bounding box.

The containment threshold (0.85) is deliberately loose to allow legitimate nested components (e.g., a service box inside a cloud region) to coexist with their containers.

---

### Step 7 — Component Construction and Semantic Labeling

**`_masks_to_components`** converts filtered masks to component objects:
- Normalizes all coordinates to 0–1 range.
- Calls `_extract_shape_features` (circularity, rectangularity, vertex count, convexity, diamond/oval/parallelogram flags).
- Calls `_classify_by_shape` for a shape-based fallback label.
- Calls `_label_component_semantic` to obtain the primary semantic label.

**`_label_component_semantic(img, x, y, w, h, fallback_label)`** — three-level label priority:

1. **OCR text** (`_try_ocr_label`) — extracts text from the padded crop using `pytesseract` (optional dependency). Applies adaptive thresholding to improve contrast for diagram text. Returns the first non-empty line, cleaned through `clean_label`. If `pytesseract` is not installed, silently skips this step.

2. **Vision model** (`_try_vision_label`) — saves the component crop to a temporary file and calls `query_image(tmp_path, COMPONENT_LABEL_PROMPT)`. Cleans the raw answer through `clean_label`. Only used if OCR returns nothing.

3. **Shape fallback** — the `_classify_by_shape` result is used if both OCR and vision fail.

Confidence is capped at 0.95 and rounded to 3 decimal places.

---

## Background and Text Artifact Handling

**`_estimate_background_model`** — samples the image border region to estimate the dominant background color. Used by `_is_background_like_region` to identify masks that capture background rather than components.

**`_looks_like_floating_text`** — rejects text-only masks that float on the background (no box frame). Uses background color match, border gradient support, text band counting, and fill ratio to distinguish floating annotations from real boxed components.

---

## Integration with Vision Model

The AR service receives the vision model's diagram type classification as the first element of `hints`. This is extracted by `_extract_diagram_type` in `granite_vision_service.py` from the `DIAGRAM_TYPE:` line in the vision model's output. The AR service then uses this to skip image analysis heuristics and go directly to the correct detection strategy.

---

## Key Design Strengths

- **Diagram-type-aware detection**: Each diagram type has its own thresholds, filtering rules, and detection strategy.
- **Sequence structural pipeline**: Exploits the predictable geometry of sequence diagrams to find components that appearance-based methods miss or over-segment.
- **Multi-threshold detection**: Running contour detection on four binary images ensures components are found regardless of local contrast.
- **Background model**: Per-image background estimation makes text and gap rejection adaptive.
- **SAM + classical CV hybrid**: SAM provides high recall for irregular shapes; contour detection reliably catches clean rectangular boxes.
- **Spanning-artifact NMS**: Bbox-based suppression catches hollow outline masks that escape pixel-level IoU/containment rules.
- **Adjacent component merging**: Corrects SAM's tendency to over-segment UML class boxes by sections.
- **Semantic labeling**: OCR-first, vision-fallback labeling gives meaningful names rather than shape-derived placeholders.

---

## Tradeoffs

- Heuristic scoring still requires threshold tuning when moving to new diagram styles.
- The sequence pipeline assigns shape-based labels to actors/activations by default; semantic relabeling via OCR/vision adds one `query_image` call per component.
- Connection and relationship detection have been disabled. The output always contains `connections: []` and `relationships: {}`. These fields are preserved in the schema for forward compatibility.

---

## Dependencies

- `numpy`, `opencv-python`, `Pillow` (including `ImageOps`)
- `app.services.model_manager.manager` (SAM 2 Large model)
- `app.services.granite_vision_service.query_image` (vision-based component labeling)
- `app.services.prompt_builder.COMPONENT_LABEL_PROMPT`, `clean_label`
- `pytesseract` (optional, for OCR-based labeling)
- `tempfile` (for temporary crop files passed to vision model)
