# Legacy AR Service Report (`ARv1.py`)

## Overview

`ARv1.py` is the legacy AR extraction pipeline, preserved for comparison and rollback purposes. The current production service is `ar_service.py` — see [`ar_service_report.md`](ar_service_report.md) for the active implementation.

The key differences between ARv1 and the current service are:

| Feature                          | ARv1 (`ARv1.py`)                        | Current (`ar_service.py`)                              |
|----------------------------------|-----------------------------------------|--------------------------------------------------------|
| Vision labeling                  | Yes — queries Granite Vision per component | No — labels from shape classification only          |
| SAM model                        | SAM via direct path call                | SAM 2 Tiny via `manager.ar_model(img_array, ...)`      |
| Diagram-type-aware detection     | No — single pipeline for all types     | Yes — dedicated sequence pipeline + per-type scoring   |
| Sequence diagram support         | General pipeline only                   | Structural lifeline-based pipeline                     |
| Output format                    | Returns `List[Dict]` directly           | Returns `Dict` with components, connections, metadata  |
| Architecture type handling       | Not present                             | Explicit hint + 70 % max area for containers           |
| Connection detection             | Proximity + optional vision             | Edge/skeleton-based geometric inference                |
| `_type_specific_filter`          | Not present                             | Per-type score adjustments and hard rejects            |

---

## ARv1 Pipeline Summary

### 1. Scene Profiling — `_analyze_scene_context`

Computes per-image context: brightness, gradient-based edge density, coarse diagram style (`dense`, `structured`, `simple`), dominant border color, and light/dark background flag. This context is threaded through the rest of the pipeline to adapt thresholds.

### 2. SAM Segmentation

Runs SAM via `manager.ar_model(image_path)`. If CUDA OOM occurs mid-inference, it switches SAM to CPU and retries automatically. Converts model output bounding boxes to raw segment dicts via `_extract_segments`.

### 3. Adaptive Geometric Filtering — `_filter_segments`

`_compute_adaptive_area_bounds` adapts the min/max area ratio based on image size, candidate count, and nearest-neighbor crowding. `_filter_segments` then rejects:
- Low-confidence detections.
- Too-small or too-large boxes.
- Extreme aspect ratios.
- Edge artifacts and border-noise boxes.

### 4. Bounding Box Refinement — `_tighten_boxes`

Contracts each box inward using border-intensity contrast to better fit true component boundaries. This compensates for SAM's tendency to include a small margin of background around detected regions.

### 5. Overlap and Containment Cleanup

Three passes remove duplicates and over-detections:
- `_remove_overlaps` — nesting-aware NMS with background container suppression.
- `_remove_high_overlap_pairs` — IoMin suppression for near-duplicate boxes.
- `_remove_contained_duplicates` — removes multi-component parent spans while preserving meaningful nesting.

### 6. Visual Complexity Rejection — `_filter_by_visual_complexity`

The key precision stage for ARv1. Uses multiple rules together:
- `_is_background_colored_region` — background-color similarity test.
- `_classify_text_layout` — distinguishes boxed text (keep) from floating text (reject).
- `_is_text_in_filled_container` — preserves stage/banner boxes that contain text.
- `_is_floating_background_text` and `_is_floating_text_block` — rejects floating annotation regions.
- `_is_text_region` — rejects standalone text-like segments.
- `_is_empty_box` and `_is_gap_between_components_and_lines` — rejects blank artifacts.

### 7. Component Normalization — `_normalize_components`

Converts pixel boxes to normalized AR coordinates (`x`, `y`, `width`, `height`, centers, area).

### 8. Vision Labeling — `_label_components`

Queries Granite Vision for a label for each detected component. The query budget defaults to all components, ranked by area. Uses `COMPONENT_LABEL_PROMPT` and decodes concise 1–4 word labels. Falls back to hints and generic labels when vision output is missing.

`_filter_text_labels` removes annotation-like labels (Figure/Step/Note patterns, overly long phrases) after labeling. `_deduplicate_by_label` ensures unique names with numeric suffixes.

### 9. Relationship Detection — `analyze_component_relationships`

Optional second-stage graph pass:
- `_detect_proximity_connections` — proximity edges using edge-to-edge distance.
- `_detect_connections_with_vision` — optional vision-based connection inference using the component-position prompt.
- `_merge_connections` — keeps spatially plausible links, discards long-range hallucinations.
- `_build_groups` — returns connected groups via union-find.

---

## Why ARv1 Was Superseded

ARv1 worked well but had several structural limitations:
1. **Vision labeling per component** added 5–30 seconds per detected component, making the total pipeline slow for diagrams with 10+ components.
2. **No diagram-type awareness** — the same filtering rules were applied to sequence diagrams, UML class diagrams, and architecture diagrams, causing characteristic false positives for each.
3. **Output format** returned a bare list, making it harder for callers to access connection and metadata information without additional post-processing.
4. **No dedicated sequence pipeline** — sequence diagram space-rectangles (gaps between lifelines) were often detected as false positive components.

The current `ar_service.py` addresses all these limitations while reusing the core insight from ARv1: that layered rejection of artifacts (empty regions, floating text, background blobs) is more reliable than trying to detect only true positives from the start.

---

## Dependencies

- `numpy`, `Pillow`, `torch`
- `app.services.model_manager.manager`
- `app.services.prompt_builder` (`COMPONENT_LABEL_PROMPT`, `build_connection_prompt`, `build_vision_chat_text`, `clean_label`, `make_unique_labels`)
