"""
ar_service.py - Improved AR Component Detection & Connection Analysis

Key improvements:
1. No vision model usage (pure SAM + classical CV)
2. Adaptive thresholds based on image characteristics
3. Advanced connection detection using line tracing
4. Port/terminal detection on components
5. Graph-based relationship analysis
6. 10-15 second total processing time
"""

import numpy as np
import cv2
from PIL import Image
from typing import List, Dict, Tuple, Optional
import logging
from scipy.spatial.distance import cdist
from skimage.morphology import skeletonize
from collections import defaultdict
import networkx as nx
from app.services.model_manager import manager


logger = logging.getLogger(__name__)


class ARService:
    def __init__(self):
        self.debug = False
        
        # Adaptive thresholds (will be calculated per image)
        self.min_component_area = 500
        self.max_component_area = 100000
        self.min_aspect_ratio = 0.2
        self.max_aspect_ratio = 5.0
        self.confidence_threshold = 0.7

        # Scene background model (estimated per image)
        self._bg_rgb = np.array([245.0, 245.0, 245.0], dtype=np.float32)
        self._bg_dominance = 0.0
        self._is_light_background = True
    
    def _run_sam(self, img_array: np.ndarray) -> List[Dict]:
        """Run SAM via model manager and convert ultralytics output to mask dicts."""
        if manager.ar_model is None:
            logger.warning("SAM model not loaded in model manager")
            return []
        
        results = manager.ar_model(img_array, device=manager.ar_device, verbose=False)
        
        masks = []
        for result in results:
            if result.masks is None:
                continue
            
            h, w = img_array.shape[:2]
            mask_data = result.masks.data.cpu().numpy()  # (N, H, W)
            
            for i in range(mask_data.shape[0]):
                seg = mask_data[i].astype(bool)
                
                # Resize mask if it doesn't match image dimensions
                if seg.shape != (h, w):
                    seg = cv2.resize(seg.astype(np.uint8), (w, h),
                                     interpolation=cv2.INTER_NEAREST).astype(bool)
                
                # Compute bounding box from mask
                ys, xs = np.where(seg)
                if len(xs) == 0:
                    continue
                x_min, x_max = int(xs.min()), int(xs.max())
                y_min, y_max = int(ys.min()), int(ys.max())
                bbox_w = x_max - x_min
                bbox_h = y_max - y_min
                area = int(seg.sum())
                
                conf = float(result.boxes.conf[i]) if result.boxes is not None else 0.8
                
                masks.append({
                    'segmentation': seg,
                    'bbox': [x_min, y_min, bbox_w, bbox_h],
                    'area': area,
                    'predicted_iou': conf,
                })
        
        return masks
    
    def extract_document_features(self, image_path: str, hints: List[str] = None):
        """
        Main extraction pipeline - No vision model used
        
        Pipeline:
        1. Analyze image characteristics
        2. Calculate adaptive thresholds
        3. Run SAM segmentation
        4. Filter and score masks
        5. Detect component terminals/ports
        6. Detect connecting lines/wires
        7. Build connection graph
        8. Analyze relationships
        """
        logger.info(f"📐 Extracting AR features from: {image_path}")
        
        # Load image
        try:
            img = Image.open(image_path).convert('RGB')
        except (FileNotFoundError, OSError) as e:
            logger.warning(f"Cannot open image: {e}")
            return {
                'components': [],
                'componentCount': 0,
                'connections': [],
                'relationships': {},
                'metadata': {}
            }
        img_array = np.array(img)
        
        print(f"📊 Image size: {img.width} × {img.height}")
        
        # Step 1: Analyze image and calculate adaptive thresholds
        self._hint_diagram_type = None   # explicit hint from caller
        if hints:
            _lower = [h.lower() for h in hints]
            if any(k in ' '.join(_lower) for k in ('sequence', 'sequence diagram', 'lifeline')):
                self._hint_diagram_type = 'sequence'
            elif any(k in ' '.join(_lower) for k in ('uml', 'class diagram')):
                self._hint_diagram_type = 'uml'
            elif any(k in ' '.join(_lower) for k in ('flowchart', 'flow chart', 'flow diagram')):
                self._hint_diagram_type = 'flowchart'
            elif any(k in ' '.join(_lower) for k in ('architecture', 'system diagram', 'infrastructure')):
                self._hint_diagram_type = 'architecture'
        self._calculate_adaptive_thresholds(img)
        
        # Sequence diagrams use a dedicated structural pipeline
        is_sequence = (self.diagram_type == 'sequence')
        if is_sequence:
            print("🎞️ Sequence diagram detected — using structural pipeline")
            seq_components = self._detect_sequence_components(img_array, img)
            if seq_components:
                print(f"✅ AR extraction complete (sequence): {len(seq_components)} components")
                return {
                    'components': seq_components,
                    'componentCount': len(seq_components),
                    'connections': [],
                    'relationships': {},
                    'metadata': {
                        'image_size': {'width': img.width, 'height': img.height},
                        'diagram_type': 'sequence',
                        'total_connections': 0,
                        'connected_components': 0
                    }
                }
            print("⚠️  Sequence pipeline found nothing, falling back to SAM pipeline")

        # Step 2: Run SAM detection
        print("🔍 Running SAM segmentation...")
        masks = self._run_sam(img_array)
        print(f"   SAM detected {len(masks)} initial masks")

        # Step 2b: Classical contour detection — always run, not just for hinted types.
        # Contour detection reliably finds closed rectangular/circular shapes (components),
        # which SAM often over-segments into sub-regions or misses entirely.
        print("🔲 Running contour-based detection...")
        contour_masks = self._detect_contour_components(img)
        print(f"   Contour detection found {len(contour_masks)} candidates")
        masks = self._merge_detection_results(masks, contour_masks)
        print(f"   Merged to {len(masks)} total masks")

        # Step 3: Filter and score masks
        filtered_masks = self._filter_masks_adaptive(masks, img)
        print(f"   Filtered to {len(filtered_masks)} valid components")

        # Step 4: Convert to bounding boxes with features
        components = self._masks_to_components(filtered_masks, img)
        print(f"   Extracted {len(components)} components")
        
        # Step 5: Detect terminals/ports on components
        components = self._detect_component_terminals(components, img_array)
        print(f"   Detected terminals on components")
        
        # Step 6: Detect connecting lines/wires
        connections = self._detect_connections(components, img_array)
        print(f"   Found {len(connections)} direct connections")
        
        # Step 7: Build connectivity graph
        graph = self._build_connection_graph(components, connections)
        
        # Step 8: Analyze spatial relationships
        relationships = self._analyze_relationships(components, connections, graph)
        
        # Strip non-serializable fields from components
        for comp in components:
            comp.pop('segmentation', None)
        
        print(f"✅ AR extraction complete: {len(components)} components, {len(connections)} connections")
        
        return {
            'components': components,
            'componentCount': len(components),
            'connections': connections,
            'relationships': relationships,
            'metadata': {
                'image_size': {'width': img.width, 'height': img.height},
                'diagram_type': self.diagram_type,
                'total_connections': len(connections),
                'connected_components': len([c for c in components if c.get('connection_count', 0) > 0])
            }
        }
    
    def _calculate_adaptive_thresholds(self, img: Image.Image):
        """Calculate thresholds based on image characteristics.
        
        Detects diagram type (UML, flowchart, circuit, etc.) using
        line orientation analysis and rectangle counting.
        """
        rgb_array = np.array(img.convert('RGB'))
        img_array = np.array(img.convert('L'))
        
        # Image statistics
        img_area = img.width * img.height
        overall_variance = np.var(img_array)
        
        # Detect edges to understand diagram complexity
        edges = cv2.Canny(img_array, 50, 150)
        edge_density = edges.sum() / img_area

        # Build a simple global background-colour model.
        self._estimate_background_model(rgb_array)
        
        # --- Line orientation analysis for diagram type detection ---
        lines = cv2.HoughLinesP(edges, 1, np.pi / 180, threshold=30,
                                minLineLength=20, maxLineGap=5)
        h_lines = 0   # horizontal
        v_lines = 0   # vertical
        d_lines = 0   # diagonal / angled
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
                if angle < 15 or angle > 165:
                    h_lines += 1
                elif 75 < angle < 105:
                    v_lines += 1
                else:
                    d_lines += 1
        total_lines = h_lines + v_lines + d_lines + 1  # avoid div-0
        hv_ratio = (h_lines + v_lines) / total_lines
        
        # --- Lifeline detection (sequence diagram signal) ---
        # Cluster vertical line segments by x-position.  A real lifeline
        # spans a significant portion of the image height; short box edges
        # don't qualify.
        lifeline_count = 0
        img_h_px = img_array.shape[0]
        if lines is not None:
            v_line_data = []  # (x_mid, y_lo, y_hi)
            for line in lines:
                x1, y1, x2, y2 = line[0]
                angle = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
                if 75 < angle < 105:
                    v_line_data.append(((x1 + x2) // 2, min(y1, y2), max(y1, y2)))
            if v_line_data:
                v_line_data.sort(key=lambda d: d[0])
                clusters = [[v_line_data[0]]]
                for vld in v_line_data[1:]:
                    if vld[0] - clusters[-1][-1][0] < 20:
                        clusters[-1].append(vld)
                    else:
                        clusters.append([vld])
                for cluster in clusters:
                    if len(cluster) < 3:
                        continue
                    # Vertical span of all segments in this cluster
                    span_lo = min(d[1] for d in cluster)
                    span_hi = max(d[2] for d in cluster)
                    if (span_hi - span_lo) > img_h_px * 0.40:
                        lifeline_count += 1
        
        # --- Rectangle counting (strong signal for UML / flowcharts) ---
        # For dark backgrounds, THRESH_BINARY_INV makes the dark background white and
        # box interiors black — contours then trace the interior fill, not the box border.
        # Use THRESH_BINARY instead so light shapes on dark backgrounds become foreground.
        _thresh_flag = cv2.THRESH_BINARY_INV if self._is_light_background else cv2.THRESH_BINARY
        _, binary = cv2.threshold(img_array, 0, 255, _thresh_flag + cv2.THRESH_OTSU)
        contours_all, _ = cv2.findContours(binary, cv2.RETR_TREE,
                                           cv2.CHAIN_APPROX_SIMPLE)
        rect_count = 0
        diamond_count = 0
        circle_count = 0
        for c in contours_all:
            area = cv2.contourArea(c)
            if area < 400:
                continue
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            x, y, w, h = cv2.boundingRect(c)
            fill = area / (w * h) if w * h > 0 else 0
            aspect = max(w, h) / (min(w, h) + 1e-6)
            circ = (4 * np.pi * area) / (peri ** 2) if peri > 0 else 0
            if len(approx) == 4 and fill > 0.8 and 0.3 < aspect < 3.5:
                rect_count += 1
            elif len(approx) == 4 and fill < 0.65 and aspect < 2.0:
                diamond_count += 1
            elif circ > 0.75:
                circle_count += 1
        
        # --- Detect compartmented rectangles (UML class-specific) ---
        # A compartmented rectangle has internal horizontal lines that
        # divide it into sections.  Simple architecture blocks don't.
        compartmented = 0
        for c in contours_all:
            area_c = cv2.contourArea(c)
            if area_c < 800:
                continue
            xr, yr, wr, hr = cv2.boundingRect(c)
            peri_c = cv2.arcLength(c, True)
            approx_c = cv2.approxPolyDP(c, 0.02 * peri_c, True)
            fill_c = area_c / (wr * hr) if wr * hr > 0 else 0
            aspect_c = max(wr, hr) / (min(wr, hr) + 1e-6)
            if len(approx_c) == 4 and fill_c > 0.8 and 0.3 < aspect_c < 4.0:
                # Check for horizontal lines inside this rectangle
                roi = img_array[yr:yr+hr, xr:xr+wr]
                roi_edges = cv2.Canny(roi, 50, 150)
                h_lines_inner = cv2.HoughLinesP(
                    roi_edges, 1, np.pi / 180, threshold=20,
                    minLineLength=int(wr * 0.5), maxLineGap=5)
                if h_lines_inner is not None and len(h_lines_inner) >= 1:
                    # Count lines that span most of the box width
                    for hl in h_lines_inner:
                        hx1, hy1, hx2, hy2 = hl[0]
                        if abs(hy1 - hy2) < 5 and abs(hx2 - hx1) > wr * 0.4:
                            compartmented += 1
                            break
        
        # --- Classify diagram type ---
        # Honour explicit hint first
        _hint = getattr(self, '_hint_diagram_type', None)
        if _hint == 'sequence':
            self.diagram_type = 'sequence'
            self.min_component_area = max(200, int(img_area * 0.001))
            self.max_component_area = int(img_area * 0.25)
            self.max_aspect_ratio = 8.0
            self.min_aspect_ratio = 0.10
        elif _hint == 'uml':
            self.diagram_type = 'uml'
            self.min_component_area = max(200, int(img_area * 0.001))
            self.max_component_area = int(img_area * 0.20)
            self.max_aspect_ratio = 6.0
            self.min_aspect_ratio = 0.15
        elif _hint == 'flowchart':
            self.diagram_type = 'flowchart'
            self.min_component_area = max(200, int(img_area * 0.002))
            self.max_component_area = int(img_area * 0.18)
            self.max_aspect_ratio = 5.0
            self.min_aspect_ratio = 0.15
        elif _hint == 'architecture':
            # Architecture: service boxes + large group containers
            self.diagram_type = 'architecture'
            self.min_component_area = max(300, int(img_area * 0.002))
            self.max_component_area = int(img_area * 0.70)   # containers can be very large
            self.max_aspect_ratio = 10.0
            self.min_aspect_ratio = 0.10
        elif (lifeline_count >= 3 and h_lines > v_lines * 2.5 and
              lifeline_count > compartmented and rect_count >= 3):
            # Sequence diagram: parallel vertical lifelines, many horizontal messages
            self.diagram_type = 'sequence'
            self.min_component_area = max(300, int(img_area * 0.002))
            self.max_component_area = int(img_area * 0.20)
            self.max_aspect_ratio = 8.0
            self.min_aspect_ratio = 0.10
        elif (hv_ratio > 0.80 and compartmented >= 3 and
              rect_count >= 5 and diamond_count <= 1):
            # Strong UML evidence: many compartmented rectangles
            self.diagram_type = 'uml'
            self.min_component_area = max(300, int(img_area * 0.003))
            self.max_component_area = int(img_area * 0.18)
            self.max_aspect_ratio = 6.0
            self.min_aspect_ratio = 0.15
        elif (diamond_count >= 1 or
              (diamond_count >= 1 and circle_count >= 2) or
              (rect_count >= 3 and d_lines > total_lines * 0.15)):
            # Flowchart evidence — one diamond is sufficient
            self.diagram_type = 'flowchart'
            self.min_component_area = max(300, int(img_area * 0.003))
            self.max_component_area = int(img_area * 0.18)
            self.max_aspect_ratio = 5.0
            self.min_aspect_ratio = 0.15
        elif edge_density > 0.05:
            self.diagram_type = 'dense'
            self.max_aspect_ratio = 4.0
            self.min_component_area = max(500, int(img_area * 0.002))
            self.max_component_area = int(img_area * 0.20)
        elif edge_density > 0.02:
            self.diagram_type = 'medium'
            self.max_aspect_ratio = 5.0
            self.min_component_area = max(500, int(img_area * 0.002))
            self.max_component_area = int(img_area * 0.20)
        else:
            self.diagram_type = 'sparse'
            self.max_aspect_ratio = 6.0
            self.min_component_area = max(500, int(img_area * 0.002))
            self.max_component_area = int(img_area * 0.20)
        
        print(f"📊 Diagram type: {self.diagram_type}  bg={'light' if self._is_light_background else 'dark'}  "
              f"lifelines={lifeline_count}  rects={rect_count}  h/v={h_lines}/{v_lines}  compartmented={compartmented}")
        if self.debug:
            print(f"   diamonds: {diamond_count}  circles: {circle_count}  d_lines: {d_lines}")
            print(f"   Edge density: {edge_density:.4f}  Variance: {overall_variance:.1f}")
            print(f"   Min area: {self.min_component_area} px²  Max area: {self.max_component_area} px²")

    def _estimate_background_model(self, rgb_array: np.ndarray):
        """Estimate dominant background colour (robust for light/dark themes)."""
        h, w = rgb_array.shape[:2]
        if h < 4 or w < 4:
            return

        b = max(2, min(h, w) // 18)
        border = np.concatenate([
            rgb_array[:b, :, :].reshape(-1, 3),
            rgb_array[-b:, :, :].reshape(-1, 3),
            rgb_array[:, :b, :].reshape(-1, 3),
            rgb_array[:, -b:, :].reshape(-1, 3),
        ], axis=0)

        q = (border // 20) * 20
        colors, counts = np.unique(q, axis=0, return_counts=True)
        if len(colors) == 0:
            return

        idx = int(np.argmax(counts))
        self._bg_rgb = np.clip(colors[idx].astype(np.float32) + 10.0, 0, 255)
        self._bg_dominance = float(counts[idx] / max(len(border), 1))
        self._is_light_background = bool(np.mean(self._bg_rgb) >= 145.0)

    def _has_rect_frame(self, gray_region: np.ndarray) -> bool:
        """Detect border frame lines to preserve text-in-box components."""
        h, w = gray_region.shape[:2]
        if h < 12 or w < 12:
            return False

        gx = np.abs(np.diff(gray_region, axis=1, prepend=gray_region[:, :1]))
        gy = np.abs(np.diff(gray_region, axis=0, prepend=gray_region[:1, :]))
        g = np.sqrt(gx ** 2 + gy ** 2)

        b = max(1, min(h, w) // 12)
        top = float(np.mean(g[:b, :] > 11))
        bottom = float(np.mean(g[-b:, :] > 11))
        left = float(np.mean(g[:, :b] > 11))
        right = float(np.mean(g[:, -b:] > 11))

        return (top > 0.13 and bottom > 0.13) or (left > 0.13 and right > 0.13)

    def _is_background_like_region(self, rgb_region: np.ndarray) -> bool:
        """Check whether region colour is close to estimated background."""
        h, w = rgb_region.shape[:2]
        if h < 2 or w < 2:
            return False

        my = max(1, int(h * 0.15))
        mx = max(1, int(w * 0.15))
        core = rgb_region[my:h - my, mx:w - mx] if (h > 2 * my + 2 and w > 2 * mx + 2) else rgb_region

        mean_rgb = np.mean(core, axis=(0, 1)).astype(np.float32)
        spread = float(np.mean(np.std(core, axis=(0, 1))))
        dist = float(np.linalg.norm(mean_rgb - self._bg_rgb))

        threshold = 38.0 if self._bg_dominance > 0.25 else 32.0
        return dist < threshold and spread < 34.0

    def _looks_like_floating_text(
        self,
        gray_region: np.ndarray,
        rgb_region: np.ndarray,
        norm_area: float,
    ) -> bool:
        """Reject floating text areas while keeping real text-containing boxes."""
        h, w = gray_region.shape[:2]
        if h < 10 or w < 16:
            return False

        if not self._is_background_like_region(rgb_region):
            return False

        # Preserve any framed/boxed container with text.
        if self._has_rect_frame(gray_region):
            return False

        gx = np.abs(np.diff(gray_region, axis=1, prepend=gray_region[:, :1]))
        gy = np.abs(np.diff(gray_region, axis=0, prepend=gray_region[:1, :]))
        grad = np.sqrt(gx ** 2 + gy ** 2)

        border = np.concatenate([
            gray_region[0, :], gray_region[-1, :], gray_region[:, 0], gray_region[:, -1]
        ])
        bg_val = float(np.median(border))
        content = np.abs(gray_region - bg_val) > 18
        fill_ratio = float(np.mean(content))

        row_density = np.mean(content, axis=1)
        active = row_density > 0.08
        transitions = np.diff(active.astype(np.int32), prepend=0, append=0)
        text_bands = int(np.sum(transitions == 1))

        border_support = float(np.mean(grad[[0, -1], :] > 11) + np.mean(grad[:, [0, -1]] > 11)) * 0.5
        center_dense = float(np.mean(grad > 10))

        if self._is_light_background:
            return (
                norm_area < 0.10 and
                text_bands >= 1 and
                border_support < 0.11 and
                0.02 <= fill_ratio <= 0.58 and
                center_dense > 0.03
            )

        return (
            norm_area < 0.08 and
            text_bands >= 2 and
            border_support < 0.10 and
            fill_ratio <= 0.55
        )
    
    def _filter_masks_adaptive(self, masks: List[Dict], img: Image.Image) -> List[Dict]:
        """Filter masks using multi-factor scoring"""
        img_array = np.array(img.convert('L'))
        img_rgb = np.array(img.convert('RGB'))
        filtered = []
        
        for mask in masks:
            # Extract mask region
            segmentation = mask['segmentation']
            bbox = mask['bbox']  # [x, y, w, h]
            
            # Calculate score
            score = self._calculate_mask_score(mask, segmentation, img_array, img_rgb)
            
            # Lower threshold for structured diagram types (explicit hint OR auto-detected)
            _diag = getattr(self, '_hint_diagram_type', None) or getattr(self, 'diagram_type', 'medium')
            if _diag in ('uml', 'flowchart', 'sequence'):
                keep_threshold = 0.40
            else:
                keep_threshold = self.confidence_threshold
            if score > keep_threshold:  # Threshold for keeping mask
                mask['quality_score'] = score
                filtered.append(mask)
        
        # Sort by score and apply NMS
        filtered.sort(key=lambda x: x['quality_score'], reverse=True)
        filtered = self._non_maximum_suppression(filtered)
        
        return filtered
    
    def _calculate_mask_score(
        self,
        mask: Dict,
        segmentation: np.ndarray,
        img_array: np.ndarray,
        img_rgb: np.ndarray,
    ) -> float:
        """Multi-factor quality score for mask"""
        
        # Get bounding box
        x, y, w, h = mask['bbox']
        area = mask['area']
        img_h, img_w = img_array.shape[:2]
        img_area = img_h * img_w
        
        # Pre-compute border-touching flag (used in multiple checks)
        border_margin = 3
        touches_any_border = (
            x <= border_margin or y <= border_margin or
            (x + w) >= img_w - border_margin or (y + h) >= img_h - border_margin
        )
        
        # Hard reject: mask covers > 40% of image (background)
        if area / img_area > 0.40:
            return 0.0

        # Hard reject: bounding box spans > 80% in both dims (full-image)
        if w / img_w > 0.80 and h / img_h > 0.80:
            return 0.0

        # Hard reject: large canvas / whitespace segments on light backgrounds.
        # On light-background diagrams SAM often produces a single large mask
        # that covers the empty canvas area (grid or plain white).  These regions
        # have norm_area > 0.12 but contain almost no meaningful content —
        # check the interior of the bbox directly here before expensive scoring.
        if (w * h) / img_area > 0.12 and self._is_light_background:
            y1c, y2c = max(0, y), min(img_h, y + h)
            x1c, x2c = max(0, x), min(img_w, x + w)
            region_check = img_array[y1c:y2c, x1c:x2c]
            if region_check.size > 0:
                rh, rw = region_check.shape[:2]
                mry = max(3, int(rh * 0.15))
                mrx = max(3, int(rw * 0.15))
                interior_check = region_check[mry:rh - mry, mrx:rw - mrx]
                if interior_check.size > 0:
                    ic_edges = cv2.Canny(interior_check, 50, 150)
                    ic_edge_density = ic_edges.sum() / interior_check.size
                    ic_variance = float(np.var(interior_check))
                    # Very low content → canvas artifact, not a component
                    if ic_edge_density < 0.005 and ic_variance < 40:
                        return 0.0
        
        # Hard reject: normalised bbox area too small or too large
        # Use relaxed thresholds for structured diagram types (explicit hint OR auto-detected)
        norm_area = (w * h) / img_area
        _hint = getattr(self, '_hint_diagram_type', None)
        _diag = _hint or getattr(self, 'diagram_type', 'medium')
        _min_norm = 0.001 if _diag in ('uml', 'flowchart', 'sequence', 'architecture') else 0.004
        if _diag == 'architecture':
            _max_norm = 0.70   # allow large group containers
        elif _diag in ('uml', 'flowchart', 'sequence'):
            _max_norm = 0.25
        else:
            _max_norm = 0.20
        if norm_area < _min_norm:
            return 0.0
        if norm_area > _max_norm:
            return 0.0
        
        # Hard reject: thin bands touching borders (title bars, borders, margins)
        aspect_ratio_raw = max(w, h) / (min(w, h) + 1e-6)
        if aspect_ratio_raw > 6.0 and touches_any_border:
            return 0.0

        # Hard reject: toolbar / UI elements at the very bottom of screen captures.
        # The bottom 6% of a screenshot often contains application toolbars.
        # Only applies to components that don't also touch the top (so we don't
        # reject full-height elements like sidebars), and aren't unusually large.
        bottom_margin = int(img_h * 0.06)
        touches_bottom_only = (y + h >= img_h - bottom_margin) and (y > img_h * 0.5)
        if touches_bottom_only and norm_area < 0.08:
            return 0.0

        # Hard reject: triangular shapes — these are arrowheads, not components
        seg_contours_early, _ = cv2.findContours(
            segmentation.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )
        if seg_contours_early:
            peri_early = cv2.arcLength(seg_contours_early[0], True)
            approx_early = cv2.approxPolyDP(seg_contours_early[0], 0.04 * peri_early, True)
            if len(approx_early) == 3:
                return 0.0
        
        # Hard reject: large irregular blobs (merged segments covering multiple components)
        # Real components are roughly rectangular; blobs have low fill ratio
        if norm_area > 0.08:
            bbox_pixel_area = w * h
            fill_ratio = area / bbox_pixel_area if bbox_pixel_area > 0 else 0
            if fill_ratio < 0.6:
                return 0.0
        
        # Factor 1: Size appropriateness (0-1)
        if area < self.min_component_area:
            size_score = 0.0
        elif area > self.max_component_area:
            size_score = 0.0
        else:
            relative_area = area / img_area
            if _diag in ('uml', 'flowchart', 'sequence'):
                # Relaxed for structured diagram types
                if 0.002 < relative_area < 0.08:
                    size_score = 1.0
                elif 0.001 < relative_area <= 0.002:
                    size_score = 0.7
                elif relative_area < 0.001:
                    size_score = 0.3
                else:
                    size_score = 0.5
            else:
                if 0.005 < relative_area < 0.05:
                    size_score = 1.0
                elif 0.003 < relative_area <= 0.005:
                    size_score = 0.7
                elif relative_area < 0.003:
                    size_score = 0.0
                else:
                    size_score = 0.5
        
        # Factor 2: Aspect ratio (0-1)
        aspect_ratio = max(w, h) / (min(w, h) + 1e-6)
        if self.min_aspect_ratio < aspect_ratio < self.max_aspect_ratio:
            aspect_score = 1.0
        else:
            aspect_score = max(0.0, 1.0 - abs(aspect_ratio - 3.0) / 10)
        
        # Factor 3: Edge density (components should have clear edges)
        y1, y2 = max(0, y), min(img_h, y + h)
        x1, x2 = max(0, x), min(img_w, x + w)
        region = img_array[y1:y2, x1:x2]
        region_rgb = img_rgb[y1:y2, x1:x2] if img_rgb.size > 0 else np.zeros((0, 0, 3), dtype=np.uint8)

        # Hard reject floating background-text regions, but keep boxed components with text.
        if region.size > 0 and region_rgb.size > 0:
            if self._looks_like_floating_text(region.astype(np.float32), region_rgb, norm_area):
                return 0.0
        
        if region.size > 0:
            edges = cv2.Canny(region, 50, 150)
            edge_density = edges.sum() / region.size
            edge_score = min(1.0, edge_density * 500)
        else:
            edge_score = 0.0
        
        # Factor 4: Texture complexity (avoid blank regions)
        if region.size > 0:
            texture_variance = np.var(region)
            texture_score = min(1.0, texture_variance / 100)
        else:
            texture_score = 0.0
        
        # Hard reject: empty gap regions (hollow inside)
        # In sequence diagrams, SAM segments the space between vertical lifelines.
        # These regions are uniform inside regardless of boundary edges.
        # Sequence diagram gaps contain dashed lifelines and stray message arrows
        # which create some edge content (density 1-6), so use relaxed thresholds.
        if region.size > 0:
            rh, rw = region.shape[:2]
            if rh >= 6 and rw >= 6:
                # Shrink the region inward by ~15% on each side
                margin_x = max(3, int(rw * 0.15))
                margin_y = max(3, int(rh * 0.15))
                interior = region[margin_y:rh - margin_y, margin_x:rw - margin_x]
                if interior.size > 0:
                    interior_edges = cv2.Canny(interior, 50, 150)
                    interior_edge_density = interior_edges.sum() / interior.size
                    interior_variance = np.var(interior)
                    _diag = getattr(self, 'diagram_type', 'medium')
                    if _diag == 'sequence':
                        # Sequence gaps have sparse dashed lines (density 1-6, var 100-700)
                        # Real components have dense text/edges (density 14+, var 900+)
                        if interior_edge_density < 8 and interior_variance < 800:
                            return 0.0
                    else:
                        # Only reject uniform interiors that are also background-coloured
                        # AND have no visible border frame.
                        # Solid-fill components on dark backgrounds have low interior
                        # variance/edge-density (dark fill ≈ dark background) but they
                        # DO have a visible border — _has_rect_frame catches those.
                        if interior_edge_density < 0.002 and interior_variance < 15:
                            interior_rgb = region_rgb[margin_y:rh - margin_y, margin_x:rw - margin_x]
                            if interior_rgb.size > 0:
                                interior_color = np.mean(interior_rgb.reshape(-1, 3), axis=0)
                                bg_diff = float(np.linalg.norm(interior_color - self._bg_rgb))
                                if bg_diff < 40 and not self._has_rect_frame(region):
                                    return 0.0
                            else:
                                if not self._has_rect_frame(region):
                                    return 0.0
        
        # Factor 5: Shape compactness (prefer regular shapes)
        contours_found = cv2.findContours(
            segmentation.astype(np.uint8), 
            cv2.RETR_EXTERNAL, 
            cv2.CHAIN_APPROX_SIMPLE
        )[0]
        
        if len(contours_found) > 0:
            perimeter = cv2.arcLength(contours_found[0], True)
        else:
            perimeter = 0
        
        if perimeter > 0:
            compactness = (4 * np.pi * area) / (perimeter ** 2)
            compactness_score = min(1.0, compactness)
        else:
            compactness_score = 0.5
        
        # Factor 6: Border penalty — only penalise very large masks that touch edges
        # Small/medium components at the edge are fine (e.g. CLK at right side)
        mask_area_ratio = area / img_area  # use actual mask area, not bbox
        if touches_any_border and mask_area_ratio > 0.15:
            # Very large mask touching border = likely background
            border_penalty = 0.3
        elif touches_any_border and mask_area_ratio > 0.10:
            border_penalty = 0.1
        else:
            border_penalty = 0.0
        
        # Factor 7: Rectangularity bonus — clearly rectangular shapes are almost always
        # real components in technical diagrams, not noise or background regions
        rectangularity_bonus = 0.0
        if seg_contours_early:
            cnt_r = max(seg_contours_early, key=cv2.contourArea)
            bx_r, by_r, bw_r, bh_r = cv2.boundingRect(cnt_r)
            bb_area_r = bw_r * bh_r
            if bb_area_r > 0:
                rect_fill = cv2.contourArea(cnt_r) / bb_area_r
                if rect_fill > 0.82:
                    rectangularity_bonus = 0.10
                elif rect_fill > 0.70:
                    rectangularity_bonus = 0.05

        # Type-specific hard reject + score adjustment
        type_adj, type_reject = self._type_specific_filter(
            x, y, w, h, segmentation, img_array, norm_area, img_w, img_h
        )
        if type_reject:
            return 0.0

        # Weighted composite score (capped at 1.0)
        total_score = (
            0.22 * size_score +
            0.18 * aspect_score +
            0.20 * edge_score +
            0.15 * texture_score +
            0.10 * compactness_score +
            0.10 * min(1.0, mask.get('predicted_iou', 0.8))
        ) - border_penalty + rectangularity_bonus + type_adj

        total_score = max(0.0, min(1.0, total_score))
        
        if self.debug and total_score > 0.3:
            print(f"Mask score: {total_score:.2f} (size={size_score:.2f}, aspect={aspect_score:.2f}, edge={edge_score:.2f}, texture={texture_score:.2f}, compact={compactness_score:.2f}, border={border_penalty:.2f}, area%={norm_area*100:.1f})")
        
        return total_score
    
    def _type_specific_filter(
        self,
        x: int, y: int, w: int, h: int,
        segmentation: np.ndarray,
        img_array: np.ndarray,
        norm_area: float,
        img_w: int, img_h: int,
    ) -> Tuple[float, bool]:
        """
        Per-diagram-type score adjustment and hard rejects.

        Each diagram type has characteristic shapes and characteristic false-positive
        patterns.  This method encodes that knowledge:

          sequence    — handled by a separate pipeline; returns neutral here
          uml         — class boxes (compartmented rectangles); reject tiny text labels
          flowchart   — rectangles, diamonds, ovals; reject arrow lines & tiny dots
          architecture— service boxes + large group containers; reject thin lines

        Returns:
            (score_adjustment, hard_reject)
            score_adjustment : float added to the weighted score (can be negative)
            hard_reject      : if True, discard the mask immediately
        """
        diag   = getattr(self, '_hint_diagram_type', None) or getattr(self, 'diagram_type', 'other')
        aspect = w / (h + 1e-6)

        # ── UML class diagrams ─────────────────────────────────────────────
        if diag == 'uml':
            # Attribute rows, multiplicity labels, and note icons are tiny.
            if norm_area < 0.003:
                return 0.0, True
            # Full-width page banners are not class boxes.
            if aspect > 6.0:
                return 0.0, True
            # Boost compartmented rectangles (name / attributes / methods sections).
            roi = img_array[max(0, y):min(img_h, y + h), max(0, x):min(img_w, x + w)]
            if roi.size > 0 and self._has_compartments(roi):
                return 0.15, False
            return 0.0, False

        # ── Flowchart diagrams ─────────────────────────────────────────────
        elif diag == 'flowchart':
            # Small connector dots and isolated arrowhead labels are too tiny.
            if norm_area < 0.002:
                return 0.0, True
            # Arrow lines masquerading as thin boxes.
            if aspect > 7.0 or aspect < 0.14:
                return 0.0, True
            # Identify diamonds and ovals for a score boost.
            cnts, _ = cv2.findContours(
                segmentation.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            if cnts:
                cnt      = max(cnts, key=cv2.contourArea)
                cnt_area = cv2.contourArea(cnt)
                peri     = cv2.arcLength(cnt, True)
                approx   = cv2.approxPolyDP(cnt, 0.03 * peri, True)
                fill     = cnt_area / (w * h + 1e-6)
                # Diamond: 4 vertices, fill ≈ 0.5 (rotated square)
                if len(approx) == 4 and 0.38 < fill < 0.68:
                    return 0.15, False
                # Oval / terminator: circularity > 0.65
                if peri > 0 and (4 * np.pi * cnt_area) / (peri ** 2) > 0.65:
                    return 0.10, False
            return 0.0, False

        # ── Architecture diagrams ──────────────────────────────────────────
        elif diag == 'architecture':
            # Thin connector lines that form a narrow rectangle.
            if (aspect > 10.0 or aspect < 0.10) and norm_area < 0.04:
                return 0.0, True
            # Visible border frame = strong signal for a real component box.
            roi = img_array[max(0, y):min(img_h, y + h), max(0, x):min(img_w, x + w)]
            if roi.size > 0:
                has_frame = self._has_rect_frame(roi.astype(np.float32))
                return (0.10 if has_frame else -0.10), False
            return 0.0, False

        # ── All other types — no adjustment ───────────────────────────────
        return 0.0, False

    def _has_compartments(self, roi: np.ndarray) -> bool:
        """
        Detect horizontal divider lines inside a region — the hallmark of a
        UML class box (class name / attributes / methods sections).

        Returns True if at least one near-horizontal line spans ≥ 35 % of
        the region width.
        """
        if roi.shape[0] < 20 or roi.shape[1] < 20:
            return False
        edges = cv2.Canny(roi, 30, 100)
        lines = cv2.HoughLinesP(
            edges, 1, np.pi / 180,
            threshold=12,
            minLineLength=int(roi.shape[1] * 0.35),
            maxLineGap=5,
        )
        if lines is None:
            return False
        for line in lines:
            x1, y1, x2, y2 = line[0]
            if abs(y2 - y1) < 5:   # near-horizontal
                return True
        return False

    def _non_maximum_suppression(self, masks: List[Dict], iou_threshold: float = 0.25) -> List[Dict]:
        """Remove overlapping and contained masks using mask IoU and containment."""
        if len(masks) == 0:
            return []
        
        keep = []
        while masks:
            current = masks.pop(0)
            keep.append(current)
            
            remaining = []
            for m in masks:
                iou = self._calculate_iou(current, m)
                # Check containment in both directions
                containment_in_current = self._calculate_containment(current, m)
                containment_of_current = self._calculate_containment(m, current)
                max_containment = max(containment_in_current, containment_of_current)
                
                # Suppress if mask overlap or containment is too high.
                # Threshold raised to 0.85 to allow legitimate nested components
                # (e.g. inner boxes inside a container box) to coexist.
                if iou >= iou_threshold or max_containment >= 0.85:
                    continue
                remaining.append(m)
            masks = remaining
        
        return keep
    
    def _calculate_containment(self, mask1: Dict, mask2: Dict) -> float:
        """Calculate how much of mask2 is contained within mask1."""
        seg1 = mask1['segmentation']
        seg2 = mask2['segmentation']
        
        intersection = np.logical_and(seg1, seg2).sum()
        area2 = seg2.sum()
        
        return intersection / area2 if area2 > 0 else 0.0
    
    def _calculate_iou(self, mask1: Dict, mask2: Dict) -> float:
        """Calculate intersection over union for two masks"""
        seg1 = mask1['segmentation']
        seg2 = mask2['segmentation']
        
        intersection = np.logical_and(seg1, seg2).sum()
        union = np.logical_or(seg1, seg2).sum()
        
        return intersection / union if union > 0 else 0.0
    
    def _masks_to_components(self, masks: List[Dict], img: Image.Image) -> List[Dict]:
        """Convert masks to component objects with features"""
        components = []
        
        for idx, mask in enumerate(masks):
            x, y, w, h = mask['bbox']
            
            # Normalize coordinates
            x_norm = x / img.width
            y_norm = y / img.height
            w_norm = w / img.width
            h_norm = h / img.height
            
            cx = x_norm + w_norm / 2
            cy = y_norm + h_norm / 2
            
            # Calculate shape features
            shape_features = self._extract_shape_features(mask['segmentation'])
            
            # Generate descriptive label based on shape
            label = self._classify_by_shape(shape_features, w_norm, h_norm)
            
            components.append({
                'id': f'component_{idx}',
                'label': label,
                'confidence': mask.get('quality_score', 0.8),
                'x': x_norm,
                'y': y_norm,
                'width': w_norm,
                'height': h_norm,
                'center_x': cx,
                'center_y': cy,
                'area': w_norm * h_norm,
                'shape_features': shape_features,
                'terminals': [],  # Will be populated later
                'segmentation': mask['segmentation'],  # Keep for terminal detection
                'description': f'{label} at ({cx:.2f}, {cy:.2f})'
            })
        
        return components
    
    def _extract_shape_features(self, segmentation: np.ndarray) -> Dict:
        """Extract geometric features from mask, including diamond / oval / parallelogram flags."""
        contours, _ = cv2.findContours(
            segmentation.astype(np.uint8),
            cv2.RETR_EXTERNAL,
            cv2.CHAIN_APPROX_SIMPLE
        )
        
        _empty = {
            'circularity': 0.0,
            'rectangularity': 0.0,
            'corner_count': 0,
            'convexity': 0.0,
            'rotation_angle': 0.0,
            'is_diamond': False,
            'is_oval': False,
            'is_parallelogram': False,
        }
        if len(contours) == 0:
            return _empty
        
        contour = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(contour)
        perimeter = cv2.arcLength(contour, True)
        
        # Circularity
        circularity = (4 * np.pi * area) / (perimeter ** 2) if perimeter > 0 else 0.0
        
        # Rectangularity (axis-aligned bounding box fill)
        x, y, w, h = cv2.boundingRect(contour)
        rectangularity = area / (w * h) if w * h > 0 else 0.0
        
        # Corner detection
        epsilon = 0.02 * perimeter
        approx = cv2.approxPolyDP(contour, epsilon, True)
        corner_count = len(approx)
        
        # Convexity
        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        convexity = area / hull_area if hull_area > 0 else 0.0
        
        # ---- Minimum-area rotated rectangle for diamond / rotation ----
        rotation_angle = 0.0
        is_diamond = False
        if len(contour) >= 5:
            rect = cv2.minAreaRect(contour)
            rotation_angle = rect[2]
            rect_w, rect_h = rect[1]
            if rect_w > 0 and rect_h > 0:
                min_area_rect_fill = area / (rect_w * rect_h)
                rot_aspect = max(rect_w, rect_h) / (min(rect_w, rect_h) + 1e-6)
                # Diamond: 4 approx corners, poor axis-aligned fill, good rotated fill,
                # roughly square in rotated frame
                if (corner_count == 4 and
                        rectangularity < 0.65 and
                        min_area_rect_fill > 0.75 and
                        rot_aspect < 2.0):
                    is_diamond = True
        
        # ---- Oval / ellipse detection ----
        bbox_aspect = max(w, h) / (min(w, h) + 1e-6)
        is_oval = circularity > 0.70 and 1.3 < bbox_aspect < 3.5
        
        # ---- Parallelogram (4 corners, not rect, not diamond, convex) ----
        is_parallelogram = (
            corner_count == 4 and
            rectangularity < 0.82 and
            not is_diamond and
            convexity > 0.88
        )
        
        return {
            'circularity': circularity,
            'rectangularity': rectangularity,
            'corner_count': corner_count,
            'convexity': convexity,
            'rotation_angle': rotation_angle,
            'is_diamond': is_diamond,
            'is_oval': is_oval,
            'is_parallelogram': is_parallelogram,
        }
    
    def _classify_by_shape(self, features: Dict, width: float, height: float) -> str:
        """Classify component based on geometric features and detected diagram type."""
        aspect_ratio = max(width, height) / (min(width, height) + 1e-6)
        diag = getattr(self, 'diagram_type', 'medium')
        
        # ---- Priority shape checks (diagram-independent) ----
        
        # Diamond / Decision
        if features.get('is_diamond', False):
            if diag == 'flowchart':
                return 'Decision'
            return 'Diamond'
        
        # Oval / Ellipse
        if features.get('is_oval', False):
            if diag == 'flowchart':
                return 'Terminator'
            return 'Oval'
        
        # Parallelogram
        if features.get('is_parallelogram', False):
            if diag == 'flowchart':
                return 'Data I/O'
            return 'Parallelogram'
        
        # ---- Sequence diagram classifications ----
        if diag == 'sequence':
            if features['rectangularity'] > 0.70:
                if height > width * 2.0:
                    return 'Activation Bar'
                if width > height * 2.5:
                    return 'Lifeline Header'
                if width * height > 0.03:
                    return 'Combined Fragment'
                return 'Object'
            if features['circularity'] > 0.75:
                return 'Actor'
            if features['corner_count'] == 3:
                return 'Arrow'
            return 'Sequence Element'
        
        # ---- UML-specific classifications ----
        if diag == 'uml':
            if features['rectangularity'] > 0.75:
                if aspect_ratio > 3.0:
                    return 'UML Note'
                return 'UML Class'
            if features['circularity'] > 0.75:
                return 'UML Interface'
            if features['corner_count'] == 3:
                return 'UML Inheritance Arrow'
            return 'UML Element'
        
        # ---- Flowchart-specific classifications ----
        if diag == 'flowchart':
            if features['circularity'] > 0.80:
                if aspect_ratio < 1.4:
                    return 'Connector'
                return 'Terminator'
            if features['rectangularity'] > 0.80:
                if aspect_ratio > 3.0:
                    return 'Annotation'
                return 'Process'
            if features['corner_count'] == 3:
                return 'Arrow'
            if features['circularity'] > 0.60:
                return 'Connector'
            return 'Process'
        
        # ---- Generic / circuit / other diagram types ----
        if features['circularity'] > 0.80:
            return 'Circular Element'
        
        if features['rectangularity'] > 0.85:
            if aspect_ratio > 3.0:
                return 'Elongated Block'
            elif aspect_ratio < 1.3:
                return 'Square Block'
            return 'Rectangular Block'
        
        if features['corner_count'] == 3:
            return 'Triangular Element'
        elif features['corner_count'] == 4:
            return 'Quadrilateral Element'
        elif features['corner_count'] > 6:
            if features['circularity'] > 0.6:
                return 'Rounded Element'
            return 'Complex Shape'
        
        if aspect_ratio > 4.0:
            return 'Linear Element'
        return 'Component'
    
    # ------------------------------------------------------------------
    # Contour-based component detection (supplements SAM for UML / flowcharts)
    # ------------------------------------------------------------------
    
    def _detect_contour_components(self, img: Image.Image) -> List[Dict]:
        """Detect rectangular / diamond / circular components using classical
        contour detection.  Supplements SAM for UML class boxes and flowchart
        shapes that SAM may miss.

        Uses four complementary approaches:
        1. Edge-based detection with small closing (solid borders, connected lines)
        2. Binary threshold detection (filled shapes)
        3. Blur + sensitive Canny (suppresses hatch-fill texture, finds clean borders)
        4. Large-kernel closing (closes dashed/dotted outline gaps of up to ~15px)
        """
        img_array = np.array(img.convert('L'))
        h, w = img_array.shape
        img_area = h * w

        all_candidates: List[Dict] = []

        # --- Approach 1: Edge-based contour detection ---
        # Edges + small morphological close to form enclosed regions from solid borders.
        edges = cv2.Canny(img_array, 30, 100)
        kernel = np.ones((3, 3), dtype=np.uint8)
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel, iterations=2)
        contours_edge, _ = cv2.findContours(closed, cv2.RETR_LIST,
                                            cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours_edge:
            cand = self._contour_to_candidate(contour, h, w, img_area)
            if cand is not None:
                all_candidates.append(cand)

        # --- Approach 2: Binary threshold (catches filled shapes) ---
        # Use background-aware thresholding: on dark backgrounds THRESH_BINARY keeps
        # light shapes (boxes/borders) as foreground; INV would invert that and merge
        # the dark background with box interiors, destroying contour boundaries.
        _thresh_flag = cv2.THRESH_BINARY_INV if self._is_light_background else cv2.THRESH_BINARY
        _, binary = cv2.threshold(img_array, 0, 255, _thresh_flag + cv2.THRESH_OTSU)
        contours_bin, _ = cv2.findContours(binary, cv2.RETR_LIST,
                                           cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours_bin:
            cand = self._contour_to_candidate(contour, h, w, img_area)
            if cand is not None:
                all_candidates.append(cand)

        # --- Approach 3: Blur + sensitive Canny for structural borders ---
        # Strong Gaussian blur suppresses fine texture (hatch-fill diagonal lines,
        # text, noise) while preserving thicker box borders.  More sensitive Canny
        # thresholds then pick up borders that may have low contrast on dark
        # backgrounds.  This reliably finds the outer border of hatched-interior boxes
        # that Approach 1 misses because the hatch lines generate competing contours.
        blurred = cv2.GaussianBlur(img_array, (11, 11), 0)
        edges_blur = cv2.Canny(blurred, 20, 80)
        kernel_med = np.ones((5, 5), dtype=np.uint8)
        closed_blur = cv2.morphologyEx(edges_blur, cv2.MORPH_CLOSE, kernel_med, iterations=2)
        contours_blur, _ = cv2.findContours(closed_blur, cv2.RETR_LIST,
                                            cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours_blur:
            cand = self._contour_to_candidate(contour, h, w, img_area)
            if cand is not None:
                all_candidates.append(cand)

        # --- Approach 4: Large-kernel closing for dashed/dotted outlines ---
        # Diagram container boxes are often drawn with dashed borders whose gaps are
        # 8-15px wide.  Approach 1's 3×3 kernel only bridges gaps ≤ 3px.  A 15×15
        # kernel (7px reach) closes gaps up to ~14px, turning dashed outlines into
        # solid closed contours that findContours can trace.
        kernel_large = np.ones((15, 15), dtype=np.uint8)
        closed_large = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel_large, iterations=3)
        contours_large, _ = cv2.findContours(closed_large, cv2.RETR_LIST,
                                             cv2.CHAIN_APPROX_SIMPLE)
        for contour in contours_large:
            cand = self._contour_to_candidate(contour, h, w, img_area)
            if cand is not None:
                all_candidates.append(cand)
        
        # Deduplicate by IoU (keep higher-quality ones)
        all_candidates.sort(key=lambda c: c['area'], reverse=True)
        deduped: List[Dict] = []
        for cand in all_candidates:
            duplicate = False
            for kept in deduped:
                iou = self._calculate_iou(cand, kept)
                if iou > 0.3:
                    duplicate = True
                    break
                # Also check bbox containment. Raised to 0.85 so that inner
                # nested boxes are not discarded during deduplication.
                cont = self._calculate_containment(kept, cand)
                if cont > 0.85:
                    duplicate = True
                    break
            if not duplicate:
                deduped.append(cand)
        
        return deduped
    
    def _contour_to_candidate(self, contour: np.ndarray, h: int, w: int,
                               img_area: int) -> Optional[Dict]:
        """Convert a single contour to a mask dict if it meets quality criteria."""
        area = cv2.contourArea(contour)
        if area < self.min_component_area or area > self.max_component_area:
            return None
        
        bx, by, bw, bh = cv2.boundingRect(contour)
        fill_ratio = area / (bw * bh) if bw * bh > 0 else 0
        aspect = max(bw, bh) / (min(bw, bh) + 1e-6)
        
        if fill_ratio < 0.35 or aspect > self.max_aspect_ratio:
            return None
        
        norm_area = (bw * bh) / img_area
        _diag = getattr(self, '_hint_diagram_type', None) or getattr(self, 'diagram_type', 'medium')
        _min_norm = 0.001 if _diag in ('uml', 'flowchart', 'sequence') else 0.002
        if norm_area < _min_norm:
            return None
        
        # Prefer convex, regular shapes (rectangles, circles, diamonds)
        peri = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
        if len(approx) < 3 or len(approx) > 20:
            return None
        
        seg_uint8 = np.zeros((h, w), dtype=np.uint8)
        cv2.drawContours(seg_uint8, [contour], -1, 1, cv2.FILLED)
        seg = seg_uint8.astype(bool)
        
        return {
            'segmentation': seg,
            'bbox': [bx, by, bw, bh],
            'area': int(area),
            'predicted_iou': 0.70,
            'source': 'contour',
        }
    
    def _merge_detection_results(self, sam_masks: List[Dict],
                                  contour_masks: List[Dict]) -> List[Dict]:
        """Merge SAM and contour detection results, keeping unique masks."""
        merged = list(sam_masks)
        
        for c_mask in contour_masks:
            duplicate = False
            for s_mask in merged:
                iou = self._calculate_iou(c_mask, s_mask)
                if iou > 0.25:
                    duplicate = True
                    break
            if not duplicate:
                merged.append(c_mask)
        
        return merged
    
    def _detect_component_terminals(self, components: List[Dict], img_array: np.ndarray) -> List[Dict]:
        """Detect connection points (terminals/ports) on each component"""
        
        for comp in components:
            segmentation = comp['segmentation']
            
            # Find contour of component
            contours, _ = cv2.findContours(
                segmentation.astype(np.uint8),
                cv2.RETR_EXTERNAL,
                cv2.CHAIN_APPROX_SIMPLE
            )
            
            if len(contours) == 0:
                continue
            
            contour = contours[0]
            
            # Method 1: Find extreme points (top, bottom, left, right)
            leftmost = tuple(contour[contour[:, :, 0].argmin()][0])
            rightmost = tuple(contour[contour[:, :, 0].argmax()][0])
            topmost = tuple(contour[contour[:, :, 1].argmin()][0])
            bottommost = tuple(contour[contour[:, :, 1].argmax()][0])
            
            terminals = []
            h, w = img_array.shape[:2]
            
            # Add edge terminals (normalized coordinates)
            for point in [leftmost, rightmost, topmost, bottommost]:
                terminals.append({
                    'x': point[0] / w,
                    'y': point[1] / h,
                    'type': 'edge'
                })
            
            # Method 2: Detect corners as potential terminals
            epsilon = 0.02 * cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            
            for point in approx:
                px, py = point[0]
                terminals.append({
                    'x': px / w,
                    'y': py / h,
                    'type': 'corner'
                })
            
            # Remove duplicate terminals (too close together)
            terminals = self._remove_duplicate_terminals(terminals)
            
            comp['terminals'] = terminals
            comp['terminal_count'] = len(terminals)
        
        return components
    
    def _remove_duplicate_terminals(self, terminals: List[Dict], threshold: float = 0.01) -> List[Dict]:
        """Remove terminals that are too close together"""
        if len(terminals) <= 1:
            return terminals
        
        unique = []
        for term in terminals:
            is_duplicate = False
            for existing in unique:
                dist = np.sqrt((term['x'] - existing['x'])**2 + (term['y'] - existing['y'])**2)
                if dist < threshold:
                    is_duplicate = True
                    break
            if not is_duplicate:
                unique.append(term)
        
        return unique
    
    def _detect_connections(self, components: List[Dict], img_array: np.ndarray) -> List[Dict]:
        """
        Detect connections between components using multiple methods:
        1. Line detection (Hough transform)
        2. Wire/trace following (edge detection + path finding)
        3. Terminal proximity analysis
        """
        
        connections = []
        
        # Convert to grayscale
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY) if len(img_array.shape) == 3 else img_array
        h, w = gray.shape
        
        # Create mask of all components
        component_mask = np.zeros((h, w), dtype=np.uint8)
        for comp in components:
            if 'segmentation' in comp:
                component_mask = np.logical_or(component_mask, comp['segmentation'])
        
        # Invert to get potential connection regions
        connection_regions = ~component_mask
        
        # Method 1: Detect lines using Hough transform
        edges = cv2.Canny(gray, 50, 150)
        # Mask out component regions
        edges = edges * connection_regions.astype(np.uint8)
        
        lines = cv2.HoughLinesP(
            edges,
            rho=1,
            theta=np.pi/180,
            threshold=50,
            minLineLength=20,
            maxLineGap=10
        )
        
        if lines is not None:
            for line in lines:
                x1, y1, x2, y2 = line[0]
                # Normalize coordinates
                x1_norm, y1_norm = x1 / w, y1 / h
                x2_norm, y2_norm = x2 / w, y2 / h
                # Find which components this line connects
                connected_comps = self._find_connected_components(
                    (x1_norm, y1_norm),
                    (x2_norm, y2_norm),
                    components
                )
                if len(connected_comps) >= 2:
                    # Arrow direction detection
                    direction = self._detect_arrow_direction((x1, y1), (x2, y2), img_array)
                    if direction == 'forward':
                        from_id, to_id = connected_comps[0], connected_comps[1]
                    elif direction == 'backward':
                        from_id, to_id = connected_comps[1], connected_comps[0]
                    else:
                        from_id, to_id = connected_comps[0], connected_comps[1]
                    connections.append({
                        'from': from_id,
                        'to': to_id,
                        'type': 'line',
                        'start': {'x': x1_norm, 'y': y1_norm},
                        'end': {'x': x2_norm, 'y': y2_norm},
                        'direction': direction,
                        'confidence': 0.9
                    })
        
        # Method 2: Terminal-based proximity connections
        proximity_connections = self._detect_proximity_connections(components)
        connections.extend(proximity_connections)
        
        # Method 3: Path tracing between components
        path_connections = self._trace_connection_paths(components, edges, w, h)
        connections.extend(path_connections)
        
        # Remove duplicate connections
        connections = self._deduplicate_connections(connections)
        
        # Update component connection counts
        for comp in components:
            comp['connection_count'] = sum(
                1 for conn in connections 
                if conn['from'] == comp['id'] or conn['to'] == comp['id']
            )
        
        return connections
    
    def _find_connected_components(
        self,
        point1: Tuple[float, float],
        point2: Tuple[float, float],
        components: List[Dict],
        proximity_threshold: float = 0.03
    ) -> List[str]:
        """Find components whose bounding boxes are near the endpoints of a line.

        Uses bounding-box proximity rather than center-point distance so that
        lines touching a component's edge (not its center) are matched correctly.
        """
        connected = []
        margin = proximity_threshold

        def _near_box(pt, comp):
            """True if pt is inside the component bbox (expanded by margin)."""
            x, y = pt
            return (
                comp['x'] - margin <= x <= comp['x'] + comp['width']  + margin and
                comp['y'] - margin <= y <= comp['y'] + comp['height'] + margin
            )

        for comp in components:
            if comp['id'] in connected:
                continue
            if _near_box(point1, comp) or _near_box(point2, comp):
                connected.append(comp['id'])

        return connected
    
    def _detect_arrow_direction(self, pt1: Tuple[int, int], pt2: Tuple[int, int],
                                img_array: np.ndarray, roi_size: int = 15) -> str:
        """
        Detect arrow direction by looking for arrowhead-like features near endpoints.
        Returns 'forward', 'backward', or 'undirected'.
        """
        x1, y1 = pt1
        x2, y2 = pt2
        h, w = img_array.shape[:2]

        def has_arrowhead(roi):
            if roi.size == 0:
                return False
            roi_gray = cv2.cvtColor(roi, cv2.COLOR_RGB2GRAY) if len(roi.shape) == 3 else roi
            edges = cv2.Canny(roi_gray, 50, 150)
            contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                if cv2.contourArea(cnt) < 5:
                    continue
                approx = cv2.approxPolyDP(cnt, 0.2 * cv2.arcLength(cnt, True), True)
                if 3 <= len(approx) <= 5:
                    return True
            return False

        roi1 = img_array[
            max(0, y1 - roi_size):min(h, y1 + roi_size),
            max(0, x1 - roi_size):min(w, x1 + roi_size)
        ]
        roi2 = img_array[
            max(0, y2 - roi_size):min(h, y2 + roi_size),
            max(0, x2 - roi_size):min(w, x2 + roi_size)
        ]

        arrow1 = has_arrowhead(roi1)
        arrow2 = has_arrowhead(roi2)

        if arrow2 and not arrow1:
            return 'forward'
        if arrow1 and not arrow2:
            return 'backward'
        return 'undirected'

    def _detect_proximity_connections(self, components: List[Dict], threshold: float = 0.05) -> List[Dict]:
        """Detect connections based on terminal proximity"""
        connections = []
        
        for i, comp1 in enumerate(components):
            for comp2 in components[i+1:]:
                # Check all terminal pairs
                for term1 in comp1.get('terminals', []):
                    for term2 in comp2.get('terminals', []):
                        dist = np.sqrt(
                            (term1['x'] - term2['x'])**2 + 
                            (term1['y'] - term2['y'])**2
                        )
                        
                        if dist < threshold:
                            connections.append({
                                'from': comp1['id'],
                                'to': comp2['id'],
                                'type': 'proximity',
                                'distance': float(dist),
                                'confidence': max(0.5, 1.0 - dist / threshold)
                            })
        
        return connections
    
    def _trace_connection_paths(
        self, 
        components: List[Dict], 
        edges: np.ndarray,
        width: int,
        height: int
    ) -> List[Dict]:
        """Trace paths between nearby component terminals using skeleton connectivity."""
        connections = []
        
        # Skip expensive skeletonization if too few components
        if len(components) < 2:
            return connections
        
        # Skeletonize edge image to get thin paths
        skeleton = skeletonize(edges > 0)
        
        # Only check nearby component pairs (within reasonable distance)
        for i, comp1 in enumerate(components):
            for comp2 in components[i+1:]:
                # Quick distance check — skip far-apart pairs
                center_dist = np.sqrt(
                    (comp1['center_x'] - comp2['center_x'])**2 + 
                    (comp1['center_y'] - comp2['center_y'])**2
                )
                if center_dist > 0.3:  # normalized, ~30% of image
                    continue
                
                found = False
                # Check only 2 terminals per component
                for term1 in comp1.get('terminals', [])[:2]:
                    if found:
                        break
                    for term2 in comp2.get('terminals', [])[:2]:
                        x1, y1 = int(term1['x'] * width), int(term1['y'] * height)
                        x2, y2 = int(term2['x'] * width), int(term2['y'] * height)
                        
                        if self._has_path(skeleton, (y1, x1), (y2, x2)):
                            connections.append({
                                'from': comp1['id'],
                                'to': comp2['id'],
                                'type': 'traced_path',
                                'confidence': 0.8
                            })
                            found = True
                            break
        
        return connections
    
    def _has_path(self, skeleton: np.ndarray, start: Tuple[int, int], end: Tuple[int, int]) -> bool:
        """Check if there's a path in skeleton between two points"""
        # Simple flood fill to check connectivity
        # For performance, limit search to nearby region
        
        y1, x1 = start
        y2, x2 = end
        
        # Only check if points are reasonably close
        dist = np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
        if dist > 200:  # Pixel distance threshold
            return False
        
        # Create search region
        min_y = max(0, min(y1, y2) - 50)
        max_y = min(skeleton.shape[0], max(y1, y2) + 50)
        min_x = max(0, min(x1, x2) - 50)
        max_x = min(skeleton.shape[1], max(x1, x2) + 50)
        
        region = skeleton[min_y:max_y, min_x:max_x]
        
        # Check if both points are on skeleton
        if not (skeleton[y1, x1] and skeleton[y2, x2]):
            return False
        
        # Simple connectivity check - if skeleton is continuous in region
        labeled = cv2.connectedComponents(region.astype(np.uint8))[1]
        
        # Adjust coordinates to region
        y1_local = y1 - min_y
        x1_local = x1 - min_x
        y2_local = y2 - min_y
        x2_local = x2 - min_x
        
        # Check bounds
        if (0 <= y1_local < labeled.shape[0] and 0 <= x1_local < labeled.shape[1] and
            0 <= y2_local < labeled.shape[0] and 0 <= x2_local < labeled.shape[1]):
            return labeled[y1_local, x1_local] == labeled[y2_local, x2_local] and labeled[y1_local, x1_local] > 0
        
        return False
    
    def _deduplicate_connections(self, connections: List[Dict]) -> List[Dict]:
        """Remove duplicate connections between same component pairs"""
        seen = set()
        unique = []
        
        for conn in connections:
            # Create unique key (order-independent)
            pair = tuple(sorted([conn['from'], conn['to']]))
            
            if pair not in seen:
                seen.add(pair)
                unique.append(conn)
            else:
                # Keep connection with higher confidence
                existing_idx = next(
                    i for i, c in enumerate(unique)
                    if tuple(sorted([c['from'], c['to']])) == pair
                )
                if conn.get('confidence', 0) > unique[existing_idx].get('confidence', 0):
                    unique[existing_idx] = conn
        
        return unique
    
    def _build_connection_graph(self, components: List[Dict], connections: List[Dict]) -> nx.Graph:
        """Build graph representation of component connections"""
        G = nx.Graph()
        
        # Add nodes
        for comp in components:
            G.add_node(comp['id'], **comp)
        
        # Add edges
        for conn in connections:
            G.add_edge(
                conn['from'],
                conn['to'],
                type=conn['type'],
                confidence=conn.get('confidence', 0.8)
            )
        
        return G
    
    def _analyze_relationships(
        self, 
        components: List[Dict], 
        connections: List[Dict], 
        graph: nx.Graph
    ) -> Dict:
        """Analyze spatial and connectivity relationships"""
        
        # Group analysis
        groups = self._find_component_groups(components, connections)
        
        # Topology analysis
        topology = {
            'total_components': len(components),
            'total_connections': len(connections),
            'connected_components': len([c for c in components if c.get('connection_count', 0) > 0]),
            'isolated_components': len([c for c in components if c.get('connection_count', 0) == 0]),
            'average_connections': np.mean([c.get('connection_count', 0) for c in components]),
            'max_connections': max([c.get('connection_count', 0) for c in components]) if components else 0
        }
        
        # Network analysis using graph
        if len(graph.nodes) > 0:
            topology['connected_clusters'] = nx.number_connected_components(graph)
            
            # Find central components (high degree)
            degrees = dict(graph.degree())
            if degrees:
                central_nodes = sorted(degrees.items(), key=lambda x: x[1], reverse=True)[:3]
                topology['central_components'] = [node for node, degree in central_nodes]
        
        # Spatial patterns
        spatial_patterns = self._detect_spatial_patterns(components)
        
        return {
            'connections': connections,
            'groups': groups,
            'topology': topology,
            'spatial_patterns': spatial_patterns
        }
    
    def _find_component_groups(self, components: List[Dict], connections: List[Dict]) -> List[List[str]]:
        """Find groups of connected components"""
        # Build adjacency list
        adjacency = defaultdict(set)
        for conn in connections:
            adjacency[conn['from']].add(conn['to'])
            adjacency[conn['to']].add(conn['from'])
        
        # Find connected groups using DFS
        visited = set()
        groups = []
        
        def dfs(comp_id, group):
            if comp_id in visited:
                return
            visited.add(comp_id)
            group.append(comp_id)
            for neighbor in adjacency[comp_id]:
                dfs(neighbor, group)
        
        for comp in components:
            if comp['id'] not in visited:
                group = []
                dfs(comp['id'], group)
                if len(group) > 1:  # Only include groups with multiple components
                    groups.append(group)
        
        return groups
    
    def _detect_spatial_patterns(self, components: List[Dict]) -> Dict:
        """Detect spatial arrangement patterns"""
        if len(components) < 3:
            return {'pattern': 'sparse', 'alignment': 'none'}
        
        # Extract centers
        centers = np.array([[c['center_x'], c['center_y']] for c in components])
        
        # Check for linear arrangement
        if len(centers) >= 3:
            # Use PCA to find principal direction
            from sklearn.decomposition import PCA
            pca = PCA(n_components=1)
            pca.fit(centers)
            
            # If variance ratio is high, components are linearly arranged
            if pca.explained_variance_ratio_[0] > 0.9:
                return {'pattern': 'linear', 'alignment': 'strong'}
        
        # Check for grid arrangement
        x_coords = centers[:, 0]
        y_coords = centers[:, 1]
        
        # Count unique x and y coordinates (with tolerance)
        unique_x = len(np.unique(np.round(x_coords, 1)))
        unique_y = len(np.unique(np.round(y_coords, 1)))
        
        if unique_x >= 3 and unique_y >= 3:
            return {'pattern': 'grid', 'rows': unique_y, 'cols': unique_x}
        
        # Check for clustered arrangement
        distances = cdist(centers, centers)
        avg_distance = distances[distances > 0].mean()
        
        if avg_distance < 0.2:  # Normalized coordinates
            return {'pattern': 'clustered', 'density': 'high'}
        elif avg_distance > 0.5:
            return {'pattern': 'sparse', 'density': 'low'}
        else:
            return {'pattern': 'distributed', 'density': 'medium'}
    
    # ─────────────────────────────────────────────────────────────────────────
    # SEQUENCE DIAGRAM STRUCTURAL PIPELINE
    # ─────────────────────────────────────────────────────────────────────────

    def _detect_sequence_components(
        self, img_array: np.ndarray, img: Image.Image
    ) -> List[Dict]:
        """
        Dedicated pipeline for sequence diagrams.

        Detection order:
          1. Find lifeline x-positions (vertical dashed/solid lines).
          2. Find actor boxes at the top (and optionally bottom) of each lifeline.
          3. Find activation bars on lifelines (short vertical/horizontal boxes).
          4. Find fragment / combined-fragment boxes (wide spanning rectangles).

        Returns a list of component dicts in the same format as _masks_to_components.
        """
        img_w = img.width
        img_h = img.height
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)

        lifeline_xs = self._find_lifeline_positions(gray, img_w, img_h)
        print(f"   Sequence: {len(lifeline_xs)} lifeline(s) at x={[round(x/img_w,2) for x in lifeline_xs]}")

        boxes: List[Tuple[int,int,int,int,str]] = []  # (x, y, w, h, source)

        # Actor / participant boxes
        actor_boxes = self._find_seq_actor_boxes(gray, lifeline_xs, img_w, img_h)
        boxes.extend([(x, y, w, h, 'actor') for x, y, w, h in actor_boxes])
        print(f"   Sequence: {len(actor_boxes)} actor box(es)")

        # Activation bars
        activation_boxes = self._find_seq_activation_bars(gray, lifeline_xs, img_w, img_h)
        boxes.extend([(x, y, w, h, 'activation') for x, y, w, h in activation_boxes])
        print(f"   Sequence: {len(activation_boxes)} activation bar(s)")

        # Fragment / phase boxes
        fragment_boxes = self._find_seq_fragment_boxes(gray, img_w, img_h)
        boxes.extend([(x, y, w, h, 'fragment') for x, y, w, h in fragment_boxes])
        print(f"   Sequence: {len(fragment_boxes)} fragment box(es)")

        # Deduplicate and convert to components
        boxes = self._dedup_boxes_list(boxes, iou_threshold=0.40)

        components = []
        for idx, (bx, by, bw, bh, source) in enumerate(boxes):
            x_norm = bx / img_w
            y_norm = by / img_h
            w_norm = bw / img_w
            h_norm = bh / img_h
            cx = x_norm + w_norm / 2
            cy = y_norm + h_norm / 2
            label = {'actor': 'Actor', 'activation': 'Activation', 'fragment': 'Fragment'}.get(source, 'Component')
            components.append({
                'id': f'seq_{source}_{idx}',
                'label': label,
                'confidence': 0.85,
                'x': x_norm,
                'y': y_norm,
                'width': w_norm,
                'height': h_norm,
                'center_x': cx,
                'center_y': cy,
                'area': w_norm * h_norm,
                'shape_features': {'source': source},
                'terminals': [],
                'description': f'{label} at ({cx:.2f}, {cy:.2f})',
            })
        return components

    def _find_lifeline_positions(
        self, gray: np.ndarray, img_w: int, img_h: int
    ) -> List[int]:
        """
        Detect vertical lifeline positions (pixel x-coordinates).

        A lifeline is a column of near-vertical segments that together span
        at least 30 % of the image height.
        """
        edges = cv2.Canny(gray, 30, 100)
        lines = cv2.HoughLinesP(
            edges, 1, np.pi / 180,
            threshold=25,
            minLineLength=max(20, int(img_h * 0.07)),
            maxLineGap=15,
        )
        if lines is None:
            return []

        # Collect vertical segments
        v_segs: List[Tuple[int,int,int]] = []  # (x_mid, y_top, y_bot)
        for line in lines:
            x1, y1, x2, y2 = line[0]
            ang = abs(np.arctan2(y2 - y1, x2 - x1) * 180 / np.pi)
            if 75 < ang < 105:
                xm = (x1 + x2) // 2
                v_segs.append((xm, min(y1, y2), max(y1, y2)))

        if not v_segs:
            return []

        # Cluster by x
        v_segs.sort(key=lambda s: s[0])
        clusters: List[List[Tuple[int,int,int]]] = [[v_segs[0]]]
        for seg in v_segs[1:]:
            if seg[0] - clusters[-1][-1][0] < 18:
                clusters[-1].append(seg)
            else:
                clusters.append([seg])

        lifeline_xs = []
        for cluster in clusters:
            span_lo = min(s[1] for s in cluster)
            span_hi = max(s[2] for s in cluster)
            if (span_hi - span_lo) >= img_h * 0.30:
                xs = [s[0] for s in cluster]
                lifeline_xs.append(int(np.median(xs)))

        return sorted(lifeline_xs)

    def _find_seq_actor_boxes(
        self,
        gray: np.ndarray,
        lifeline_xs: List[int],
        img_w: int,
        img_h: int,
    ) -> List[Tuple[int,int,int,int]]:
        """
        Find actor / participant boxes aligned to detected lifelines.

        Strategy: for each lifeline x, look at the top 20 % of the image for
        a rectangle whose horizontal centre is within ±60 px of the lifeline.
        Also scans bottom 15 % for return/destruction boxes.
        """
        boxes = []
        scan_y_top = int(img_h * 0.20)
        scan_y_bot_start = int(img_h * 0.85)

        for thresh_img in self._threshold_variants(gray):
            contours, _ = cv2.findContours(thresh_img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                area = w * h
                if area < 400:
                    continue
                norm_area = area / (img_w * img_h)
                if norm_area < 0.001 or norm_area > 0.10:
                    continue
                aspect = max(w, h) / (min(w, h) + 1e-6)
                if aspect > 8.0:
                    continue
                # Must be in top zone OR bottom zone
                in_top = y + h <= scan_y_top + 10
                in_bot = y >= scan_y_bot_start - 10
                if not (in_top or in_bot):
                    continue
                # Must be aligned with a lifeline
                cx = x + w // 2
                if lifeline_xs:
                    nearest_dist = min(abs(cx - lx) for lx in lifeline_xs)
                    if nearest_dist > max(60, w * 0.8):
                        continue
                # Rectangle fill check
                cnt_area = cv2.contourArea(cnt)
                fill = cnt_area / area if area > 0 else 0
                if fill < 0.35:
                    continue
                boxes.append((x, y, w, h))

        return self._dedup_boxes_list([(x, y, w, h, 'a') for x, y, w, h in boxes])

    def _find_seq_activation_bars(
        self,
        gray: np.ndarray,
        lifeline_xs: List[int],
        img_w: int,
        img_h: int,
    ) -> List[Tuple[int,int,int,int]]:
        """
        Find activation bars — rectangles that sit on a lifeline.

        Activation bars can be:
          - Tall/narrow vertical rectangles (classic style)
          - Short/wide horizontal boxes indicating message handling
          - Any rectangle whose horizontal centre is near a lifeline
        No aspect ratio constraint is applied so both orientations are captured.
        """
        boxes = []
        img_area = img_w * img_h

        for thresh_img in self._threshold_variants(gray):
            contours, _ = cv2.findContours(thresh_img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                area = w * h
                norm_area = area / img_area
                # Activation bars are smaller than actor boxes
                if norm_area < 0.0005 or norm_area > 0.04:
                    continue
                if w < 4 or h < 4:
                    continue
                # Must be near a lifeline
                cx = x + w // 2
                if lifeline_xs:
                    nearest_dist = min(abs(cx - lx) for lx in lifeline_xs)
                    if nearest_dist > max(40, w):
                        continue
                else:
                    continue
                # Solid fill — activation bars are filled rectangles
                cnt_area = cv2.contourArea(cnt)
                fill = cnt_area / area if area > 0 else 0
                if fill < 0.30:
                    continue
                boxes.append((x, y, w, h))

        return self._dedup_boxes_list([(x, y, w, h, 'a') for x, y, w, h in boxes])

    def _find_seq_fragment_boxes(
        self,
        gray: np.ndarray,
        img_w: int,
        img_h: int,
    ) -> List[Tuple[int,int,int,int]]:
        """
        Find combined-fragment / phase boxes — large rectangles that span
        multiple lifelines (alt, loop, opt, ref, etc.).

        These are typically wider than a single actor box (> 6 % of width)
        and have a dashed or solid border with relatively low fill inside.
        """
        boxes = []
        img_area = img_w * img_h

        for thresh_img in self._threshold_variants(gray):
            contours, _ = cv2.findContours(thresh_img, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                x, y, w, h = cv2.boundingRect(cnt)
                area = w * h
                norm_area = area / img_area
                # Fragment boxes span a decent chunk of the diagram
                if norm_area < 0.015 or norm_area > 0.70:
                    continue
                if w < img_w * 0.06:
                    continue
                # Avoid full-image captures (background)
                if w > img_w * 0.95 and h > img_h * 0.95:
                    continue
                # Low interior fill — fragment boxes are mostly empty inside
                cnt_area = cv2.contourArea(cnt)
                fill = cnt_area / area if area > 0 else 0
                if fill > 0.80:
                    continue
                if fill < 0.05:
                    continue
                # Must have a visible border (not just an interior blob)
                peri = cv2.arcLength(cnt, True)
                approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)
                if len(approx) < 4:
                    continue
                boxes.append((x, y, w, h))

        return self._dedup_boxes_list([(x, y, w, h, 'f') for x, y, w, h in boxes])

    def _threshold_variants(self, gray: np.ndarray) -> List[np.ndarray]:
        """
        Return several binarized versions of the grayscale image.

        Running detection on multiple thresholds helps catch components
        regardless of their exact contrast level.
        """
        variants = []
        # Otsu — adapts to image histogram
        _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        variants.append(otsu)
        # Fixed thresholds for light / dark diagrams
        _, t180 = cv2.threshold(gray, 180, 255, cv2.THRESH_BINARY_INV)
        _, t100 = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY)
        variants.append(t180)
        variants.append(t100)
        # Adaptive — good for locally varying contrast
        adap = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY_INV, 15, 3
        )
        variants.append(adap)
        return variants

    def _dedup_boxes_list(
        self,
        boxes: List[Tuple],
        iou_threshold: float = 0.40,
    ) -> List[Tuple]:
        """
        Remove near-duplicate bounding boxes using IoU suppression.

        Input tuples can be (x, y, w, h) or (x, y, w, h, source, ...).
        Returns tuples in the same format.
        """
        if not boxes:
            return []

        def _iou(a, b):
            ax, ay, aw, ah = a[:4]
            bx, by, bw, bh = b[:4]
            ix = max(0, min(ax + aw, bx + bw) - max(ax, bx))
            iy = max(0, min(ay + ah, by + bh) - max(ay, by))
            inter = ix * iy
            union = aw * ah + bw * bh - inter
            return inter / union if union > 0 else 0.0

        # Sort largest first so bigger boxes win ties
        boxes = sorted(boxes, key=lambda b: b[2] * b[3], reverse=True)
        kept = []
        for box in boxes:
            if all(_iou(box, k) < iou_threshold for k in kept):
                kept.append(box)
        return kept

    def analyze_component_relationships(self, components: List[Dict]) -> Dict:
        """Legacy method for backward compatibility"""
        # Simple spatial relationship analysis
        connections = []
        
        for i, comp1 in enumerate(components):
            for comp2 in components[i+1:]:
                # Calculate distance
                dist = np.sqrt(
                    (comp1['center_x'] - comp2['center_x'])**2 + 
                    (comp1['center_y'] - comp2['center_y'])**2
                )
                
                # If close, mark as related
                if dist < 0.15:  # Threshold in normalized coordinates
                    connections.append({
                        'from': comp1['id'],
                        'to': comp2['id'],
                        'distance': float(dist),
                        'type': 'proximity'
                    })
        
        return {
            'connections': connections,
            'total': len(connections)
        }


# Global instance
ar_service = ARService()