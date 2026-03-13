# AR Service Algorithm — Change Report

## 1. Overview

The AR component extraction pipeline in `ar_service.py` detects, filters, and labels architectural components within uploaded diagram images. It was iteratively refined across four development sessions to improve detection accuracy, bounding-box precision, and label quality across diverse diagram styles. The file currently stands at **874 lines**.

The service is consumed by the `/api/ar/generate` endpoint and underpins the augmented-reality overlay feature on both web and mobile clients.

---

## 2. Pipeline Architecture

The extraction pipeline processes an input image through eight sequential stages:

```
1. SAM Detect
2. Filter Segments
3. Tighten Boxes
4. NMS (overlap removal)
5. Containment Dedup
6. Visual Complexity Filter
7. Normalize + Label (via Granite Vision)
8. Deduplicate by Label
```

Each stage progressively narrows the set of candidate components, from raw SAM detections down to a clean, labelled component list.

### 2.1 Stage Descriptions

| # | Stage | Method | Purpose |
|---|-------|--------|---------|
| 1 | SAM Detect | `_extract_segments()` | Run YOLO-based SAM model to produce raw bounding boxes |
| 2 | Filter Segments | `_filter_segments()` | Remove boxes that are too small, too large, have extreme aspect ratios, or are border artifacts |
| 3 | Tighten Boxes | `_tighten_boxes()` | Shrink SAM boxes inward to tightly fit actual component content |
| 4 | NMS | `_remove_overlaps()` | Nesting-aware Non-Maximum Suppression — removes duplicate overlapping boxes while preserving genuinely nested components |
| 5 | Containment Dedup | `_remove_contained_duplicates()` | Removes large boxes that span multiple components (multi-span artefacts) |
| 6 | Visual Complexity | `_filter_by_visual_complexity()` | Rejects visually blank regions (uniform colour, no edges) that are likely background noise |
| 7 | Normalize + Label | `_normalize_components()`, `_label_components()` | Convert pixel coordinates to normalised [0,1] format; query Granite Vision model for text labels |
| 8 | Label Dedup | `_deduplicate_by_label()` | When multiple detections receive the same label, keep only the highest-confidence one |

---

## 3. Changes Made & Rationale

### 3.1 Threshold Tuning (`__init__`)

All detection thresholds were relaxed from overly aggressive initial defaults to reduce false negatives (missed components):

| Parameter | Original | Final | Rationale |
|-----------|----------|-------|-----------|
| `confidence_threshold` | 0.45 | **0.35** | Valid components were being rejected at the original threshold |
| `min_box_area` | 2000 | **1000** | Small but real diagram elements (labels, small boxes) were missed |
| `min_area_ratio` | 0.008 | **0.004** | Small components relative to large images were incorrectly filtered |
| `max_area_ratio` | 0.50 | **0.85** | Nested parent components (e.g. `/turtle1` at 75% of image area) were wrongly rejected as background; the smarter background-removal logic in `_remove_overlaps` handles actual full-image backgrounds |
| `max_aspect_ratio` | 3.0 | **4.0** | Legitimate wide text boxes like `/turtle1/cmd_vel` (aspect ratio 3.71) were rejected. Raised incrementally from 3.0 → 3.5 → 4.0 across sessions |
| `min_color_variance` | 100 | **10.0** | Solid-coloured diagram boxes (CPU, GPU, CLK, I/O) have low grayscale variance but are real components |
| `min_edge_density` | 0.02 | **0.01** | Same rationale as above — solid blocks have very few internal edges |
| Border artifact area | 0.02 | **0.008** | Raised from 0.005 after legitimate small edge components were wrongly discarded |

**Decision:** Rather than a single aggressive area cutoff, the pipeline now relies on the multi-stage filtering approach (NMS + containment dedup + background removal) to correctly distinguish real components from background, allowing higher `max_area_ratio` without introducing false positives.

### 3.2 New Method: `_tighten_boxes()`

**Problem:** SAM produces bounding boxes that extend well beyond the actual component edges, making overlay boxes look oversized (e.g. the largest component covered 2.35% of the image when the real component was ~0.93%).

**Solution:** Analyse pixel intensity along each border strip and shrink the box inward until reaching rows/columns with real content.

**Algorithm:**
1. Convert image to grayscale float32
2. For each box, extract the crop and compute the **median border pixel intensity** (outermost ring of pixels) as the background reference value
3. From each of the four sides (left, right, top, bottom), scan inward one column/row at a time
4. Trim columns/rows where the mean absolute difference from the border median is below `tighten_bg_threshold` (set to 12)
5. Stop trimming at `tighten_margin` (15%) of the box dimension per side — this prevents over-shrinking
6. Reject the tightened result if it creates a box smaller than `min_dimension` or with a bad aspect ratio; fall back to the original box

**Parameters:**
- `tighten_margin = 0.15` — maximum fraction of box dimension to trim per side
- `tighten_bg_threshold = 12` — pixel intensity difference threshold to distinguish content from background

### 3.3 New Method: `_remove_contained_duplicates()`

**Problem:** After NMS, SAM detections that span multiple components can survive because their IoU with smaller individual boxes is below the NMS threshold (the outer box is much larger, so IoU is low despite full containment). These multi-span artefacts produce labels like "Storage GPU" or "RAM CLK".

**Additionally**, in nested/hierarchical diagrams (e.g. ROS node graphs), an outer box that contains inner components is a **real** component, not an artefact. The original naive approach — remove any outer box that contains an inner one — was too aggressive.

**Solution:** A three-tier removal strategy using pure geometric containment (no area-ratio gate):

| Children Count | Action | Rationale |
|----------------|--------|-----------|
| **2+ children** | Remove the parent | A box containing multiple other boxes is almost certainly a SAM artefact spanning multiple components |
| **1 child, child fills >40% of parent** | Remove the parent | A slightly-expanded duplicate of the child (e.g. "RAM CLK" nearly identical to "CLK") |
| **1 child, child fills ≤40% of parent** | Keep both | A genuine parent container (e.g. `/turtle1` where `/turtle1/cmd_vel` fills only ~6%) |

**Design Decision:** The method uses a local `geo_contains()` function with pure coordinate checks instead of `self._contains()` (which requires a 2× area ratio). This ensures that near-equal-sized overlapping spans are properly detected as containment.

### 3.4 New Method: `_clean_label()`

**Problem:** The Granite Vision model sometimes returns verbose multi-sentence responses instead of concise component names (e.g. *"The component name is called 'LLM interface' in this diagram"* or *"I am unable to provide the requested information"*).

**Solution:** A post-processing pipeline that extracts the actual component name:

1. **Collapse whitespace** — newlines, tabs, multiple spaces → single space
2. **Detect refusals** — if the response contains markers like "I am unable", "sorry", "cannot determine" → return `"Unknown"`
3. **Extract quoted names** — `"The name is 'Database'"` → `"Database"`
4. **Strip verbose prefixes** — regex patterns for common wrappers like "The component name is called...", "This is a...", "Name:..." etc.
5. **Strip trailing punctuation** and the word "component"
6. **Enforce 3-word maximum** — truncate to first 3 words
7. **Enforce 40-character maximum** — truncate with word-boundary awareness

### 3.5 Updated Method: `_filter_by_visual_complexity()`

**Problem:** Solid-coloured architectural boxes (CPU, GPU, CLK, I/O) have low grayscale variance and very few edges — they were failing the visual complexity check and being discarded, despite being real components.

**Changes:**
1. **Area-based bypass** — components with `area_ratio ≥ 1.5%` of the image skip the complexity check entirely. Large detections are almost always real components.
2. **OR logic** — smaller components pass if they satisfy **either** the colour variance threshold **or** the edge density threshold (previously both were required).

### 3.6 New Method: `_deduplicate_by_label()`

**Problem:** After labelling, multiple SAM detections may receive the same text label from the vision model, creating duplicate entries.

**Solution:** Group by normalised label (case-insensitive), keep only the highest-confidence instance per unique label.

**Special handling:**
- Components with `component_*` prefix (unlabelled) — always kept
- `"Unknown"` / `"Unlabeled"` labels — always kept, not used as dedup keys
- Named labels — deduplicated by exact lowercase match, highest confidence wins

### 3.7 Updated Method: `_query_vision_for_label()`

**Change:** The vision prompt was rewritten to enforce concise output:

```
"What text or label is visible in this cropped region from a technical diagram?
Reply with ONLY the text/name you see, nothing else.
Maximum 3 words. No sentences. No explanations.
If no text is visible, reply: Unknown"
```

Additionally, raw model output is now passed through `_clean_label()` before being returned, providing a safety net against verbose or malformed responses.

### 3.8 Pipeline Orchestration

The main `extract_document_features()` method was updated to:
- **Log component counts** at every stage for diagnosability
- **Insert new stages** in order: tighten → NMS → containment dedup → complexity → normalize → label → label dedup
- **Support debug mode** (`self.debug_complexity = True`) — when enabled, prints visual complexity values, rejection reasons, and containment decisions

---

## 4. Design Decisions

### 4.1 Multi-Stage Filtering vs. Single Threshold

Rather than relying on a single aggressive `max_area_ratio` to reject background, the pipeline uses a layered approach:
- **`_filter_segments`** handles obvious rejects (too small, extreme aspect ratio)
- **`_remove_overlaps`** handles full-image backgrounds (>55% area + 5+ contained children)
- **`_remove_contained_duplicates`** handles multi-span artefacts

This layered design allows each stage to be tuned independently and supports a wider variety of diagram styles without regression.

### 4.2 Nesting-Aware NMS

Standard NMS would discard nested components (e.g. removing `/turtle1/cmd_vel` because it overlaps with `/turtle1`). The `_remove_overlaps` method includes a nesting check: if two boxes overlap and one is significantly larger (area ratio ≥ 1.8×), they are treated as a parent-child pair and both are kept. Only similar-sized overlapping boxes are treated as duplicates.

### 4.3 SAM Model Limitations

SAM (Segment Anything Model, YOLO variant) cannot detect thin-bordered white rectangles that share the same background colour as their container. This was observed with inner nested boxes in the ROS turtle diagram (`/turtle1/rotate_absolute`, `_action/feedback`, `_action/status`). These components are invisible to SAM because there is insufficient contrast between their thin black borders and the surrounding white background. This is a fundamental limitation of the segmentation model, not the filtering pipeline.

### 4.4 Label Post-Processing

Granite Vision, while powerful, is a generative model that sometimes produces verbose explanatory text when asked to identify a component. Rather than adding more constraints to the prompt (which can hurt detection quality), a dedicated post-processing step (`_clean_label`) was judged more reliable for extracting concise names.

---

## 5. Time and Space Complexity Analysis

Let the following variables be:
- $n$ = number of raw SAM detections (typically 15–30)
- $W \times H$ = image dimensions in pixels
- $k$ = number of components after filtering (typically 4–25)
- $m$ = number of final labelled components

### 5.1 Per-Stage Time Complexity

| Stage | Method | Time Complexity | Notes |
|-------|--------|----------------|-------|
| SAM Detect | `extract_segments()` | $O(W \times H)$ | SAM model inference; dominated by image size, not analysed here as it's external model inference |
| Filter Segments | `_filter_segments()` | $O(n)$ | Single pass over all raw detections with constant-time arithmetic checks |
| Tighten Boxes | `_tighten_boxes()` | $O(n \times W)$ | For each of $n$ segments, scan up to `tighten_margin` rows/columns. Worst case scans proportional to box width/height |
| NMS (overlap removal) | `_remove_overlaps()` | $O(n^2)$ | Background removal: for each segment, check containment against all others. NMS: for each segment, check IoU against all kept segments |
| Containment Dedup | `_remove_contained_duplicates()` | $O(k^2)$ | For each of the $k$ post-NMS segments, check geometric containment against all others |
| Visual Complexity | `_filter_by_visual_complexity()` | $O(k \times P)$ | For each segment, crop and compute statistics over $P$ pixels in the crop. $P$ varies per component |
| Normalize | `_normalize_components()` | $O(k)$ | Simple arithmetic normalisation per component |
| Label | `_label_components()` | $O(k \times T)$ | $T$ = vision model inference time per crop. This is the **dominant cost** — typically 3–8 seconds per component |
| Label Dedup | `_deduplicate_by_label()` | $O(m)$ | Single pass with hash map lookup |

### 5.2 Overall Time Complexity

$$T_{\text{total}} = O(W \times H) + O(n^2) + O(n \times W) + O(k \times P) + O(k \times T_{\text{vision}})$$

In practice, the pipeline is **dominated by two stages**:
1. **SAM inference** — ~30–40 seconds for a 1024×1024 image (GPU-accelerated on CPU for SAM)
2. **Vision labelling** — ~3–8 seconds per component × $k$ components (GPU-accelerated with Granite Vision)

All filtering and geometric operations ($O(n^2)$, $O(k^2)$) take negligible time compared to model inference since $n$ and $k$ are small (< 50).

### 5.3 Per-Stage Space Complexity

| Stage | Method | Space Complexity | Notes |
|-------|--------|-----------------|-------|
| SAM Detect | External | $O(W \times H)$ | Full image tensor in GPU memory |
| Filter Segments | `_filter_segments()` | $O(n)$ | Filtered list of segment dicts |
| Tighten Boxes | `_tighten_boxes()` | $O(W \times H)$ | Grayscale float32 copy of the full image |
| NMS | `_remove_overlaps()` | $O(n)$ | Sorted copy of segments + kept list |
| Containment Dedup | `_remove_contained_duplicates()` | $O(k)$ | Contains-count map + removal set |
| Visual Complexity | `_filter_by_visual_complexity()` | $O(P)$ | One cropped region at a time (largest crop) |
| Label | `_label_components()` | $O(P + V)$ | Crop pixels $P$ + vision model activations $V$ |
| Label Dedup | `_deduplicate_by_label()` | $O(m)$ | Hash map of seen labels |

### 5.4 Overall Space Complexity

$$S_{\text{total}} = O(W \times H) + O(n) + O(V)$$

Where:
- $O(W \times H)$ — the image itself (RGB + grayscale copies)
- $O(n)$ — segment metadata (bounding boxes, confidences); negligible
- $O(V)$ — vision model memory (~5.5 GB VRAM for Granite Vision in bf16)

The dominant memory cost is the **pre-loaded models** (SAM ~300 MB, Granite Vision ~5.5 GB, Granite Chat ~2.4 GB), which are loaded once at startup and persist as singletons, not per-request allocations.

### 5.5 Practical Performance

| Metric | Typical Value |
|--------|--------------|
| Total extraction time | 30–90 seconds per image |
| SAM inference | 30–40 seconds |
| Vision labelling | 3–8 seconds × $k$ components |
| Filtering overhead | < 0.5 seconds |
| Peak GPU VRAM | ~7.9 GB (all models loaded) |
| Peak CPU RAM | ~2 GB (image processing) |

---

## 6. Validation Results

| Test Diagram | Before Changes | After Changes | Notes |
|-------------|----------------|---------------|-------|
| LLM Architecture (bubble/flow diagram) | Over-filtered, oversized boxes, verbose multi-word labels | **22 components**, concise 1–3 word labels, tightly-fitting boxes | Largest component dropped from 2.35% to 0.93% of image area |
| System Architecture (CPU/RAM/GPU/CLK/Storage/I-O/Network/Cache) | Solid-coloured boxes rejected by complexity filter | **11 components** (8 real + 3 small unknowns), all 8 real components correctly labelled | Area-bypass and OR-logic in complexity filter resolved this |
| ROS Turtle Nested (`/turtle1` + children) | Only 2 of ~7 components detected | **4 components** (`/turtle1`, `/turtle1/cmd_vel`, `/B`, `/D`) | Remaining 3 inner nested boxes not detected by SAM (model limitation) |

---

## 7. Known Limitations

1. **SAM segmentation ceiling** — Thin-bordered rectangles sharing background colour with their container are invisible to SAM. This caps detection accuracy for densely nested diagrams.
2. **Vision model verbosity** — Despite prompt engineering and post-processing, the Granite Vision model occasionally produces unexpected label formats. The `_clean_label()` method handles known patterns but may not cover all edge cases.
3. **Sequential labelling** — Each component is labelled one at a time via a separate vision model forward pass. Batching crops would improve throughput but requires careful tensor padding and is not yet implemented.
4. **Fixed thresholds** — All filtering thresholds are static. An adaptive approach based on image statistics (e.g. adjusting `min_color_variance` based on overall image contrast) could improve generalisation across diagram styles.

---

## 8. Current Configuration Reference

```python
# Detection
confidence_threshold = 0.35
min_box_area         = 1000
iou_threshold        = 0.45
max_components       = 50
proximity_threshold  = 0.15

# Size Thresholds
max_area_ratio       = 0.85
min_area_ratio       = 0.004
min_dimension        = 30
max_aspect_ratio     = 4.0

# Visual Complexity
min_color_variance   = 10.0
min_edge_density     = 0.01

# Border Margin
edge_exclude_margin  = 0.02

# Box Tightening
tighten_boxes        = True
tighten_margin       = 0.15
tighten_bg_threshold = 12

# Containment Removal
container_min_area_ratio = 0.55
container_min_children   = 5
nesting_size_ratio       = 1.8

# Visual Complexity Bypass
complexity_bypass_area   = 0.015
```
