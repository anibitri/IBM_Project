# AR Service Report (`ar_service.py`)

## Overview
`ImprovedARService` is the current production-oriented AR pipeline. It combines SAM segmentation, optional classical contour recovery, adaptive mask scoring, terminal/connection analysis, and graph-based relationship inference.

Unlike older snapshots, the current main pipeline actively returns components, connections, and relationship metadata.

## Public API
- `extract_document_features(image_path: str, hints: List[str] = None) -> Dict`

Output structure:
- `components`: normalized components with geometry, confidence, shape features, terminals
- `componentCount`: number of components
- `connections`: inferred links between components
- `relationships`: graph-derived neighborhood and topology information
- `metadata`: image size, detected diagram type, aggregate connectivity counters

## End-to-End Algorithm
1. Image load and hint handling.
- Reads image and optional type hints (`uml`, `flowchart`, `sequence`).
- Hints can force structured behavior and relaxed thresholds.

2. Adaptive threshold calibration (`_calculate_adaptive_thresholds`).
- Computes grayscale variance and edge density.
- Performs line orientation analysis via Hough transform (horizontal/vertical/diagonal counts).
- Detects sequence-diagram signals (lifeline clusters).
- Counts geometric primitives (rectangles, diamonds, circles) and compartmented rectangles.
- Classifies diagram type and sets per-type thresholds:
	- `confidence_threshold`
	- `min_component_area` / `max_component_area`
	- aspect ratio bounds

3. SAM segmentation (`_run_sam`).
- Runs model manager SAM backend and converts masks to standardized dicts:
	- `segmentation`, `bbox`, `area`, `predicted_iou`

4. Optional contour supplement.
- For explicitly structured hints, runs `_detect_contour_components`.
- Uses edge-close and Otsu-binary contour passes.
- `_contour_to_candidate` validates area/fill/aspect/shape quality.
- `_merge_detection_results` merges contour candidates with SAM masks by IoU uniqueness.

5. Adaptive mask scoring and filtering.
- `_filter_masks_adaptive` computes score per mask and applies threshold policy.
- `_calculate_mask_score` uses multi-factor composite scoring:
	- size appropriateness
	- aspect ratio
	- edge density
	- texture variance
	- shape compactness
	- SAM confidence prior
- Includes hard rejects for:
	- huge background masks
	- tiny/huge normalized areas
	- border slivers
	- hollow gap regions
	- floating background text regions (new background-aware text block rejector)

6. De-duplication (`_non_maximum_suppression`).
- Removes high-overlap and containment duplicates using mask IoU plus containment ratio.

7. Component construction and semantic shape typing.
- `_masks_to_components` normalizes coordinates and attaches features.
- `_extract_shape_features` computes circularity, rectangularity, corner count, convexity, rotated-rect properties, and shape flags (diamond/oval/parallelogram).
- `_classify_by_shape` maps features to diagram-aware labels:
	- UML (class/interface/inheritance)
	- flowchart (process/decision/connector/terminator/data)
	- sequence (lifeline header/object/activation bar)
	- generic fallback categories

8. Terminal detection (`_detect_component_terminals`).
- Finds likely connection points on component boundaries (extremes and sampled contour points).

9. Connection inference (`_detect_connections`).
- Uses edge maps / skeleton logic and geometric plausibility tests to connect terminals/components.

10. Graph build and relationship analysis.
- `_build_connection_graph` constructs NetworkX graph.
- `_analyze_relationships` computes structural context (neighbors, connectivity, grouping-oriented metadata).

## Text and Background Artifact Handling
Current improved service includes a dedicated background-color model and frame-aware text rejection in scoring:
- Estimates dominant background color from border regions.
- Detects floating text-like masks in background-colored regions.
- Preserves framed containers with text so valid stage/banner components are retained.

## Key Strengths
- Balanced hybrid detection (SAM + classical CV recovery path).
- Diagram-type-aware thresholding rather than a single global rule set.
- End-to-end structure output: components plus usable connection graph.
- Better resilience to floating-text background artifacts through scoring hard rejects.

## Tradeoffs
- Heuristic scoring still requires tuning across highly diverse visual styles.
- Connection stage increases runtime versus pure component-only extraction.
- Heavy dependency on SAM quality for initial candidate recall.

## Dependencies
- `numpy`, `opencv-python`, `Pillow`
- `scipy`, `skimage`, `networkx`
- `app.services.model_manager.manager`
