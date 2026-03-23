# AR Service Report (`ar_service.py`)

## Overview

`ARService` is the production AR component detection pipeline. It takes a diagram image and returns a structured list of detected components with normalized coordinates, confidence scores, shape metadata, and connectivity information.

The pipeline uses two detection strategies depending on diagram type:
- **Sequence diagrams** use a dedicated structural pipeline based on lifeline geometry.
- **All other types** use a hybrid SAM + classical contour pipeline with adaptive scoring.

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
  "connections": [...],       # inferred connections between components
  "relationships": {...},     # graph-derived spatial and topological metadata
  "metadata": {
    "image_size": {"width": int, "height": int},
    "diagram_type": str,      # e.g. "sequence", "uml", "architecture"
    "total_connections": int,
    "connected_components": int
  }
}
```

Each component in the list contains:
```python
{
  "id": "component_0",
  "label": "Process Box",     # shape-derived label
  "confidence": 0.85,
  "x": 0.12, "y": 0.08,      # top-left corner, normalised 0–1
  "width": 0.22, "height": 0.10,
  "center_x": 0.23, "center_y": 0.13,
  "area": 0.022,
  "shape_features": {...},
  "terminals": [...]
}
```

---

## End-to-End Pipeline

### Step 1 — Hint Parsing and Threshold Calibration

Before detection begins, `extract_document_features` examines the hints list:

- If the first hint contains `"sequence"`, `"uml"`, `"flowchart"`, or `"architecture"`, that string is stored in `_hint_diagram_type` and used to override auto-detection.
- `_calculate_adaptive_thresholds` then analyses the image using Canny edge density, Hough line orientation (horizontal / vertical / diagonal counts), lifeline clustering, rectangle counting, diamond counting, and compartmented rectangle detection.
- The result is a `diagram_type` string and a set of per-type thresholds:

| Diagram Type  | Min Area                | Max Area     | Aspect Ratio Range |
|---------------|-------------------------|--------------|--------------------|
| `sequence`    | 0.1 % of image          | 25 %         | 0.10 – 8.0         |
| `uml`         | 0.1 % of image          | 20 %         | 0.15 – 6.0         |
| `flowchart`   | 0.2 % of image          | 18 %         | 0.15 – 5.0         |
| `architecture`| 0.2 % of image          | **70 %**     | 0.10 – 10.0        |
| dense/medium/sparse | 0.2 % of image   | 20 %         | generic            |

The architecture type allows very large containers (group boxes, cloud regions) that span up to 70 % of the image — other types would reject these as background.

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

3. **`_find_seq_activation_bars`** — finds small filled rectangles anywhere in the diagram that sit on a lifeline (center within 40 px). Crucially, **no aspect ratio constraint is applied** — activation boxes can be horizontal (short/wide) or vertical (tall/narrow) depending on diagram style.

4. **`_find_seq_fragment_boxes`** — finds combined-fragment frames (alt, loop, opt, ref boxes). These span multiple lifelines (width ≥ 6 % of image width), have low interior fill (5–80 % indicating mostly-empty interior), and have a clear polygon border (≥ 4 vertices after `approxPolyDP`).

5. **`_threshold_variants`** — to handle diagrams with variable contrast, all detection passes run on four binary images: Otsu threshold, fixed 180 threshold (light background), fixed 100 threshold (dark background), and adaptive Gaussian threshold.

6. **`_dedup_boxes_list`** — IoU-based deduplication removes near-identical detections. Largest box wins ties, which preserves the primary fragment over slight contour variants.

Results are returned directly without going through SAM or the scoring pipeline. If the sequence pipeline returns zero results, the service falls back to the SAM pipeline.

---

### Step 3 — SAM Segmentation (non-sequence diagrams)

**`_run_sam(img_array)`** calls the SAM 2 Tiny model via `manager.ar_model`. For each detected mask, it:
- Resizes the mask to match image dimensions if needed.
- Computes bounding box from mask pixel coordinates.
- Stores: `segmentation`, `bbox`, `area`, `predicted_iou` (SAM confidence).

---

### Step 4 — Classical Contour Supplement

**`_detect_contour_components(img)`** always runs alongside SAM. It finds closed rectangular shapes that SAM may over-segment or miss:
- Runs Canny edge detection followed by morphological closing.
- Uses Otsu thresholding on both light and dark interpretations.
- Filters candidates via `_contour_to_candidate` (area, fill ratio, aspect, polygon vertex count).
- Merges with SAM results via `_merge_detection_results` using IoU uniqueness — a contour candidate is only kept if it does not substantially overlap any existing SAM mask.

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
| `uml`         | area < 0.3 %, aspect > 6                 | +0.15 for compartmented boxes (class diagrams)       |
| `flowchart`   | area < 0.2 %, aspect > 7 or < 0.14      | +0.15 for diamonds, +0.10 for ovals/terminators      |
| `architecture`| thin connectors (aspect > 10 and small)  | +0.10 if visible border frame, −0.10 if no frame     |
| `sequence`    | no hard rejects (handled separately)     | neutral (0.0, False)                                 |

**`_has_compartments(roi)`** — used by the UML path. Detects horizontal divider lines inside a region using Hough line detection. A line spanning ≥ 35 % of the region width is taken as a UML class box section divider. This boosts proper class boxes over plain rectangles.

**`_has_rect_frame(roi)`** — used by the architecture path. Measures gradient magnitude along the four borders of a region. If both top+bottom or both left+right have > 13 % strong gradient pixels, the region is considered a framed box. This preserves named service boxes in architecture diagrams.

---

### Step 6 — Non-Maximum Suppression

**`_non_maximum_suppression`** removes duplicates using:
- **Mask IoU** ≥ 0.25 → suppress lower-ranked mask.
- **Containment ratio** ≥ 0.85 in either direction → suppress smaller/inner mask.

The 0.85 containment threshold is deliberately loose to allow legitimate nested components (e.g., a service box inside a cloud region) to coexist.

---

### Step 7 — Component Construction

**`_masks_to_components`** converts filtered masks to component objects:
- Normalizes all coordinates to 0–1 range relative to image dimensions.
- Calls `_extract_shape_features` which computes: circularity, rectangularity, vertex count, convexity ratio, rotated bounding-rect properties, and boolean flags for diamond/oval/parallelogram shape types.
- Calls `_classify_by_shape` which maps features to a diagram-aware label (e.g., "Decision Diamond", "Process Box", "Sequence Lifeline Header", "UML Class Box").

---

### Steps 8–10 — Terminals, Connections, and Relationships

**`_detect_component_terminals`** — finds likely connection attachment points on component boundaries using contour extremes and sampled boundary points.

**`_detect_connections`** — uses skeletonized edge maps and geometric plausibility to infer connections between components, producing a list of `{from, to, type}` dicts.

**`_build_connection_graph`** — constructs a NetworkX undirected graph from the connection list.

**`_analyze_relationships`** — traverses the graph to produce neighbor lists, degree counts, component groupings, and spatial density analysis.

---

## Background and Text Artifact Handling

**`_estimate_background_model`** — samples the image border region to estimate the dominant background color. This is used by `_is_background_like_region` to identify masks that capture background rather than components.

**`_looks_like_floating_text`** — rejects text-only masks that float on the background (no box frame). Uses background color match, border gradient support, text band counting, and fill ratio to distinguish floating annotations from real boxed components. Preserves framed containers that happen to contain text.

---

## Integration with Vision Model

The AR service receives the vision model's diagram type classification as the first element of `hints`. This is extracted by `_extract_diagram_type` in `granite_vision_service.py` from the `DIAGRAM_TYPE:` line in the vision model's output. The AR service then uses this to skip image analysis heuristics and go directly to the correct detection strategy.

---

## Key Design Strengths

- **Diagram-type-aware detection**: Rather than one global rule set, each diagram type has its own thresholds, filtering rules, and detection strategy. This prevents the false positive patterns specific to each type (sequence space-rectangles, UML text rows, architecture connector lines) from polluting the output.
- **Sequence structural pipeline**: Exploits the predictable geometry of sequence diagrams (lifelines, actor alignment, activation position) to find components that appearance-based methods miss or over-segment.
- **Multi-threshold detection**: Running contour detection on four binary images (Otsu, fixed-level, adaptive) ensures components are found regardless of local contrast variation.
- **Background model**: Per-image background estimation makes text and gap rejection adaptive to dark-background diagrams as well as light ones.
- **SAM + classical CV hybrid**: SAM provides high recall for irregular shapes; contour detection reliably catches clean rectangular boxes that SAM may over-segment.

---

## Tradeoffs

- Heuristic scoring still requires threshold tuning when moving to new diagram styles or rendering tools.
- The sequence pipeline does not currently assign semantic labels — all actors get `"Actor"`, activation bars get `"Activation"`. Labels must come from the vision model via a second pass.
- Connection detection increases runtime and adds a dependency on skeletonization quality.

---

## Dependencies

- `numpy`, `opencv-python`, `Pillow`
- `scipy` (spatial distance)
- `skimage` (skeletonize)
- `networkx`
- `app.services.model_manager.manager` (SAM 2 model)
