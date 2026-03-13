# Legacy AR Service Report (`ARv1.py`)

## Overview
`ARService` in `ARv1.py` is the legacy but feature-rich AR extraction pipeline. It uses SAM detections as input, then applies a layered set of geometric and visual heuristics to keep real components and reject artifacts (background gaps, floating text, empty regions). It also performs Granite Vision labeling and can infer relationships.

Compared to `ImprovedARService` (`ar_service.py`), this module is more heuristic-dense and more tightly integrated with vision labeling.

## Public APIs
- `extract_document_features(image_path, hints=None) -> List[Dict]`
- `analyze_component_relationships(components, image_path=None) -> Dict`

## End-to-End Extraction Algorithm
1. Scene profiling.
- Loads image and computes per-image context in `_analyze_scene_context`.
- Computes brightness, gradient-based edge density, coarse diagram style (`dense`, `structured`, `simple`), dominant border color, and light/dark background flag.

2. SAM segmentation with resilience.
- Runs SAM via `manager.ar_model(image_path)`.
- If CUDA OOM occurs, switches SAM to CPU and retries.
- Converts model output boxes to raw segments in `_extract_segments`.

3. Adaptive geometric filtering.
- `_compute_adaptive_area_bounds` adapts min/max area ratios based on image size, candidate count, and nearest-neighbor crowding.
- `_filter_segments` rejects low-confidence, too-small, too-large, extreme-aspect, edge-artifact, and border-noise boxes.

4. Bounding box refinement.
- `_tighten_boxes` contracts each box inward using border-intensity contrast to better fit true component boundaries.

5. Overlap and containment cleanup.
- `_remove_overlaps`: nesting-aware NMS with background container suppression.
- `_remove_high_overlap_pairs`: IoMin suppression for near-duplicate boxes.
- `_remove_contained_duplicates`: removes likely multi-component parent spans while preserving meaningful nesting.

6. Visual complexity and text/background rejection.
- `_filter_by_visual_complexity` is the key precision stage.
- Uses multiple rules together:
  - `_is_background_colored_region` for background-color similarity.
  - `_classify_text_layout` for boxed text vs floating text.
  - `_is_text_in_filled_container` to preserve stage/banner boxes that contain text.
  - `_is_floating_background_text` and `_is_floating_text_block` to reject floating text regions.
  - `_is_text_region` to reject standalone text-like segments.
  - `_is_empty_box` and `_is_gap_between_components_and_lines` to reject blank artifacts.

7. Component normalization.
- `_normalize_components` converts pixel boxes to normalized AR coordinates (`x`, `y`, `width`, `height`, centers, area).

8. Vision labeling.
- `_label_components` queries Granite Vision for labels.
- Current default query budget is broad (`max_vision_label_queries = max_components`), ranked by area.
- Uses hints and fallback labels when vision output is missing.
- `_query_vision_for_label` builds chat prompt via prompt builder and decodes concise labels.

9. Post-label cleanup.
- `_filter_text_labels` removes annotation-like labels (e.g., Figure/Step/Note patterns, overly long phrases).
- `_deduplicate_by_label` ensures unique names with suffixing.

## Relationship Detection Algorithm
`analyze_component_relationships` provides an optional second-stage graph pass:
- Proximity edges from `_detect_proximity_connections` using edge-to-edge distance.
- Optional vision edges from `_detect_connections_with_vision` using component-aware prompt.
- `_merge_connections` keeps spatially plausible links and discards long-range hallucinations.
- `_build_groups` returns connected groups via union-find.

## Why It Works Well on Complex Diagrams
- Layered rejectors combine geometry, texture, edge structure, and color-context.
- Explicit preservation of text-in-container components prevents over-filtering labeled boxes.
- Adaptive thresholds reduce one-size-fits-all failures across sparse vs dense pages.

## Operational Tradeoffs
- High heuristic complexity means more tuning burden.
- Many thresholds can interact in non-obvious ways across diagram styles.
- Vision labeling improves semantics but adds latency and model dependency.

## Dependencies
- `numpy`, `Pillow`, `torch`
- `app.services.model_manager.manager`
- `app.services.prompt_builder` (`COMPONENT_LABEL_PROMPT`, `build_connection_prompt`, `build_vision_chat_text`, `clean_label`, `make_unique_labels`)
