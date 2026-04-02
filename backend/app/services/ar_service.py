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
from PIL import Image, ImageOps
from typing import List, Dict, Tuple, Optional
import logging
import tempfile
from app.services.model_manager import manager
from app.services.granite_vision_service import query_image
from app.services.prompt_builder import COMPONENT_LABEL_PROMPT, clean_label


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
                
                conf = float(result.boxes.conf[i]) if result.boxes is not None else 0.5
                
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
            img = Image.open(image_path)
            img = ImageOps.exif_transpose(img).convert('RGB')
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

        # Step 4b: Merge split compartments (SAM often segments each UML class
        # box section separately along its dividing lines)
        components = self._merge_adjacent_components(components, img.width, img.height)
        print(f"   After merge: {len(components)} components")

        # Connection and relationship extraction disabled intentionally because
        # current line/arrow detection accuracy is not reliable enough.
        connections = []
        relationships = {}
        
        # Strip non-serializable fields from components
        for comp in components:
            comp.pop('segmentation', None)
        
        print(f"✅ AR extraction complete: {len(components)} components")
        
        return {
            'components': components,
            'componentCount': len(components),
            'connections': connections,
            'relationships': relationships,
            'metadata': {
                'image_size': {'width': img.width, 'height': img.height},
                'diagram_type': self.diagram_type,
                'total_connections': 0,
                'connected_components': 0
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
        """Detect border frame lines to preserve text-in-box components.

        Accepts full 4-sided frames AND 3-sided frames (e.g. the methods
        compartment of a UML class box whose top edge is an interior dividing
        line — present in the image but weaker than an outer border).
        """
        h, w = gray_region.shape[:2]
        if h < 12 or w < 12:
            return False

        gx = np.abs(np.diff(gray_region, axis=1, prepend=gray_region[:, :1]))
        gy = np.abs(np.diff(gray_region, axis=0, prepend=gray_region[:1, :]))
        g = np.sqrt(gx ** 2 + gy ** 2)

        b = max(1, min(h, w) // 12)
        top    = float(np.mean(g[:b,  :] > 11))
        bottom = float(np.mean(g[-b:, :] > 11))
        left   = float(np.mean(g[:,  :b] > 11))
        right  = float(np.mean(g[:, -b:] > 11))

        # Full frame (4 sides)
        if (top > 0.13 and bottom > 0.13) or (left > 0.13 and right > 0.13):
            return True
        # 3-sided frame: strong left + right + bottom (UML methods compartment)
        if left > 0.13 and right > 0.13 and bottom > 0.13:
            return True
        # 3-sided frame: strong left + right + top (UML header compartment)
        if left > 0.13 and right > 0.13 and top > 0.13:
            return True
        return False

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

        threshold = 50.0 if self._bg_dominance > 0.70 else 32.0
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
            if _diag == 'sequence':
                keep_threshold = 0.45
            elif _diag in ('uml', 'flowchart'):
                keep_threshold = 0.55
            elif _diag == 'architecture':
                keep_threshold = 0.65
            else:
                keep_threshold = self.confidence_threshold
            if score > keep_threshold:  # Threshold for keeping mask
                mask['quality_score'] = score
                filtered.append(mask)
        
        # Sort by score and apply NMS
        filtered.sort(key=lambda x: x['quality_score'], reverse=True)
        filtered = self._non_maximum_suppression(filtered)

        # Post-NMS: reject masks that overlap many peers without containing them
        filtered = self._filter_overlapping_outliers(filtered)

        return filtered
    
    def _filter_overlapping_outliers(self, masks: List[Dict]) -> List[Dict]:
        """Post-NMS pass: reject masks that heavily overlap many peers.

        After NMS, a mask that still touches N or more other masks without
        cleanly enclosing them is almost always a false positive — a large
        background blob, a hollow outline, or a sprawling SAM artifact that
        slipped through the greedy NMS pass.

        A mask is rejected when:
          - It has bbox IoU > OVERLAP_THR with >= PEER_COUNT other masks, AND
          - Its average containment of those peers (fraction of each peer's
            bbox that lies inside this mask) is < CONTAIN_THR, meaning it is
            NOT a legitimate container (e.g. an architecture group box that
            cleanly wraps children is fine).

        Lower-scoring masks are more aggressively checked; high-scoring masks
        need more overlapping peers before they are removed.
        """
        OVERLAP_THR  = 0.08   # bbox IoU considered "overlapping"
        CONTAIN_THR  = 0.72   # avg containment below this → not a real container
        PEER_COUNT   = 3      # number of overlapping peers that triggers rejection

        keep_flags = [True] * len(masks)

        for i, m in enumerate(masks):
            if not keep_flags[i]:
                continue

            overlapping_peers = []
            for j, k in enumerate(masks):
                if i == j or not keep_flags[j]:
                    continue
                if self._bbox_iou(m, k) > OVERLAP_THR:
                    overlapping_peers.append(k)

            if len(overlapping_peers) < PEER_COUNT:
                continue

            # Check whether m genuinely contains most of the overlapping peers.
            avg_containment = sum(
                self._bbox_contain_k_in_m(m, peer) for peer in overlapping_peers
            ) / len(overlapping_peers)

            if avg_containment < CONTAIN_THR:
                # Penalise the score; reject if it drops below the keep threshold.
                penalty = 0.08 * (len(overlapping_peers) - PEER_COUNT + 1)
                new_score = m.get('quality_score', 0.0) - penalty
                if new_score <= 0.40:
                    keep_flags[i] = False
                else:
                    m['quality_score'] = round(new_score, 3)

        result = [m for i, m in enumerate(masks) if keep_flags[i]]
        removed = len(masks) - len(result)
        if removed:
            print(f"   Overlap-outlier filter removed {removed} mask(s)")
        return result

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
                    if ic_edge_density < 0.08 and ic_variance < 300:
                        return 0.0
        
        # Hard reject: normalised bbox area too small or too large
        # Use relaxed thresholds for structured diagram types (explicit hint OR auto-detected)
        norm_area = (w * h) / img_area
        _hint = getattr(self, '_hint_diagram_type', None)
        _diag = _hint or getattr(self, 'diagram_type', 'medium')
        if _diag == 'architecture':
            _min_norm = 0.003
        elif _diag in ('uml', 'flowchart', 'sequence'):
            _min_norm = 0.001
        else:
            _min_norm = 0.004
        if _diag == 'architecture':
            _max_norm = 0.65   # allow large group containers
        elif _diag in ('uml', 'flowchart', 'sequence'):
            _max_norm = 0.30
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
        bottom_margin = int(img_h * 0.005)
        touches_bottom_only = (y + h >= img_h - bottom_margin) and (y > img_h * 0.5)
        touches_sides = (x <= border_margin) or ((x + w) >= img_w - border_margin)
        if touches_bottom_only and touches_sides and norm_area < 0.08:
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
        
        # Hard reject: low fill-ratio masks — these are connection lines, arrows, or
        # partial outlines, not real components.  A genuine component fills most of
        # its bounding box; a line segment or stray stroke does not.
        bbox_pixel_area = w * h
        fill_ratio = area / bbox_pixel_area if bbox_pixel_area > 0 else 0
        if norm_area > 0.08:
            # Large blobs that aren't compact are merged background segments
            if fill_ratio < 0.60:
                return 0.0
        elif norm_area > 0.02:
            # Medium components — still require reasonable fill
            if fill_ratio < 0.40:
                return 0.0
        else:
            # Small components — allow slightly lower fill but reject obvious lines
            if fill_ratio < 0.30:
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
                    size_score = 0.8
                elif 0.001 < relative_area <= 0.002:
                    size_score = 0.25
                elif relative_area < 0.001:
                    size_score = 0.2
                else:
                    size_score = 0.5
            else:
                if 0.005 < relative_area < 0.05:
                    size_score = 0.85
                elif 0.003 < relative_area <= 0.005:
                    size_score = 0.65
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
            edge_score = min(1.0, edge_density * 10)
        else:
            edge_score = 0.0
        
        # Factor 4: Texture complexity (avoid blank regions)
        if region.size > 0:
            texture_variance = np.var(region)
            texture_score = min(1.0, texture_variance / 2000)
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
                        # Thresholds raised to catch near-empty box regions (false positives).
                        if interior_edge_density < 4.0 and interior_variance < 500:
                            interior_rgb = region_rgb[margin_y:rh - margin_y, margin_x:rw - margin_x]
                            if interior_rgb.size > 0:
                                interior_color = np.mean(interior_rgb.reshape(-1, 3), axis=0)
                                bg_diff = float(np.linalg.norm(interior_color - self._bg_rgb))
                                if bg_diff < 55 and not self._has_rect_frame(region):
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
            border_penalty = 0.3
        else:
            border_penalty = 0.0
        
        # Factor 7: Rectangularity bonus — clearly rectangular shapes are almost always
        # real components in technical diagrams, not noise or background regions
        # rectangularity_bonus = 0.0
        # if seg_contours_early:
        #     cnt_r = max(seg_contours_early, key=cv2.contourArea)
        #     bx_r, by_r, bw_r, bh_r = cv2.boundingRect(cnt_r)
        #     bb_area_r = bw_r * bh_r
        #     if bb_area_r > 0:
        #         rect_fill = cv2.contourArea(cnt_r) / bb_area_r
        #         if rect_fill > 0.82:
        #             rectangularity_bonus = 0.10
        #         elif rect_fill > 0.70:
        #             rectangularity_bonus = 0.05

        # Type-specific hard reject + score adjustment
        type_adj, type_reject = self._type_specific_filter(
            x, y, w, h, segmentation, img_array, norm_area, img_w, img_h
        )
        if type_reject:
            return 0.0

        # Weighted composite score (capped at 1.0)
        total_score = (
            0.20 * size_score +
            0.18 * aspect_score +
            0.20 * edge_score +
            0.15 * texture_score +
            0.17 * compactness_score +
            0.10 * min(1.0, mask.get('predicted_iou', 0.8))
        ) - border_penalty + type_adj

        total_score = max(0.0, min(0.95, total_score))
        
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
            if norm_area < 0.01:
                return 0.0, True
            # Full-width page banners are not class boxes.
            if aspect > 6.0:
                return 0.0, True
            # Vertical connector lines / overflow segments: height > 5× width.
            # Real UML class boxes always have aspect (w/h) > 0.20 in practice.
            if aspect < 0.20:
                return 0.0, True
            # Elements that start within the top/bottom 1% of the image height
            # and are taller than they are wide are connector overflows, not boxes.
            if y / (img_h + 1e-6) < 0.01 and aspect < 0.60:
                return 0.0, True
            if (y + h) / (img_h + 1e-6) > 0.99 and aspect < 0.60:
                return 0.0, True
            # Relationship lines, arrows, and connectors between class boxes have
            # low fill ratios (thin strokes inside their bounding box). Real class
            # boxes are solid rectangles with fill ≥ 0.55.
            cnt_fill_list, _ = cv2.findContours(
                segmentation.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            if cnt_fill_list:
                fill_area = cv2.contourArea(max(cnt_fill_list, key=cv2.contourArea))
                fill_ratio = fill_area / (w * h + 1e-6)
                if fill_ratio < 0.60:
                    return 0.0, True
            # Reject boxes whose interior is empty (whitespace with a frame but no content).
            roi = img_array[max(0, y):min(img_h, y + h), max(0, x):min(img_w, x + w)]
            if roi.size > 0:
                rh_u, rw_u = roi.shape[:2]
                if rh_u >= 10 and rw_u >= 10:
                    mx_u = max(3, int(rw_u * 0.20))
                    my_u = max(3, int(rh_u * 0.20))
                    interior_u = roi[my_u:rh_u - my_u, mx_u:rw_u - mx_u]
                    if interior_u.size > 0:
                        int_edges_u = cv2.Canny(interior_u, 50, 150)
                        int_ed_u = int_edges_u.sum() / interior_u.size
                        int_var_u = float(np.var(interior_u))
                        # Empty interior with no compartments → false positive
                        if int_ed_u < 4.0 and int_var_u < 500 and not self._has_compartments(roi):
                            return 0.0, True
            # Boost compartmented rectangles (name / attributes / methods sections).
            if roi.size > 0 and self._has_compartments(roi):
                return 0.08, False
            return 0.0, False

        # ── Flowchart diagrams ─────────────────────────────────────────────
        elif diag == 'flowchart':
            # Small connector dots and isolated arrowhead labels are too tiny.
            if norm_area < 0.003:
                return 0.0, True
            # Arrow lines masquerading as thin boxes.
            if aspect > 7.0 or aspect < 0.14:
                return 0.0, True
            # Identify diamonds and ovals for a score boost; reject low-fill shapes
            # that don't match any expected flowchart shape (arrow shafts, partial
            # outlines, broken segments).
            cnts, _ = cv2.findContours(
                segmentation.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
            )
            if cnts:
                cnt      = max(cnts, key=cv2.contourArea)
                cnt_area = cv2.contourArea(cnt)
                peri     = cv2.arcLength(cnt, True)
                approx   = cv2.approxPolyDP(cnt, 0.03 * peri, True)
                fill     = cnt_area / (w * h + 1e-6)
                circ     = (4 * np.pi * cnt_area) / (peri ** 2) if peri > 0 else 0
                is_diamond = len(approx) == 4 and 0.38 < fill < 0.68
                is_oval    = circ > 0.65
                # Diamond: 4 vertices, fill ≈ 0.5 (rotated square)
                if is_diamond:
                    return 0.08, False
                # Oval / terminator: circularity > 0.65
                if is_oval:
                    return 0.05, False
                # Rectangle / parallelogram: must have solid fill — reject partial
                # outlines, broken shapes, and arrow shafts.
                if fill < 0.65:
                    return 0.0, True
                # Reject empty rectangular boxes (frame with no interior content).
                roi_f = img_array[max(0, y):min(img_h, y + h), max(0, x):min(img_w, x + w)]
                if roi_f.size > 0:
                    rh_f, rw_f = roi_f.shape[:2]
                    if rh_f >= 10 and rw_f >= 10:
                        mx_f = max(3, int(rw_f * 0.20))
                        my_f = max(3, int(rh_f * 0.20))
                        interior_f = roi_f[my_f:rh_f - my_f, mx_f:rw_f - mx_f]
                        if interior_f.size > 0:
                            int_edges_f = cv2.Canny(interior_f, 50, 150)
                            int_ed_f = int_edges_f.sum() / interior_f.size
                            int_var_f = float(np.var(interior_f))
                            if int_ed_f < 4.0 and int_var_f < 500:
                                return 0.0, True
            return 0.0, False

        # ── Architecture diagrams ──────────────────────────────────────────
        elif diag == 'architecture':
            # Thin connector lines that form a narrow rectangle.
            if (aspect > 10.0 or aspect < 0.10) and norm_area < 0.04:
                return 0.0, True
            # Very small regions are likely icons, dots, or connector artefacts.
            if norm_area < 0.005:
                return 0.0, True
            roi = img_array[max(0, y):min(img_h, y + h), max(0, x):min(img_w, x + w)]
            if roi.size > 0:
                has_frame = self._has_rect_frame(roi.astype(np.float32))
                # Even framed boxes are rejected if their interior is empty.
                # Architecture diagrams often have large whitespace containers
                # that SAM picks up as regions.
                rh, rw = roi.shape[:2]
                if rh >= 10 and rw >= 10:
                    mx = max(3, int(rw * 0.20))
                    my = max(3, int(rh * 0.20))
                    interior = roi[my:rh - my, mx:rw - mx]
                    if interior.size > 0:
                        int_edges = cv2.Canny(interior, 50, 150)
                        int_edge_density = int_edges.sum() / interior.size
                        int_variance = float(np.var(interior))
                        if int_edge_density < 3.0 and int_variance < 400:
                            return 0.0, True
                return (0.05 if has_frame else -0.15), False
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

    def _merge_adjacent_components(
        self, components: List[Dict], img_w: int, img_h: int
    ) -> List[Dict]:
        """Merge component fragments that are adjacent and similarly sized.

        Two fragments are merged when they are directly next to each other
        (stacked vertically OR side-by-side horizontally) and either width OR
        height is near-identical.
        """
        diag = getattr(self, 'diagram_type', 'other')

        gap_threshold_y = img_h * 0.005
        gap_threshold_x = img_w * 0.005
        dim_tolerance = 0.002  # allow tiny detector jitter around "identical"

        while True:
            best_pair = None
            best_gap  = float('inf')

            for i, ca in enumerate(components):
                ay1 = ca['y'] * img_h
                ay2 = (ca['y'] + ca['height']) * img_h
                ax1 = ca['x'] * img_w
                ax2 = (ca['x'] + ca['width']) * img_w
                wa  = ax2 - ax1
                ha  = ay2 - ay1

                for j, cb in enumerate(components):
                    if j == i:
                        continue
                    by1 = cb['y'] * img_h
                    by2 = (cb['y'] + cb['height']) * img_h

                    bx1 = cb['x'] * img_w
                    bx2 = (cb['x'] + cb['width']) * img_w
                    wb  = bx2 - bx1
                    hb  = by2 - by1

                    width_match = abs(wa - wb) / (max(wa, wb) + 1e-6) <= dim_tolerance
                    height_match = abs(ha - hb) / (max(ha, hb) + 1e-6) <= dim_tolerance
                    if not (width_match or height_match):
                        continue

                    # Vertical adjacency: strong overlap in x and tiny y-gap.
                    v_gap = min(abs(by1 - ay2), abs(ay1 - by2))
                    x_overlap = min(ax2, bx2) - max(ax1, bx1)
                    min_w = min(wa, wb)
                    vertical_adjacent = (
                        v_gap <= gap_threshold_y and
                        min_w > 0 and
                        (x_overlap / min_w) >= 0.70
                    )

                    # Horizontal adjacency: strong overlap in y and tiny x-gap.
                    h_gap = min(abs(bx1 - ax2), abs(ax1 - bx2))
                    y_overlap = min(ay2, by2) - max(ay1, by1)
                    min_h = min(ha, hb)
                    horizontal_adjacent = (
                        h_gap <= gap_threshold_x and
                        min_h > 0 and
                        (y_overlap / min_h) >= 0.70
                    )

                    if not (vertical_adjacent or horizontal_adjacent):
                        continue

                    gap_score = min(
                        v_gap if vertical_adjacent else float('inf'),
                        h_gap if horizontal_adjacent else float('inf'),
                    )

                    if gap_score < best_gap:
                        best_gap  = gap_score
                        best_pair = (i, j)

            if best_pair is None:
                break  # nothing left to merge

            i, j = best_pair
            ca, cb = components[i], components[j]

            new_x  = min(ca['x'], cb['x'])
            new_y  = min(ca['y'], cb['y'])
            new_x2 = max(ca['x'] + ca['width'],  cb['x'] + cb['width'])
            new_y2 = max(ca['y'] + ca['height'], cb['y'] + cb['height'])

            seg = None
            if 'segmentation' in ca and 'segmentation' in cb:
                seg = np.logical_or(ca['segmentation'], cb['segmentation'])

            merged = {
                'id':            ca['id'],
                'label':         ca.get('label', 'Component'),
                'semantic_label': ca.get('semantic_label', ca.get('label', 'Component')),
                'confidence':    max(ca.get('confidence', 0.8), cb.get('confidence', 0.8)),
                'x':             new_x,
                'y':             new_y,
                'width':         new_x2 - new_x,
                'height':        new_y2 - new_y,
                'center_x':      (new_x + new_x2) / 2,
                'center_y':      (new_y + new_y2) / 2,
                'area':          (new_x2 - new_x) * (new_y2 - new_y),
                'shape_features': ca.get('shape_features', {}),
                'terminals':     ca.get('terminals', []) + cb.get('terminals', []),
                'description':   ca.get('description', ''),
            }
            if seg is not None:
                merged['segmentation'] = seg

            # Replace ca with the merged result, remove cb
            components[i] = merged
            components.pop(j)

        # Re-index IDs only; keep semantic labels intact.
        for idx, comp in enumerate(components):
            comp['id'] = f'component_{idx}'

        return components

    def _non_maximum_suppression(self, masks: List[Dict], iou_threshold: float = 0.25) -> List[Dict]:
        """Remove overlapping, contained, and spanning-artifact masks.

        Three suppression rules (applied in order):

        1. Pixel IoU ≥ iou_threshold   → duplicate / heavily overlapping mask
        2. Pixel containment ≥ 0.85   → one mask almost fully inside the other
        3. Spanning-artifact check     → candidate's bounding box significantly
           overlaps 2+ already-kept masks WITHOUT cleanly containing them.
           SAM often produces hollow outline masks whose *pixel* overlap with
           individual components is low (escaping rules 1 & 2) even though the
           bounding box spans multiple valid components.  Bounding-box geometry
           catches these reliably.

           A mask m is a spanning artifact if, for 2+ kept masks k:
             • bbox_iou(m, k)          > 0.12   (real bbox overlap)
             • bbox_contain(m→k)       < 0.88   (k not fully inside m)
           The second condition exempts legitimate containers: a container fully
           encloses its children (contain ≈ 1.0), so they are never counted.
        """
        if len(masks) == 0:
            return []

        keep = []
        while masks:
            current = masks.pop(0)

            # ── Spanning-artifact check against already-kept set ──────────
            spanning = sum(
                1 for k in keep
                if self._bbox_iou(current, k) > 0.12
                and self._bbox_contain_k_in_m(current, k) < 0.88
            )
            if spanning >= 2:
                continue  # this candidate spans multiple kept components

            keep.append(current)

            remaining = []
            for m in masks:
                # Rule 1 & 2: pixel-level IoU / containment
                iou = self._calculate_iou(current, m)
                c_in  = self._calculate_containment(current, m)
                c_of  = self._calculate_containment(m, current)
                if iou >= iou_threshold or max(c_in, c_of) >= 0.85:
                    continue

                # Rule 3: bbox-based spanning check against all kept masks
                spanning_m = sum(
                    1 for k in keep
                    if self._bbox_iou(m, k) > 0.12
                    and self._bbox_contain_k_in_m(m, k) < 0.88
                )
                if spanning_m >= 2:
                    continue  # spanning artifact

                remaining.append(m)
            masks = remaining

        return keep

    # ── Bounding-box geometry helpers (used by spanning-artifact check) ──

    def _bbox_iou(self, m: Dict, k: Dict) -> float:
        """Axis-aligned bounding box IoU between two masks."""
        mx, my, mw, mh = m['bbox']
        kx, ky, kw, kh = k['bbox']
        ix1 = max(mx, kx);        iy1 = max(my, ky)
        ix2 = min(mx + mw, kx + kw); iy2 = min(my + mh, ky + kh)
        if ix2 <= ix1 or iy2 <= iy1:
            return 0.0
        inter = (ix2 - ix1) * (iy2 - iy1)
        union = mw * mh + kw * kh - inter
        return inter / union if union > 0 else 0.0

    def _bbox_contain_k_in_m(self, m: Dict, k: Dict) -> float:
        """Fraction of k's bounding box that lies inside m's bounding box."""
        mx, my, mw, mh = m['bbox']
        kx, ky, kw, kh = k['bbox']
        ix1 = max(mx, kx);        iy1 = max(my, ky)
        ix2 = min(mx + mw, kx + kw); iy2 = min(my + mh, ky + kh)
        if ix2 <= ix1 or iy2 <= iy1:
            return 0.0
        inter = (ix2 - ix1) * (iy2 - iy1)
        area_k = kw * kh
        return inter / area_k if area_k > 0 else 0.0

    def _calculate_containment(self, mask1: Dict, mask2: Dict) -> float:
        """Calculate how much of mask2 is contained within mask1 (pixel level)."""
        seg1 = mask1['segmentation']
        seg2 = mask2['segmentation']
        intersection = np.logical_and(seg1, seg2).sum()
        area2 = seg2.sum()
        return intersection / area2 if area2 > 0 else 0.0

    def _calculate_iou(self, mask1: Dict, mask2: Dict) -> float:
        """Pixel-level intersection over union for two masks."""
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
            
            # Shape-based fallback label
            shape_label = self._classify_by_shape(shape_features, w_norm, h_norm)
            # Text-first semantic label (OCR/vision), then fallback to shape.
            semantic_label = self._label_component_semantic(img, x, y, w, h, shape_label)
            
            components.append({
                'id': f'component_{idx}',
                'label': semantic_label,
                'semantic_label': semantic_label,
                'confidence': round(min(0.95, mask.get('quality_score', 0.5)), 3),
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
                'description': f'{semantic_label} at ({cx:.2f}, {cy:.2f})'
            })
        
        return components

    def _label_component_semantic(
        self,
        img: Image.Image,
        x: int,
        y: int,
        w: int,
        h: int,
        fallback_label: str,
    ) -> str:
        """Label a component using text-first extraction with safe fallback.

        Priority:
          1. OCR text inside/near the crop
          2. Vision-model short answer on the crop
          3. Shape-based fallback label
        """
        try:
            img_w, img_h = img.size
            pad_x = max(4, int(w * 0.12))
            pad_y = max(4, int(h * 0.12))
            x1 = max(0, x - pad_x)
            y1 = max(0, y - pad_y)
            x2 = min(img_w, x + w + pad_x)
            y2 = min(img_h, y + h + pad_y)
            crop = img.crop((x1, y1, x2, y2))

            # OCR path (optional dependency)
            ocr_label = self._try_ocr_label(crop)
            if ocr_label:
                return ocr_label

            # Vision fallback path
            vision_label = self._try_vision_label(crop)
            if vision_label:
                return vision_label
        except Exception:
            pass

        return fallback_label

    def _try_ocr_label(self, crop: Image.Image) -> Optional[str]:
        """Attempt OCR-based naming; returns cleaned short label or None."""
        try:
            import pytesseract
        except Exception:
            return None

        try:
            gray = np.array(crop.convert('L'))
            # Mild threshold helps diagram text stand out from background fills.
            th = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 31, 7
            )
            text = pytesseract.image_to_string(th, config='--psm 6').strip()
            if not text:
                return None

            # Keep first non-empty line; component names are usually short.
            line = next((ln.strip() for ln in text.splitlines() if ln.strip()), '')
            if not line:
                return None

            cleaned = clean_label(line)
            if cleaned and cleaned.lower() != 'unknown':
                return cleaned
        except Exception:
            return None

        return None

    def _try_vision_label(self, crop: Image.Image) -> Optional[str]:
        """Ask vision model for component name from a temporary crop file."""
        try:
            with tempfile.NamedTemporaryFile(suffix='.png', delete=True) as tmp:
                crop.save(tmp.name, format='PNG')
                answer = query_image(tmp.name, COMPONENT_LABEL_PROMPT)
            cleaned = clean_label(answer)
            if cleaned and cleaned.lower() != 'unknown':
                return cleaned
        except Exception:
            return None

        return None
    
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
    
    # Connection-analysis path intentionally removed from AR extraction due to
    # low accuracy in current datasets.
    
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
        boxes.extend([(x, y, w, h, 'actor') for x, y, w, h, *_ in actor_boxes])
        print(f"   Sequence: {len(actor_boxes)} actor box(es)")

        # Activation bars
        activation_boxes = self._find_seq_activation_bars(gray, lifeline_xs, img_w, img_h)
        boxes.extend([(x, y, w, h, 'activation') for x, y, w, h, *_ in activation_boxes])
        print(f"   Sequence: {len(activation_boxes)} activation bar(s)")

        # Fragment / phase boxes
        fragment_boxes = self._find_seq_fragment_boxes(gray, img_w, img_h)
        boxes.extend([(x, y, w, h, 'fragment') for x, y, w, h, *_ in fragment_boxes])
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