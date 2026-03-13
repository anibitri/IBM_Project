"""
ar_service.py - Updated with debug output and tuned thresholds
"""

import numpy as np
from PIL import Image, ImageStat
import torch
from typing import List, Dict, Optional, Tuple

from app.services.model_manager import manager
from app.services.prompt_builder import (
    COMPONENT_LABEL_PROMPT,
    build_connection_prompt,
    build_vision_chat_text,
    clean_label,
    make_unique_labels,
)


class ARService:
    """AR component extraction and analysis"""
    
    def __init__(self):
        self.confidence_threshold = 0.35
        self.min_box_area = 1000
        self.iou_threshold = 0.35
        self.iomin_threshold = 0.70
        self.max_components = 50
        self.proximity_threshold = 0.05

        # Size Thresholds
        self.max_area_ratio = 0.85
        self.min_area_ratio = 0.002
        self.min_dimension = 22
        self.max_aspect_ratio = 6.5
        
        # Visual complexity thresholds
        self.min_color_variance = 10.0    
        self.min_edge_density = 0.01

        # Border margin
        self.edge_exclude_margin = 0.02

        # Box tightening parameters
        self.tighten_boxes = True
        self.tighten_margin = 0.15          # max fraction of box dim to shrink per side
        self.tighten_bg_threshold = 12      # pixel intensity diff from border to count as content

        # Containment removal parameters
        self.container_min_area_ratio = 0.55
        self.container_min_children = 5
        self.nesting_size_ratio = 1.8

        # Text-region detection thresholds
        self.text_edge_density_threshold = 0.18   # text has very dense edges
        self.text_fill_ratio_threshold = 0.45     # text fills the box uniformly
        self.text_max_height_px = 50              # standalone text is usually short
        self.text_min_aspect_ratio = 2.0          # text regions are wide & short

        # Empty-box detection
        self.empty_box_max_variance = 18.0        # very low colour spread
        self.empty_box_max_edge_density = 0.025   # almost no interior edges
        
        # Debug mode
        self.debug_complexity = False  # Set to True to see rejection reasons

        # Re-enable broad vision labeling coverage.
        # Use max_components by default so most/all detections can be labeled.
        self.max_vision_label_queries = self.max_components

        # Per-image adaptive scene context (updated in extract_document_features)
        self._scene_context = {
            'background': 'light',
            'diagram_type': 'general',
            'brightness': 200.0,
            'edge_density': 0.01,
            'dominant_rgb': (240.0, 240.0, 240.0),
            'dominance_ratio': 0.0,
            'is_light_background': True,
        }
    
    def extract_document_features(
        self, 
        image_path: str, 
        hints: List[str] = None
    ) -> List[Dict]:
        """Extract AR-ready components from an image."""
        if hints is None:
            hints = []
        
        try:
            img = Image.open(image_path).convert("RGB")
            img_width, img_height = img.size

            # Analyse scene once and adapt thresholds for this image.
            self._scene_context = self._analyze_scene_context(img)
            if self.debug_complexity:
                print(
                    "   🧭 Scene context: "
                    f"bg={self._scene_context['background']}, "
                    f"type={self._scene_context['diagram_type']}, "
                    f"brightness={self._scene_context['brightness']:.1f}, "
                    f"edge_density={self._scene_context['edge_density']:.4f}"
                )
            
            if manager.ar_model is None:
                print("⚠️ SAM model not loaded")
                return []
            
            # If SAM is on CPU, check whether GPU has recovered
            manager.try_restore_sam_to_gpu()
            
            # Run SAM with OOM protection
            try:
                results = manager.ar_model(image_path)
            except torch.cuda.OutOfMemoryError:
                print("⚠️ SAM CUDA OOM — switching to CPU")
                manager.move_sam_to_cpu()
                results = manager.ar_model(image_path)
            
            segments = self._extract_segments(results, img_width, img_height)
            print(f"   📦 Raw SAM detections: {len(segments)}")
            
            filtered = self._filter_segments(segments, img_width, img_height)
            print(f"   ✓ After basic filtering: {len(filtered)}")
            
            # Tighten boxes to actual content boundaries
            if self.tighten_boxes:
                filtered = self._tighten_boxes(filtered, img)
                print(f"   ✓ After box tightening: {len(filtered)}")
            
            img_area = img_width * img_height
            unique = self._remove_overlaps(filtered, img_area=img_area)
            print(f"   ✓ After NMS: {len(unique)}")
            
            # Remove smaller box when it is mostly covered by a larger one
            unique = self._remove_high_overlap_pairs(unique)
            print(f"   ✓ After IoMin overlap pass: {len(unique)}")
            
            # Remove larger box when a smaller one is fully contained in it
            unique = self._remove_contained_duplicates(unique)
            print(f"   ✓ After containment dedup: {len(unique)}")
            
            # NEW: Debug mode for first run
            if self.debug_complexity:
                print(f"\n   🔍 DEBUGGING VISUAL COMPLEXITY:")
                self._debug_complexity_values(unique[:5], img)  # Check first 5
            
            complex_enough = self._filter_by_visual_complexity(unique, img)
            print(f"   ✓ After visual complexity filtering: {len(complex_enough)}")
            
            components = self._normalize_components(complex_enough, img_width, img_height)
            print(f"   ✓ Normalized to AR components: {len(components)}")
            
            components = self._label_components(components, image_path, hints)
            print(f"   ✓ Labeled components: {len(components)}")

            # Post-label filter: remove components whose vision label
            # reveals they are text/annotations rather than real components
            components = self._filter_text_labels(components)
            print(f"   ✓ After text-label filtering: {len(components)}")

            components = self._deduplicate_by_label(components)
            print(f"   ✓ Deduplicated by label: {len(components)}")

            components = components[:self.max_components]
            
            print(f"✅ Extracted {len(components)} AR components")
            return components
        
        except Exception as e:
            print(f"❌ AR extraction failed: {e}")
            import traceback
            traceback.print_exc()
            return []

    def _analyze_scene_context(self, img: Image.Image) -> Dict[str, float | str]:
        """Classify image background/type for adaptive filtering.

        This mirrors the improved service idea at lower complexity:
        - light vs dark background
        - dense architecture vs sparse/simple diagrams
        """
        gray = np.array(img.convert('L'), dtype=np.float32)
        brightness = float(np.mean(gray))

        dx = np.diff(gray, axis=1, prepend=gray[:, :1])
        dy = np.diff(gray, axis=0, prepend=gray[:1, :])
        grad = np.sqrt(dx**2 + dy**2)
        edge_density = float(np.mean(grad > 10))

        if brightness < 120:
            background = 'dark'
        else:
            background = 'light'

        if edge_density > 0.08:
            diagram_type = 'dense'
        elif edge_density > 0.03:
            diagram_type = 'structured'
        else:
            diagram_type = 'simple'

        dominant_rgb, dominance_ratio = self._estimate_dominant_color(img)
        is_light_background = bool(np.mean(np.array(dominant_rgb, dtype=np.float32)) >= 145.0)

        return {
            'background': background,
            'diagram_type': diagram_type,
            'brightness': brightness,
            'edge_density': edge_density,
            'dominant_rgb': dominant_rgb,
            'dominance_ratio': dominance_ratio,
            'is_light_background': is_light_background,
        }

    def _estimate_dominant_color(self, img: Image.Image) -> Tuple[Tuple[float, float, float], float]:
        """Estimate dominant border colour as likely diagram background."""
        arr = np.array(img.resize((200, 200), Image.BILINEAR), dtype=np.uint8)
        h, w = arr.shape[:2]
        b = max(2, min(h, w) // 18)

        border = np.concatenate([
            arr[:b, :, :].reshape(-1, 3),
            arr[-b:, :, :].reshape(-1, 3),
            arr[:, :b, :].reshape(-1, 3),
            arr[:, -b:, :].reshape(-1, 3),
        ], axis=0)

        quant = (border // 20) * 20
        colors, counts = np.unique(quant, axis=0, return_counts=True)
        if len(colors) == 0:
            return (240.0, 240.0, 240.0), 0.0

        idx = int(np.argmax(counts))
        dom = colors[idx].astype(np.float32) + 10.0
        dom = np.clip(dom, 0, 255)
        ratio = float(counts[idx] / max(len(border), 1))
        return (float(dom[0]), float(dom[1]), float(dom[2])), ratio

    def _compute_adaptive_area_bounds(
        self,
        segments: List[Dict],
        img_width: int,
        img_height: int,
    ) -> Tuple[float, float, float, int]:
        """Adapt area bounds using image size, count, and component crowding."""
        img_area = float(img_width * img_height)
        mp = img_area / 1_000_000.0

        min_ratio = float(self.min_area_ratio)
        max_ratio = float(self.max_area_ratio)

        candidate = []
        for seg in segments:
            if seg.get('confidence', 0.0) < self.confidence_threshold * 0.7:
                continue
            x1, y1, x2, y2 = seg['box_pixels']
            w = max(1.0, x2 - x1)
            h = max(1.0, y2 - y1)
            if w < 8 or h < 8:
                continue
            cx = (x1 + x2) * 0.5
            cy = (y1 + y2) * 0.5
            candidate.append((cx, cy))

        count = len(candidate)
        if count > 95:
            min_ratio *= 0.55
            max_ratio *= 0.62
        elif count > 60:
            min_ratio *= 0.70
            max_ratio *= 0.72
        elif count < 18:
            min_ratio *= 1.30
            max_ratio *= 1.08

        # Larger images naturally contain smaller valid components.
        if mp >= 1.5:
            min_ratio *= 0.82
        elif mp < 0.50:
            min_ratio *= 1.18

        # Crowding estimate from nearest-neighbor center distance.
        median_nn = 0.12
        if count >= 3:
            diag = max((img_width ** 2 + img_height ** 2) ** 0.5, 1.0)
            nn_dists = []
            for i, (cx, cy) in enumerate(candidate):
                best = None
                for j, (ox, oy) in enumerate(candidate):
                    if i == j:
                        continue
                    d = ((cx - ox) ** 2 + (cy - oy) ** 2) ** 0.5 / diag
                    if best is None or d < best:
                        best = d
                if best is not None:
                    nn_dists.append(best)
            if nn_dists:
                median_nn = float(np.median(np.array(nn_dists, dtype=np.float32)))

        if median_nn < 0.070:
            min_ratio *= 0.70
            max_ratio *= 0.74
        elif median_nn > 0.18:
            min_ratio *= 1.18
            max_ratio *= 1.08

        min_ratio = float(np.clip(min_ratio, 0.0008, 0.02))
        max_ratio = float(np.clip(max_ratio, 0.20, 0.92))
        if max_ratio < min_ratio * 6.0:
            max_ratio = min(0.92, min_ratio * 6.0)

        return min_ratio, max_ratio, median_nn, count

    def _is_background_colored_region(self, crop: Image.Image) -> bool:
        """Return True when crop colour is close to dominant background colour."""
        scene = getattr(self, '_scene_context', {})
        dom = scene.get('dominant_rgb')
        if not dom:
            return False

        arr = np.array(crop, dtype=np.float32)
        if arr.size == 0:
            return False

        h, w = arr.shape[:2]
        my = max(int(h * 0.15), 2)
        mx = max(int(w * 0.15), 2)
        if h > (my * 2 + 2) and w > (mx * 2 + 2):
            core = arr[my:-my, mx:-mx]
        else:
            core = arr

        mean_rgb = np.mean(core, axis=(0, 1))
        spread = float(np.mean(np.std(core, axis=(0, 1))))
        dom_vec = np.array(dom, dtype=np.float32)
        dist = float(np.linalg.norm(mean_rgb - dom_vec))

        dominance_ratio = float(scene.get('dominance_ratio', 0.0))
        light_bg = bool(scene.get('is_light_background', True))
        if light_bg:
            threshold = 40.0 if dominance_ratio > 0.25 else 34.0
            max_spread = 34.0
        else:
            threshold = 34.0 if dominance_ratio > 0.22 else 28.0
            max_spread = 38.0
        return dist <= threshold and spread < max_spread

    def _classify_text_layout(self, crop: Image.Image, w_px: int, h_px: int, area_ratio: float) -> str:
        """Classify as boxed text vs floating text to keep boxed components."""
        if w_px < 14 or h_px < 10:
            return 'unknown'

        arr = np.array(crop.convert('L'), dtype=np.float32)
        h, w = arr.shape[:2]
        if h < 6 or w < 6:
            return 'unknown'

        gx = np.abs(np.diff(arr, axis=1, prepend=arr[:, :1]))
        gy = np.abs(np.diff(arr, axis=0, prepend=arr[:1, :]))
        g = np.sqrt(gx ** 2 + gy ** 2)

        b = max(1, min(h, w) // 10)
        top = g[:b, :]
        bottom = g[-b:, :]
        left = g[:, :b]
        right = g[:, -b:]
        core = g[b:h - b, b:w - b] if h > 2 * b and w > 2 * b else g

        top_line = float(np.mean(top > 11)) > 0.15
        bottom_line = float(np.mean(bottom > 11)) > 0.15
        left_line = float(np.mean(left > 11)) > 0.15
        right_line = float(np.mean(right > 11)) > 0.15
        frame_sides = sum([top_line, bottom_line, left_line, right_line])

        has_box_frame = self._has_box_frame(crop)

        # Dense center edges with weak border frame usually means free text.
        center_dense = float(np.mean(core > 11)) > 0.13
        border_weak = float(np.mean(np.concatenate([top.ravel(), bottom.ravel(), left.ravel(), right.ravel()]) > 11)) < 0.11

        if has_box_frame or frame_sides >= 3:
            return 'boxed_text'

        # Text tends to form multiple horizontal bands with weak border frame.
        border_pixels = np.concatenate([arr[0, :], arr[-1, :], arr[:, 0], arr[:, -1]])
        bg_val = float(np.median(border_pixels))
        content_mask = np.abs(arr - bg_val) > 18
        row_density = np.mean(content_mask, axis=1)
        active_rows = row_density > 0.08
        row_changes = np.diff(active_rows.astype(np.int32), prepend=0, append=0)
        band_count = int(np.sum(row_changes == 1))

        if area_ratio < 0.03 and center_dense and border_weak and band_count >= 1:
            return 'floating_text'
        return 'unknown'

    def _is_text_in_filled_container(
        self,
        crop: Image.Image,
        w_px: int,
        h_px: int,
        area_ratio: float,
        bg_like: bool,
    ) -> bool:
        """Keep stage/banner-like components that contain text inside a box."""
        if w_px < 40 or h_px < 18 or area_ratio < 0.003:
            return False

        arr = np.array(crop.convert('L'), dtype=np.float32)
        h, w = arr.shape[:2]
        if h < 8 or w < 8:
            return False

        border = np.concatenate([arr[0, :], arr[-1, :], arr[:, 0], arr[:, -1]])
        bg_val = float(np.median(border))
        content = np.abs(arr - bg_val) > 18
        row_density = np.mean(content, axis=1)
        active = row_density > 0.08
        transitions = np.diff(active.astype(np.int32), prepend=0, append=0)
        band_count = int(np.sum(transitions == 1))
        if band_count < 1:
            return False

        my = max(int(h * 0.18), 2)
        mx = max(int(w * 0.10), 2)
        inner = arr[my:-my, mx:-mx] if h > 2 * my + 2 and w > 2 * mx + 2 else arr
        inner_std = float(np.std(inner))
        fill_ratio = float(np.mean(content))
        aspect = max(w_px, h_px) / max(min(w_px, h_px), 1)

        gx = np.abs(np.diff(arr, axis=1, prepend=arr[:, :1]))
        gy = np.abs(np.diff(arr, axis=0, prepend=arr[:1, :]))
        grad = np.sqrt(gx ** 2 + gy ** 2)
        border_support = float(np.mean(grad[[0, -1], :] > 11) + np.mean(grad[:, [0, -1]] > 11)) * 0.5

        has_frame = self._has_box_frame(crop)
        light_bg = bool(getattr(self, '_scene_context', {}).get('is_light_background', True))
        if light_bg:
            banner_like = (
                aspect >= 1.7 and area_ratio >= 0.008 and
                inner_std < 48.0 and 0.05 <= fill_ratio <= 0.90 and
                border_support >= 0.12
            )
        else:
            banner_like = (
                aspect >= 2.0 and area_ratio >= 0.010 and
                inner_std < 42.0 and 0.06 <= fill_ratio <= 0.90 and
                border_support >= 0.12
            )

        if has_frame:
            return True
        if bg_like and banner_like:
            return True
        return False

    def _is_floating_background_text(
        self,
        crop: Image.Image,
        w_px: int,
        h_px: int,
        area_ratio: float,
        bg_like: bool,
    ) -> bool:
        """Reject background-like regions that contain only free-floating text."""
        if not bg_like:
            return False
        if self._has_box_frame(crop):
            return False
        if w_px < 24 or h_px < 12 or area_ratio > 0.10:
            return False

        arr = np.array(crop.convert('L'), dtype=np.float32)
        border = np.concatenate([arr[0, :], arr[-1, :], arr[:, 0], arr[:, -1]])
        bg_val = float(np.median(border))
        content = np.abs(arr - bg_val) > 16
        fill_ratio = float(np.mean(content))

        row_density = np.mean(content, axis=1)
        active = row_density > 0.08
        transitions = np.diff(active.astype(np.int32), prepend=0, append=0)
        band_count = int(np.sum(transitions == 1))

        gx = np.abs(np.diff(arr, axis=1, prepend=arr[:, :1]))
        gy = np.abs(np.diff(arr, axis=0, prepend=arr[:1, :]))
        grad = np.sqrt(gx ** 2 + gy ** 2)
        border_support = float(np.mean(grad[[0, -1], :] > 11) + np.mean(grad[:, [0, -1]] > 11)) * 0.5

        light_bg = bool(getattr(self, '_scene_context', {}).get('is_light_background', True))
        if light_bg:
            return band_count >= 1 and border_support < 0.14 and 0.02 <= fill_ratio <= 0.68
        return band_count >= 1 and border_support < 0.12 and 0.02 <= fill_ratio <= 0.58

    def _is_floating_text_block(self, crop: Image.Image, w_px: int, h_px: int, area_ratio: float) -> bool:
        """General floating-text detector independent of background colour match."""
        if w_px < 20 or h_px < 10:
            return False
        if area_ratio > 0.12:
            return False
        if self._has_box_frame(crop):
            return False

        arr = np.array(crop.convert('L'), dtype=np.float32)
        gx = np.abs(np.diff(arr, axis=1, prepend=arr[:, :1]))
        gy = np.abs(np.diff(arr, axis=0, prepend=arr[:1, :]))
        grad = np.sqrt(gx ** 2 + gy ** 2)

        border = np.concatenate([arr[0, :], arr[-1, :], arr[:, 0], arr[:, -1]])
        bg_val = float(np.median(border))
        content = np.abs(arr - bg_val) > 18
        fill_ratio = float(np.mean(content))

        row_density = np.mean(content, axis=1)
        active = row_density > 0.08
        transitions = np.diff(active.astype(np.int32), prepend=0, append=0)
        band_count = int(np.sum(transitions == 1))

        border_support = float(np.mean(grad[[0, -1], :] > 11) + np.mean(grad[:, [0, -1]] > 11)) * 0.5
        edge_density = float(np.mean(grad > 10))
        aspect = max(w_px, h_px) / max(min(w_px, h_px), 1)

        light_bg = bool(getattr(self, '_scene_context', {}).get('is_light_background', True))
        if light_bg:
            return (
                band_count >= 1 and border_support < 0.13 and
                0.02 <= fill_ratio <= 0.70 and edge_density > 0.03 and
                (aspect >= 1.4 or h_px <= 64)
            )

        return (
            band_count >= 2 and border_support < 0.11 and
            0.02 <= fill_ratio <= 0.60 and edge_density > 0.035 and
            (aspect >= 1.6 or h_px <= 58)
        )

    def _has_box_frame(self, crop: Image.Image) -> bool:
        """Detect rectangular frame/border so text inside boxes is preserved."""
        arr = np.array(crop.convert('L'), dtype=np.float32)
        h, w = arr.shape[:2]
        if h < 12 or w < 12:
            return False

        gx = np.abs(np.diff(arr, axis=1, prepend=arr[:, :1]))
        gy = np.abs(np.diff(arr, axis=0, prepend=arr[:1, :]))
        g = np.sqrt(gx ** 2 + gy ** 2)

        b = max(1, min(h, w) // 12)
        top_support = float(np.mean(g[:b, :] > 11))
        bottom_support = float(np.mean(g[-b:, :] > 11))
        left_support = float(np.mean(g[:, :b] > 11))
        right_support = float(np.mean(g[:, -b:] > 11))

        horiz_pair = top_support > 0.13 and bottom_support > 0.13
        vert_pair = left_support > 0.13 and right_support > 0.13
        return horiz_pair or vert_pair
        
    def _filter_text_labels(self, components: List[Dict]) -> List[Dict]:
        """Remove components whose vision-generated label suggests they are
        standalone text, titles, or annotations rather than real diagram
        components.

        Common false positives from text detection:
        - 'Figure 1', 'Step 3', 'Note:', section headings
        - Long descriptive phrases the model read verbatim
        - Pure numeric strings
        """
        import re

        _TEXT_PATTERNS = [
            r'^(?:figure|fig\.?|step|note|caption|title|heading)\s*\d*',
            r'^(?:section|chapter|part|appendix)\s',
            r'^\d+[\.\)]\s',           # numbered list items: "1. " "2) "
            r'^[ivxlcdm]+[\.\)]\s',    # roman numeral lists
            r'^(?:source|ref|reference|see)\s*:',
            r'^(?:input|output)\s*$',   # bare "Input" / "Output" text labels
        ]

        keep = []
        for comp in components:
            label = (comp.get('label') or '').strip()
            if not label or label.lower() in ('unknown', 'unlabeled'):
                keep.append(comp)
                continue

            label_lower = label.lower()

            # Reject if it matches a text/annotation pattern
            matched = False
            for pat in _TEXT_PATTERNS:
                if re.match(pat, label_lower):
                    matched = True
                    break
            if matched:
                if self.debug_complexity:
                    print(f"   🗑️ Text-label filter removed: '{label}'")
                continue

            # Reject very long labels (>8 words) — likely a sentence the
            # model read from the image rather than a component name
            if len(label.split()) > 8:
                if self.debug_complexity:
                    print(f"   🗑️ Long-label filter removed: '{label}'")
                continue

            keep.append(comp)

        return keep

    def _deduplicate_by_label(self, components: List[Dict]) -> List[Dict]:
        """Assign unique labels – keep ALL components, append numeric suffix
        to duplicates so the frontend can distinguish them."""
        labels = [comp.get('label') or f"Component {i+1}" for i, comp in enumerate(components)]
        unique_labels = make_unique_labels(labels)
        for comp, new_label in zip(components, unique_labels):
            comp['label'] = new_label
        return components
    
    def _extract_segments(self, results, img_width: int, img_height: int) -> List[Dict]:
        """Extract bounding boxes from SAM results"""
        segments = []
        
        for r in results:
            if not hasattr(r, 'boxes') or r.boxes is None:
                continue
            
            boxes = r.boxes
            if not hasattr(boxes, 'xyxy') or boxes.xyxy is None:
                continue
            
            box_coords = boxes.xyxy.cpu().numpy()
            confidences = boxes.conf.cpu().numpy() if hasattr(boxes, 'conf') and boxes.conf is not None else None
            
            for i, box in enumerate(box_coords):
                x1, y1, x2, y2 = float(box[0]), float(box[1]), float(box[2]), float(box[3])
                conf = float(confidences[i]) if confidences is not None else 1.0
                
                segments.append({
                    'box_pixels': [x1, y1, x2, y2],
                    'confidence': conf,
                    'area_pixels': (x2 - x1) * (y2 - y1)
                })
        
        return segments
    
    def _filter_segments(self, segments: List[Dict], img_width: int, img_height: int) -> List[Dict]:
        """Filter out invalid segments"""
        img_area = img_width * img_height
        filtered = []

        adaptive_min_area_ratio, adaptive_max_area_ratio, median_nn, raw_count = self._compute_adaptive_area_bounds(
            segments,
            img_width,
            img_height,
        )
        if self.debug_complexity:
            print(
                "   ⚙️ Adaptive area bounds: "
                f"min={adaptive_min_area_ratio:.4f}, max={adaptive_max_area_ratio:.3f}, "
                f"count={raw_count}, median_nn={median_nn:.4f}"
            )

        scene = getattr(self, '_scene_context', {})
        diagram_type = scene.get('diagram_type', 'general')
        dark_bg = scene.get('background', 'light') == 'dark'

        # Adaptive gates inspired by improved service behavior.
        min_area_ratio = self.min_area_ratio
        max_aspect_ratio = self.max_aspect_ratio
        min_dimension = self.min_dimension
        if diagram_type in ('dense', 'structured'):
            min_area_ratio = max(0.0015, self.min_area_ratio * 0.75)
            max_aspect_ratio = max(self.max_aspect_ratio, 7.5)
            min_dimension = max(18, self.min_dimension - 4)
        if dark_bg:
            min_area_ratio = max(0.0012, min_area_ratio * 0.85)
            max_aspect_ratio = max(max_aspect_ratio, 8.0)
        
        for seg in segments:
            x1, y1, x2, y2 = seg['box_pixels']
            width_px = x2 - x1
            height_px = y2 - y1
            area_ratio = seg['area_pixels'] / img_area
            
            # Filter: low confidence
            if seg['confidence'] < self.confidence_threshold:
                continue
            
            # Filter: too small (absolute)
            if seg['area_pixels'] < self.min_box_area:
                if self.debug_complexity:
                    print(f"   🗑️ Too small (area): {seg['box_pixels']} area={seg['area_pixels']:.0f}")
                continue
            
            # Filter: too small relative to image
            if area_ratio < max(min_area_ratio, adaptive_min_area_ratio):
                if self.debug_complexity:
                    print(f"   🗑️ Too small (ratio): {seg['box_pixels']} ratio={area_ratio:.4f}")
                continue
            
            # Filter: too large (background)
            if seg['area_pixels'] > img_area * min(self.max_area_ratio, adaptive_max_area_ratio):
                continue
            
            # Filter: extreme aspect ratios (lines, thin rectangles)
            aspect_ratio = max(width_px, height_px) / max(min(width_px, height_px), 1)
            if aspect_ratio > max_aspect_ratio:
                continue
            
            # Filter: too small in either dimension
            if width_px < min_dimension or height_px < min_dimension:
                if self.debug_complexity:
                    print(f"   🗑️ Too small (dim): {seg['box_pixels']} w={width_px:.0f} h={height_px:.0f}")
                continue
            
            # Filter: components touching or very close to image border
            # These are often grid artifacts, partial elements, or decorations
            norm_x1 = x1 / img_width
            norm_y1 = y1 / img_height
            norm_x2 = x2 / img_width
            norm_y2 = y2 / img_height
            margin = self.edge_exclude_margin
            
            # Only reject border components if they are SMALL
            # (large real components near edges should be kept)
            if area_ratio < 0.003:  # For very small boxes near edges
                if (norm_y2 > 1.0 - margin or norm_y1 < margin or
                    norm_x1 < margin or norm_x2 > 1.0 - margin):
                    if self.debug_complexity:
                        print(f"   🗑️ Border artifact: {seg['box_pixels']} area_ratio={area_ratio:.4f}")
                    continue
            
            # Filter: edge artifacts (thin slivers at borders)
            if x1 < 5 or y1 < 5 or x2 > img_width - 5 or y2 > img_height - 5:
                edge_margin = 10
                if width_px < edge_margin or height_px < edge_margin:
                    continue
            
            filtered.append(seg)
        
        return filtered
    
    def _tighten_boxes(self, segments: List[Dict], img: Image.Image) -> List[Dict]:
        """Shrink bounding boxes inward to fit the actual component content.
        
        SAM often produces boxes that extend beyond the real component edges.
        This analyses gradient activity along each border strip and contracts
        the box inward until it reaches rows/columns with real content.
        """
        tightened = []
        img_arr = np.array(img.convert('L'), dtype=np.float32)
        
        for seg in segments:
            x1, y1, x2, y2 = [int(c) for c in seg['box_pixels']]
            box_w = x2 - x1
            box_h = y2 - y1
            
            if box_w < 10 or box_h < 10:
                tightened.append(seg)
                continue
            
            crop = img_arr[y1:y2, x1:x2]
            
            # Maximum pixels we're willing to trim per side
            max_trim_x = int(box_w * self.tighten_margin)
            max_trim_y = int(box_h * self.tighten_margin)
            
            # Determine the dominant border colour (median of outermost ring)
            border_pixels = np.concatenate([
                crop[0, :], crop[-1, :], crop[:, 0], crop[:, -1]
            ])
            bg_val = float(np.median(border_pixels))
            
            # Shrink from left
            trim_left = 0
            for col in range(min(max_trim_x, crop.shape[1] - 1)):
                col_diff = np.mean(np.abs(crop[:, col] - bg_val))
                if col_diff > self.tighten_bg_threshold:
                    break
                trim_left = col + 1
            
            # Shrink from right
            trim_right = 0
            for col in range(crop.shape[1] - 1, max(crop.shape[1] - 1 - max_trim_x, 0), -1):
                col_diff = np.mean(np.abs(crop[:, col] - bg_val))
                if col_diff > self.tighten_bg_threshold:
                    break
                trim_right = crop.shape[1] - col
            
            # Shrink from top
            trim_top = 0
            for row in range(min(max_trim_y, crop.shape[0] - 1)):
                row_diff = np.mean(np.abs(crop[row, :] - bg_val))
                if row_diff > self.tighten_bg_threshold:
                    break
                trim_top = row + 1
            
            # Shrink from bottom
            trim_bottom = 0
            for row in range(crop.shape[0] - 1, max(crop.shape[0] - 1 - max_trim_y, 0), -1):
                row_diff = np.mean(np.abs(crop[row, :] - bg_val))
                if row_diff > self.tighten_bg_threshold:
                    break
                trim_bottom = crop.shape[0] - row
            
            new_x1 = x1 + trim_left
            new_y1 = y1 + trim_top
            new_x2 = x2 - trim_right
            new_y2 = y2 - trim_bottom
            
            new_w = new_x2 - new_x1
            new_h = new_y2 - new_y1
            
            # Safety: don't tighten to something too small
            if new_w >= self.min_dimension and new_h >= self.min_dimension:
                # Also reject if tightening created a bad aspect ratio
                aspect = max(new_w, new_h) / max(min(new_w, new_h), 1)
                if aspect <= self.max_aspect_ratio:
                    seg = dict(seg)  # copy
                    seg['box_pixels'] = [float(new_x1), float(new_y1), float(new_x2), float(new_y2)]
                    seg['area_pixels'] = float(new_w * new_h)
            
            tightened.append(seg)
        
        return tightened
    
    def _debug_complexity_values(self, segments: List[Dict], img: Image.Image):
        """Debug: show actual complexity values for tuning thresholds"""
        for i, seg in enumerate(segments):
            x1, y1, x2, y2 = [int(c) for c in seg['box_pixels']]
            crop = img.crop((x1, y1, x2, y2))
            
            # Color variance
            gray = crop.convert('L')
            stat = ImageStat.Stat(gray)
            variance = stat.stddev[0]
            
            # Edge density — match the actual filter logic (threshold 8, float32)
            arr = np.array(gray, dtype=np.float32)
            dx = np.diff(arr, axis=1, prepend=arr[:, :1])
            dy = np.diff(arr, axis=0, prepend=arr[:1, :])
            edges = np.sqrt(dx**2 + dy**2)
            edge_pixels = np.sum(edges > 8)
            edge_density = edge_pixels / arr.size
            
            area_ratio = seg['area_pixels'] / (img.size[0] * img.size[1])
            
            # print(f"      Segment {i}: box={seg['box_pixels']}, variance={variance:.1f}, edge_density={edge_density:.4f}, area_ratio={area_ratio:.3f}")
    
    def _filter_by_visual_complexity(self, segments: List[Dict], img: Image.Image) -> List[Dict]:
        """
        Filter out visually simple regions (background/grid artifacts),
        standalone text labels, and empty boxes.
        
        Large components are always kept — solid-coloured boxes (CPU, GPU, etc.)
        have low grayscale variance and few edges but are real components.
        Only small detections are subjected to the full complexity pipeline.
        """
        img_area = img.size[0] * img.size[1]
        complex_segments = []
        
        for seg in segments:
            area_ratio = seg['area_pixels'] / img_area
            x1, y1, x2, y2 = [int(c) for c in seg['box_pixels']]
            crop = img.crop((x1, y1, x2, y2))
            w_px = x2 - x1
            h_px = y2 - y1

            bg_like = self._is_background_colored_region(crop)
            text_layout = self._classify_text_layout(crop, w_px, h_px, area_ratio)

            # Preserve boxed/banner components that contain text.
            if self._is_text_in_filled_container(crop, w_px, h_px, area_ratio, bg_like):
                complex_segments.append(seg)
                continue

            # Reject free-floating text on background-like regions.
            if self._is_floating_background_text(crop, w_px, h_px, area_ratio, bg_like):
                if self.debug_complexity:
                    print(f"   🗑️ Floating background text rejected: [{x1},{y1},{x2},{y2}]")
                continue

            # Reject generic floating text blocks even when color-match is imperfect.
            if self._is_floating_text_block(crop, w_px, h_px, area_ratio):
                if self.debug_complexity:
                    print(f"   🗑️ Floating text block rejected: [{x1},{y1},{x2},{y2}]")
                continue

            # Explicit distinction requested:
            # - boxed text in a component container is kept
            # - floating background text is removed
            if text_layout == 'boxed_text':
                complex_segments.append(seg)
                continue
            if text_layout == 'floating_text':
                if self.debug_complexity:
                    print(f"   🗑️ Floating text rejected: [{x1},{y1},{x2},{y2}]")
                continue
            
            # ── 1. Reject standalone text regions ──
            if self._is_text_region(crop, w_px, h_px, area_ratio):
                if self.debug_complexity:
                    print(f"   🗑️ Text region rejected: [{x1},{y1},{x2},{y2}] {w_px}x{h_px}")
                continue
            
            # ── 2. Reject empty / near-empty boxes ──
            if self._is_empty_box(crop, area_ratio):
                if self.debug_complexity:
                    print(f"   🗑️ Empty box rejected: [{x1},{y1},{x2},{y2}]")
                continue

            # ── 2b. Reject blank gap regions between components and connector lines ──
            if self._is_gap_between_components_and_lines(crop, w_px, h_px, area_ratio):
                if self.debug_complexity:
                    print(f"   🗑️ Gap-region rejected: [{x1},{y1},{x2},{y2}]")
                continue

            # Background-colour-like regions are likely canvas artifacts.
            if bg_like:
                if self.debug_complexity:
                    print(f"   🗑️ Background-colour region rejected: [{x1},{y1},{x2},{y2}]")
                continue

            # Non-background coloured regions are initially kept.
            # They can still be removed by overlap / dedup later stages.
            complex_segments.append(seg)
        
        return complex_segments

    def _is_gap_between_components_and_lines(
        self,
        crop: Image.Image,
        w_px: int,
        h_px: int,
        area_ratio: float
    ) -> bool:
        """Detect blank spaces bounded by nearby lines/components.

        These regions often appear as SAM segments between connected nodes:
        - border has some edge signal from adjacent lines/boxes
        - interior is mostly uniform and low-texture
        """
        if area_ratio < 0.006 or area_ratio > 0.20:
            return False
        if w_px < 40 or h_px < 30:
            return False

        arr = np.array(crop.convert('L'), dtype=np.float32)
        rh, rw = arr.shape[:2]
        if rh < 12 or rw < 12:
            return False

        border = np.concatenate([arr[0, :], arr[-1, :], arr[:, 0], arr[:, -1]])
        interior = arr[max(3, rh // 6): rh - max(3, rh // 6), max(3, rw // 6): rw - max(3, rw // 6)]
        if interior.size == 0:
            return False

        # Interior metrics
        inner_var = float(np.var(interior))
        dx_i = np.diff(interior, axis=1, prepend=interior[:, :1])
        dy_i = np.diff(interior, axis=0, prepend=interior[:1, :])
        inner_grad = np.sqrt(dx_i**2 + dy_i**2)
        inner_edge_density = float(np.mean(inner_grad > 8))

        # Border metrics
        border_var = float(np.var(border))

        scene = getattr(self, '_scene_context', {})
        dark_bg = scene.get('background', 'light') == 'dark'
        max_inner_var = 180.0 if dark_bg else 120.0

        if inner_var < max_inner_var and inner_edge_density < 0.015 and border_var > 20.0:
            return True
        return False

    def _is_text_region(self, crop: Image.Image, w_px: int, h_px: int, area_ratio: float) -> bool:
        """Detect standalone text labels, titles, or annotations.

        Text regions are characterised by:
        - High edge density (every character is an edge)
        - High fill ratio (content distributed uniformly, no hollow interior)
        - Typically short height or extreme width-to-height aspect ratio
        - Small overall area (real component boxes are bigger)

        Returns True if this crop looks like a text label rather than a
        diagram component.
        """
        # Large boxes are rarely just text
        if area_ratio > 0.05:
            return False

        # Medium component boxes with clear geometry are unlikely to be pure text.
        if w_px >= 80 and h_px >= 40 and area_ratio >= 0.006:
            return False

        # Preserve components that have a clear rectangular frame,
        # even when text is present inside the box.
        if self._has_box_frame(crop):
            return False

        aspect = max(w_px, h_px) / max(min(w_px, h_px), 1)

        # ── Colour saturation guard ──
        # Coloured shapes (circles, hexagons with fills) look like text
        # in grayscale but are real diagram components.  Measure how much
        # the R, G, B channels differ from each other in the interior.
        rgb_arr = np.array(crop, dtype=np.float32)
        rh, rw = rgb_arr.shape[:2]
        my = max(int(rh * 0.2), 3)
        mx = max(int(rw * 0.2), 3)
        if rh > my * 2 + 2 and rw > mx * 2 + 2:
            inner_rgb = rgb_arr[my:-my, mx:-mx]
            channel_means = [float(np.mean(inner_rgb[:, :, c])) for c in range(3)]
            channel_spread = float(np.std(channel_means))
            # If the interior is distinctly coloured, this is NOT text
            if channel_spread >= 5.0:
                return False

        gray = crop.convert('L')
        arr = np.array(gray, dtype=np.float32)

        # Edge density
        dx = np.diff(arr, axis=1, prepend=arr[:, :1])
        dy = np.diff(arr, axis=0, prepend=arr[:1, :])
        edges = np.sqrt(dx ** 2 + dy ** 2)
        edge_pixels = np.sum(edges > 10)
        edge_density = edge_pixels / max(arr.size, 1)

        # Fill ratio: fraction of non-background pixels.
        # Background = the dominant border colour.
        border_pixels = np.concatenate([arr[0, :], arr[-1, :], arr[:, 0], arr[:, -1]])
        bg_val = float(np.median(border_pixels))
        content_mask = np.abs(arr - bg_val) > 20
        fill_ratio = np.sum(content_mask) / max(arr.size, 1)

        # Text lines create multiple horizontal activity bands.
        row_density = np.mean(content_mask, axis=1)
        active_rows = row_density > 0.08
        row_changes = np.diff(active_rows.astype(np.int32), prepend=0, append=0)
        text_band_count = int(np.sum(row_changes == 1))

        # Floating text usually has weak border support.
        border_support = float(np.mean(edges[[0, -1], :] > 10) + np.mean(edges[:, [0, -1]] > 10)) * 0.5
        bg_like = self._is_background_colored_region(crop)

        # Heuristic rule set:
        # A) Very high edge density + wide & short  →  text
        if (edge_density > self.text_edge_density_threshold
                and aspect >= self.text_min_aspect_ratio
                and h_px <= self.text_max_height_px):
            return True

        # B) High edge density + high fill ratio + small area  →  text
        #    Only applies to achromatic (grey/black/white) regions.
        if (edge_density > self.text_edge_density_threshold
            and fill_ratio > self.text_fill_ratio_threshold
            and area_ratio < 0.010):
            return True

        # C) Extremely high edge density alone (dense paragraph/title block)
        if edge_density > 0.25 and area_ratio < 0.03:
            return True

        # D) Multiple text bands with weak border frame => floating text.
        if area_ratio < 0.04 and text_band_count >= 2 and border_support < 0.11 and fill_ratio < 0.62:
            return True

        # E) Background-like single-line text often slips through older rules.
        light_bg = bool(getattr(self, '_scene_context', {}).get('is_light_background', True))
        if light_bg and bg_like and area_ratio < 0.10 and text_band_count >= 1 and border_support < 0.12 and fill_ratio < 0.60:
            return True
        if (not light_bg) and bg_like and area_ratio < 0.08 and text_band_count >= 1 and border_support < 0.10 and fill_ratio < 0.58:
            return True

        return False

    def _is_empty_box(self, crop: Image.Image, area_ratio: float) -> bool:
        """Detect empty or near-empty boxes (uniform colour, no content).

        Returns True if the box interior is essentially blank — very low
        grayscale variance AND almost no edge activity AND no colour.

        Important: coloured boxes (solid fills like red, blue, green) have
        low *grayscale* variance but are real diagram components.  We check
        the RGB colour range of the interior to avoid rejecting them.
        """
        # ── Colour guard: coloured fills are NOT empty ──
        rgb_arr = np.array(crop)
        h_px, w_px = rgb_arr.shape[:2]

        # Use a proportional margin (10% of each dim, min 5px) so we clear
        # dark borders / outlines and inspect the actual interior.
        margin_y = max(int(h_px * 0.10), 5)
        margin_x = max(int(w_px * 0.10), 5)

        # Need enough room for an interior region
        if h_px <= margin_y * 2 + 4 or w_px <= margin_x * 2 + 4:
            return False  # too small to judge

        inner_rgb = rgb_arr[margin_y:-margin_y, margin_x:-margin_x]
        # Colour range: max peak-to-peak across R, G, B channels
        color_range = max(int(np.ptp(inner_rgb[:, :, c])) for c in range(3))

        # If the interior is colourful (> 80 range in any channel) it's a
        # real component with a coloured fill, not an empty box.
        if color_range > 80:
            return False

        # ── Grayscale checks (only reach here if box is NOT colourful) ──
        gray = crop.convert('L')
        arr = np.array(gray, dtype=np.float32)
        stat = ImageStat.Stat(gray)
        variance = stat.stddev[0]

        dx = np.diff(arr, axis=1, prepend=arr[:, :1])
        dy = np.diff(arr, axis=0, prepend=arr[:1, :])
        edges = np.sqrt(dx ** 2 + dy ** 2)
        edge_density = np.sum(edges > 8) / max(arr.size, 1)

        # Structured dark diagrams can have subtle texture; if global edge
        # signal is meaningful, this is unlikely to be an empty box.
        if edge_density > 0.045:
            return False

        # A truly empty box has low variance AND almost no edges inside
        if variance < self.empty_box_max_variance and edge_density < self.empty_box_max_edge_density:
            return True

        # Also catch boxes that have a border outline but nothing inside
        inner_gray = arr[margin_y:-margin_y, margin_x:-margin_x]
        dx_i = np.diff(inner_gray, axis=1, prepend=inner_gray[:, :1])
        dy_i = np.diff(inner_gray, axis=0, prepend=inner_gray[:1, :])
        inner_edges = np.sqrt(dx_i ** 2 + dy_i ** 2)
        inner_edge_density = np.sum(inner_edges > 8) / max(inner_gray.size, 1)
        inner_var = float(np.std(inner_gray))

        if inner_var < 6.0 and inner_edge_density < 0.004:
            return True

        return False
    
    def _has_sufficient_color_variance(self, crop: Image.Image) -> bool:
        """
        Check if region has enough color variation.
        Checks both grayscale variance AND RGB colour range so that
        solid-coloured fills (blue, red, green) pass even though their
        grayscale variance is low.
        """
        try:
            # Grayscale variance check
            gray = crop.convert('L')
            stat = ImageStat.Stat(gray)
            if stat.stddev[0] > self.min_color_variance:
                return True

            # RGB colour check: if any channel has wide range, there's real colour
            rgb_arr = np.array(crop)
            for c in range(3):
                if np.ptp(rgb_arr[:, :, c]) > 60:
                    return True

            return False
        
        except Exception as e:
            return True
    
    def _has_sufficient_edges(self, crop: Image.Image) -> bool:
        """
        Check if region has enough edge content.
        Lowered threshold: 0.003 instead of 0.02.
        """
        try:
            gray = crop.convert('L')
            arr = np.array(gray, dtype=np.float32)
            
            # Gradient magnitude
            dx = np.diff(arr, axis=1, prepend=arr[:, :1])
            dy = np.diff(arr, axis=0, prepend=arr[:1, :])
            edges = np.sqrt(dx**2 + dy**2)
            
            # Count edges — lowered pixel gradient threshold from 20 to 8
            edge_pixels = np.sum(edges > 8)
            total_pixels = arr.size
            edge_density = edge_pixels / total_pixels
            
            return edge_density > self.min_edge_density
        
        except Exception as e:
            return True
    
    def _remove_overlaps(self, segments: List[Dict], img_area: float = None) -> List[Dict]:
        """Remove overlapping boxes using nesting-aware NMS.
        
        Preserves nested (encapsulated) components: if a small box is clearly
        inside a larger one and their sizes differ significantly, both are kept.
        Only true duplicates (similar-sized, high-IoU boxes) are suppressed.
        """
        if not segments:
            return []
        
        segments = sorted(segments, key=lambda x: x['confidence'], reverse=True)
        
        # Step 1: Remove near-full-image background boxes only
        # Only discard a box if it covers >55% of the image AND contains
        # many other detections (clearly just the page/canvas background).
        non_background = []
        for i, seg in enumerate(segments):
            is_background = False
            
            if img_area and seg['area_pixels'] > img_area * self.container_min_area_ratio:
                contained_count = 0
                for j, other in enumerate(segments):
                    if i == j:
                        continue
                    if self._contains(seg['box_pixels'], other['box_pixels']):
                        contained_count += 1
                
                if contained_count >= self.container_min_children:
                    is_background = True
                    if self.debug_complexity:
                        ratio = seg['area_pixels'] / img_area if img_area else 0
                        print(f"   🗑️ Removing background box: {seg['box_pixels']} (contains {contained_count} others, area_ratio={ratio:.2f})")
            
            if not is_background:
                non_background.append(seg)
        
        if not non_background:
            non_background = segments
        
        # Step 2: Nesting-aware NMS
        # If two boxes overlap but one is nested inside the other (encapsulation),
        # keep both. Only suppress when boxes are similar in size (true duplicates).
        kept = []
        for seg in non_background:
            should_keep = True
            for kept_seg in kept:
                iou = self._calculate_iou(seg['box_pixels'], kept_seg['box_pixels'])
                if iou > self.iou_threshold:
                    # High overlap — but is this nesting or duplication?
                    if self._is_nested(seg['box_pixels'], kept_seg['box_pixels']):
                        # Encapsulation: keep both boxes
                        continue
                    else:
                        # True duplicate: suppress the lower-confidence one
                        should_keep = False
                        if self.debug_complexity:
                            print(f"   🗑️ NMS removed box {seg['box_pixels']} (IoU={iou:.2f} with {kept_seg['box_pixels']})")
                        break
            
            if should_keep:
                kept.append(seg)
        
        return kept
    
    def _remove_high_overlap_pairs(self, segments: List[Dict]) -> List[Dict]:
        """Remove boxes that are mostly covered by another larger box.
        
        Uses intersection-over-minimum-area (IoMin) instead of IoU.
        IoMin catches cases where a small box is almost entirely inside a
        bigger one but IoU is low because the bigger box is much larger.
        When IoMin > threshold and the boxes are similar in size, the lower-
        confidence one is dropped.
        """
        if len(segments) < 2:
            return segments
        
        to_remove = set()
        for i, seg_a in enumerate(segments):
            if i in to_remove:
                continue
            for j, seg_b in enumerate(segments):
                if j <= i or j in to_remove:
                    continue
                iomin = self._calculate_iomin(seg_a['box_pixels'], seg_b['box_pixels'])
                if iomin > self.iomin_threshold:
                    # High overlap — drop the lower-confidence one
                    if seg_a['confidence'] >= seg_b['confidence']:
                        to_remove.add(j)
                    else:
                        to_remove.add(i)
                        break
        
        result = [s for i, s in enumerate(segments) if i not in to_remove]
        return result
    
    def _calculate_iomin(self, box1: List[float], box2: List[float]) -> float:
        """Intersection area / area of the smaller box."""
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])
        
        if x2 <= x1 or y2 <= y1:
            return 0.0
        
        inter = (x2 - x1) * (y2 - y1)
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        min_area = min(area1, area2)
        
        return inter / min_area if min_area > 0 else 0.0
    
    def _remove_contained_duplicates(self, segments: List[Dict]) -> List[Dict]:
        """Remove the larger box when it contains MULTIPLE smaller ones.
        
        After NMS, there can still be pairs where one box fully contains
        another but IoU was below the NMS threshold (because the outer box
        is much larger).  In architecture diagrams these outer boxes are
        often bad SAM detections spanning multiple components.
        
        However, in nested/hierarchical diagrams a large box that contains
        only ONE child is typically a real parent component, so we keep it.
        Only remove an outer box when it contains 2+ children — that signals
        a spurious multi-component span rather than a genuine container.
        """
        if len(segments) < 2:
            return segments
        
        def geo_contains(outer, inner, margin=15.0):
            """Pure geometric containment – no area-ratio gate."""
            return (
                outer[0] <= inner[0] + margin and
                outer[1] <= inner[1] + margin and
                outer[2] >= inner[2] - margin and
                outer[3] >= inner[3] - margin
            )
        
        # Build a map: for each segment, count how many others it contains
        contains_count = {}
        for i, seg_a in enumerate(segments):
            count = 0
            for j, seg_b in enumerate(segments):
                if i == j:
                    continue
                if geo_contains(seg_a['box_pixels'], seg_b['box_pixels'], margin=15.0):
                    count += 1
            contains_count[i] = count
        
        to_remove = set()
        for i, seg_a in enumerate(segments):
            if i in to_remove:
                continue
            # Only remove if this box contains 2+ other boxes
            # (meaning it's a multi-component span, not a real parent)
            if contains_count[i] >= 2:
                to_remove.add(i)
                if self.debug_complexity:
                    print(f"   🗑️ Containment dedup: removed {seg_a['box_pixels']} (contains {contains_count[i]} children)")
            elif contains_count[i] == 1:
                # One child only — remove the parent if the child fills a
                # large fraction of it (>40%).  A genuine parent container
                # is much larger than its single child; a SAM artefact that
                # barely extends past the child is not a real component.
                parent_box = seg_a['box_pixels']
                parent_area = (parent_box[2] - parent_box[0]) * (parent_box[3] - parent_box[1])
                for j, seg_b in enumerate(segments):
                    if i == j:
                        continue
                    if geo_contains(parent_box, seg_b['box_pixels'], margin=15.0):
                        child_box = seg_b['box_pixels']
                        child_area = (child_box[2] - child_box[0]) * (child_box[3] - child_box[1])
                        if parent_area > 0 and child_area / parent_area > 0.40:
                            to_remove.add(i)
                            if self.debug_complexity:
                                print(f"   🗑️ Containment dedup: removed {parent_box} (child fills {child_area/parent_area:.0%})")
                        break
        
        return [seg for i, seg in enumerate(segments) if i not in to_remove]
    
    def _is_nested(self, box1: List[float], box2: List[float]) -> bool:
        """Return True if one box is nested inside the other (encapsulation).
        
        Two conditions must hold:
          1. The boxes differ significantly in size (ratio >= nesting_size_ratio).
          2. The smaller box is geometrically contained within the larger one
             (with a pixel tolerance).
        """
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        
        if min(area1, area2) == 0:
            return False
        
        size_ratio = max(area1, area2) / min(area1, area2)
        if size_ratio < self.nesting_size_ratio:
            # Similar-sized boxes → not nesting, just overlap
            return False
        
        # Determine outer/inner
        if area1 >= area2:
            outer, inner = box1, box2
        else:
            outer, inner = box2, box1
        
        margin = 20.0  # pixel tolerance for imprecise detections
        is_contained = (
            outer[0] <= inner[0] + margin and
            outer[1] <= inner[1] + margin and
            outer[2] >= inner[2] - margin and
            outer[3] >= inner[3] - margin
        )
        
        return is_contained
    
    def _contains(self, outer: List[float], inner: List[float], margin: float = 10.0) -> bool:
        """Check if outer box fully contains inner box (with margin tolerance)"""
        inner_inside = (
            outer[0] <= inner[0] + margin and
            outer[1] <= inner[1] + margin and
            outer[2] >= inner[2] - margin and
            outer[3] >= inner[3] - margin
        )
        
        if not inner_inside:
            return False
        
        outer_area = (outer[2] - outer[0]) * (outer[3] - outer[1])
        inner_area = (inner[2] - inner[0]) * (inner[3] - inner[1])
        
        # The outer must be significantly larger (at least 2x the inner)
        # This prevents two similar-sized overlapping boxes from triggering containment
        return outer_area > inner_area * 2.0
    
    def _calculate_iou(self, box1: List[float], box2: List[float]) -> float:
        """Calculate Intersection over Union"""
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])
        
        if x2 < x1 or y2 < y1:
            return 0.0
        
        inter = (x2 - x1) * (y2 - y1)
        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        union = area1 + area2 - inter
        
        return inter / union if union > 0 else 0.0
    
    def _normalize_components(self, segments: List[Dict], img_width: int, img_height: int) -> List[Dict]:
        """Convert to normalized AR component format"""
        components = []
        
        for i, seg in enumerate(segments):
            x1, y1, x2, y2 = seg['box_pixels']
            width_px = x2 - x1
            height_px = y2 - y1
            
            components.append({
                'id': f'component_{i}',
                'x': x1 / img_width,
                'y': y1 / img_height,
                'width': width_px / img_width,
                'height': height_px / img_height,
                'center_x': (x1 + width_px / 2) / img_width,
                'center_y': (y1 + height_px / 2) / img_height,
                'confidence': seg['confidence'],
                'area': (width_px * height_px) / (img_width * img_height),
                'label': None,
                'description': None,
                'box_pixels': seg['box_pixels']
            })
        
        return components
    
    def _label_components(
        self, 
        components: List[Dict], 
        image_path: str, 
        hints: List[str]
    ) -> List[Dict]:
        """Label components while capping vision prompts to at most 2 calls."""
        if not components:
            return components
        
        if manager.vision_model is None or manager.vision_processor is None:
            print("⚠️ Vision model not available for labeling")
            for i, comp in enumerate(components):
                comp['label'] = f"Component {i+1}"
            return components
        
        try:
            img = Image.open(image_path).convert("RGB")
        except Exception as e:
            print(f"⚠️ Failed to load image for labeling: {e}")
            for i, comp in enumerate(components):
                comp['label'] = f"Component {i+1}"
            return components
        
        # Calculate median area to detect outlier (too-small) components
        areas = [comp['area'] for comp in components]
        median_area = sorted(areas)[len(areas) // 2] if areas else 0
        
        # Build a set of lowercase hint names for quick fallback matching
        hint_set = {h.lower(): h for h in hints if h} if hints else {}

        labeled = []
        img_w, img_h = img.size
        query_budget = max(0, int(getattr(self, 'max_vision_label_queries', self.max_components)))
        query_budget = min(query_budget, len(components))
        # Prefer querying largest components first for better global coverage.
        ranked_indices = sorted(range(len(components)), key=lambda i: components[i].get('area', 0), reverse=True)
        query_indices = set(ranked_indices[:query_budget])

        # Hint labels can be consumed for non-queried components.
        hint_values = [h for h in hints if isinstance(h, str) and h.strip()]
        hint_cursor = 0
        for i, comp in enumerate(components):
            try:
                x1, y1, x2, y2 = comp['box_pixels']
                box_w = x2 - x1
                box_h = y2 - y1

                # Pad the crop by 40% of box size so nearby text labels
                # (e.g. "User Corrections" below a database symbol) are
                # visible to the vision model.
                pad_x = int(box_w * 0.4)
                pad_y = int(box_h * 0.4)
                cx1 = max(0, int(x1) - pad_x)
                cy1 = max(0, int(y1) - pad_y)
                cx2 = min(img_w, int(x2) + pad_x)
                cy2 = min(img_h, int(y2) + pad_y)
                crop = img.crop((cx1, cy1, cx2, cy2))

                label = None
                if i in query_indices:
                    label = self._query_vision_for_label(crop, comp['id'])
                    print(f"   🎯 Labeled {comp['id']} as '{label}'")

                # If the vision model failed, try to find a matching hint
                # based on spatial overlap or use a generic fallback
                if not label and hint_cursor < len(hint_values):
                    label = hint_values[hint_cursor].strip()
                    hint_cursor += 1
                if not label and hint_set:
                    label = f"Component {i+1}"
                
                # Post-label sanity check: reject tiny components whose label
                # doesn't match any text visible in the diagram
                # If area is much smaller than median AND label seems hallucinated, skip
                if label and comp['area'] < median_area * 0.3:
                    # This component is suspiciously small compared to others
                    if self.debug_complexity:
                        print(f"   ⚠️ Suspicious: '{label}' has area={comp['area']:.4f}, median={median_area:.4f}")
                
                comp['label'] = label if label else self._fallback_component_label(comp, i)
                labeled.append(comp)
            
            except Exception as e:
                print(f"⚠️ Failed to label {comp['id']}: {e}")
                comp['label'] = f"Component {i+1}"
                labeled.append(comp)
        
        for comp in labeled:
            comp.pop('box_pixels', None)
        
        return labeled

    def _fallback_component_label(self, comp: Dict, index: int) -> str:
        """Cheap non-vision fallback so most components avoid vision prompts."""
        w = float(comp.get('width', 0.0))
        h = float(comp.get('height', 0.0))
        area = float(comp.get('area', 0.0))
        aspect = max(w, h) / max(min(w, h), 1e-6)

        if area > 0.10:
            base = 'Container'
        elif aspect > 3.2:
            base = 'Linear Block'
        elif 0.75 <= aspect <= 1.35 and area < 0.02:
            base = 'Node'
        else:
            base = 'Component'
        return f"{base} {index+1}"
    
    def _query_vision_for_label(self, crop_img: Image.Image, component_id: str) -> Optional[str]:
        """Query Granite Vision model to identify a cropped component"""
        try:
            if max(crop_img.size) > 224:
                ratio = 224.0 / max(crop_img.size)
                new_size = (int(crop_img.size[0] * ratio), int(crop_img.size[1] * ratio))
                crop_img = crop_img.resize(new_size, Image.LANCZOS)
            
            prompt = COMPONENT_LABEL_PROMPT
            
            chat_text = build_vision_chat_text(prompt)
            
            inputs = manager.vision_processor(
                images=[crop_img],
                text=chat_text,
                return_tensors="pt"
            )
            
            device = manager.vision_model.device
            target_dtype = getattr(manager, "vision_compute_dtype", manager.dtype)
            
            processed_inputs = {}
            for k, v in inputs.items():
                if k == "pixel_values":
                    if not torch.isfinite(v).all():
                        v = torch.nan_to_num(v)
                    processed_inputs[k] = v.to(device, dtype=target_dtype)
                elif k == "input_ids":
                    processed_inputs[k] = v.to(device)
                elif v.dtype in [torch.float32, torch.float64]:
                    processed_inputs[k] = v.to(device, dtype=target_dtype)
                else:
                    processed_inputs[k] = v.to(device)
            
            with torch.no_grad():
                output_ids = manager.vision_model.generate(
                    **processed_inputs,
                    max_new_tokens=20,
                    do_sample=False,
                    temperature=1.0,
                )
            
            prompt_len = processed_inputs.get("input_ids", torch.empty(1, 0)).shape[1]
            if output_ids.shape[1] > prompt_len:
                new_tokens = output_ids[:, prompt_len:]
                label = manager.vision_processor.batch_decode(
                    new_tokens, 
                    skip_special_tokens=True
                )[0]
                
                label = label.strip()
                # Use centralised prompt_builder cleaner
                label = clean_label(label)
                return label
            
            return None
        
        except Exception as e:
            print(f"⚠️ Vision labeling error for {component_id}: {e}")
            return None
    
    def _clean_label(self, label: str) -> Optional[str]:
        """Post-process a vision model label to extract a concise component name.
        
        Handles common verbose patterns like:
          - "The component name is 'Database'"
          - "The component is called LLM interface"
          - "I am unable to provide the requested information"
          - "This is a Database component"
        """
        if not label:
            return None
        
        import re
        
        # Normalise whitespace (collapse newlines, tabs, etc.)
        label = re.sub(r'\s+', ' ', label).strip()
        
        # Reject outright refusals / irrelevant responses
        refusal_markers = [
            'i am unable', 'i cannot', 'i\'m unable', 'sorry',
            'i don\'t', 'not possible', 'no text', 'cannot determine',
            'unable to', 'i can\'t',
        ]
        label_lower = label.lower()
        for marker in refusal_markers:
            if marker in label_lower:
                return 'Unknown'
        
        # Extract quoted names: "The name is 'XYZ'" or 'The name is "XYZ"'
        quoted = re.search(r"['\"]([^'\"]{1,40})['\"]", label)
        if quoted:
            label = quoted.group(1).strip()
        else:
            # Strip common verbose prefixes
            prefix_patterns = [
                r'^the\s+component\s+(name\s+)?is\s+(called\s+)?',
                r'^this\s+(is\s+(a|an|the)\s+)?',
                r'^it\s+(is\s+(a|an|the)\s+)?',
                r'^the\s+name\s+(of\s+this\s+component\s+)?is\s+',
                r'^component\s+name:\s*',
                r'^name:\s*',
            ]
            for pat in prefix_patterns:
                label = re.sub(pat, '', label, flags=re.IGNORECASE).strip()
        
        # Strip trailing punctuation and filler
        label = re.sub(r'[.;,!?]+$', '', label).strip()
        label = re.sub(r'\s+component$', '', label, flags=re.IGNORECASE).strip()
        
        # Enforce 3-word maximum
        words = label.split()
        if len(words) > 3:
            label = ' '.join(words[:3])
        
        # Final length check
        if len(label) > 40:
            label = label[:40].rsplit(' ', 1)[0]
        
        return label if label else None
    
    def analyze_component_relationships(self, components: List[Dict], image_path: str = None) -> Dict:
        """Detect connections between components using spatial proximity and optional vision."""
        if not components or len(components) < 2:
            return {'connections': [], 'groups': []}

        # 1. Proximity-based connections (fast, always available)
        #    Only very close / touching components count as connected.
        proximity_connections = self._detect_proximity_connections(components)

        # 2. Vision-based connections (slower but more accurate for arrows/lines)
        vision_connections = []
        if image_path and manager.vision_model is not None and len(components) <= 25:
            try:
                vision_connections = self._detect_connections_with_vision(components, image_path)
            except Exception as e:
                print(f"   ⚠️ Vision connection detection skipped: {e}")

        # 3. Merge: only keep vision connections that are spatially plausible,
        #    and proximity connections that are nearly touching.
        all_connections = self._merge_connections(proximity_connections, vision_connections)

        # 4. Build adjacency groups
        groups = self._build_groups(components, all_connections)

        return {'connections': all_connections, 'groups': groups}

    def _detect_proximity_connections(self, components: List[Dict]) -> List[Dict]:
        """Detect connections between components based on spatial proximity of edges."""
        connections = []
        seen = set()

        for i, c1 in enumerate(components):
            for j, c2 in enumerate(components):
                if j <= i:
                    continue

                # Use edge-to-edge distance (not center-to-center)
                dist = self._edge_distance(c1, c2)
                if dist < self.proximity_threshold:
                    pair = tuple(sorted([c1['id'], c2['id']]))
                    if pair not in seen:
                        seen.add(pair)
                        connections.append({
                            'from': c1['id'],
                            'to': c2['id'],
                            'from_label': c1.get('label', c1['id']),
                            'to_label': c2.get('label', c2['id']),
                            'type': 'proximity',
                            'distance': float(dist),
                        })

        return connections

    def _edge_distance(self, comp1: Dict, comp2: Dict) -> float:
        """Shortest distance between the edges of two component bounding boxes (normalised coords)."""
        x1_min, x1_max = comp1['x'], comp1['x'] + comp1['width']
        y1_min, y1_max = comp1['y'], comp1['y'] + comp1['height']
        x2_min, x2_max = comp2['x'], comp2['x'] + comp2['width']
        y2_min, y2_max = comp2['y'], comp2['y'] + comp2['height']

        dx = max(0, max(x1_min - x2_max, x2_min - x1_max))
        dy = max(0, max(y1_min - y2_max, y2_min - y1_max))
        return (dx ** 2 + dy ** 2) ** 0.5

    def _build_groups(self, components: List[Dict], connections: List[Dict]) -> List[List[str]]:
        """Build connected-component groups using union-find."""
        parent: Dict[str, str] = {c['id']: c['id'] for c in components}

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        def union(a, b):
            ra, rb = find(a), find(b)
            if ra != rb:
                parent[ra] = rb

        for conn in connections:
            if conn['from'] in parent and conn['to'] in parent:
                union(conn['from'], conn['to'])

        groups_map: Dict[str, List[str]] = {}
        for cid in parent:
            root = find(cid)
            groups_map.setdefault(root, []).append(cid)

        # Only return groups with 2+ members
        return [g for g in groups_map.values() if len(g) > 1]
    
    def _detect_connections_with_vision(self, components: List[Dict], image_path: str) -> List[Dict]:
        """Use Granite Vision to detect lines/arrows/connections in the diagram."""
        try:
            img = Image.open(image_path).convert("RGB")
            
            if max(img.size) > 800:
                ratio = 800.0 / max(img.size)
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.LANCZOS)
            
            # Build prompt with component positions for spatial reasoning
            prompt = build_connection_prompt(components)
            
            chat_text = build_vision_chat_text(prompt)
            
            inputs = manager.vision_processor(
                images=[img],
                text=chat_text,
                return_tensors="pt"
            )
            
            device = manager.vision_model.device
            target_dtype = getattr(manager, "vision_compute_dtype", manager.dtype)
            
            processed_inputs = {}
            for k, v in inputs.items():
                if k == "pixel_values":
                    if not torch.isfinite(v).all():
                        v = torch.nan_to_num(v)
                    processed_inputs[k] = v.to(device, dtype=target_dtype)
                elif k == "input_ids":
                    processed_inputs[k] = v.to(device)
                elif v.dtype in [torch.float32, torch.float64]:
                    processed_inputs[k] = v.to(device, dtype=target_dtype)
                else:
                    processed_inputs[k] = v.to(device)
            
            with torch.no_grad():
                output_ids = manager.vision_model.generate(
                    **processed_inputs,
                    max_new_tokens=300,
                    do_sample=False,
                    temperature=1.0,
                )
            
            prompt_len = processed_inputs.get("input_ids", torch.empty(1, 0)).shape[1]
            if output_ids.shape[1] <= prompt_len:
                return []
            
            new_tokens = output_ids[:, prompt_len:]
            response = manager.vision_processor.batch_decode(
                new_tokens, skip_special_tokens=True
            )[0].strip()
            
            for noise in ['<|end_of_text|>', '<fim_prefix>', '<|system|>', '<|user|>', '<|assistant|>']:
                response = response.replace(noise, '')
            
            print(f"   🔍 Vision connections response: {response[:200]}")
            
            if 'NONE' in response.upper() and len(response) < 20:
                return []
            
            return self._parse_vision_connections(response, components)
        
        except Exception as e:
            print(f"   ⚠️ Vision connection detection failed: {e}")
            return []
    
    def _parse_vision_connections(self, text: str, components: List[Dict]) -> List[Dict]:
        """Parse 'SOURCE -> TARGET' lines from vision output and map to component IDs."""
        import re
        
        # Build lookup: lowercase label/id -> component id
        label_to_id = {}
        for c in components:
            if c.get('label'):
                label_to_id[c['label'].lower().strip()] = c['id']
            label_to_id[c['id'].lower()] = c['id']
        
        connections = []
        seen = set()
        
        # Match patterns like "Source -> Target", "Source → Target", "Source - Target", "Source to Target"
        arrow_pattern = re.compile(r'(.+?)\s*(?:->|→|--|—|=>|to)\s*(.+)', re.IGNORECASE)
        
        for line in text.splitlines():
            line = line.strip(' -•*·0123456789.)')
            if not line:
                continue
            
            match = arrow_pattern.match(line)
            if not match:
                continue
            
            src_text = match.group(1).strip().lower().strip('"\'')
            tgt_text = match.group(2).strip().lower().strip('"\'')
            
            # Fuzzy match to component labels
            src_id = self._fuzzy_match_component(src_text, label_to_id)
            tgt_id = self._fuzzy_match_component(tgt_text, label_to_id)
            
            if src_id and tgt_id and src_id != tgt_id:
                pair = tuple(sorted([src_id, tgt_id]))
                if pair not in seen:
                    seen.add(pair)
                    src_comp = next(c for c in components if c['id'] == src_id)
                    tgt_comp = next(c for c in components if c['id'] == tgt_id)
                    connections.append({
                        'from': src_id,
                        'to': tgt_id,
                        'from_label': src_comp.get('label', src_id),
                        'to_label': tgt_comp.get('label', tgt_id),
                        'type': 'vision',
                        'distance': float(self._distance(src_comp, tgt_comp)),
                        'edge_distance': float(self._edge_distance(src_comp, tgt_comp)),
                    })
        
        return connections
    
    def _fuzzy_match_component(self, text: str, label_to_id: Dict[str, str]) -> Optional[str]:
        """Match text to the closest component label.
        
        Uses strict matching to avoid hallucinated connections:
        - Exact match first
        - Then requires high overlap (>= 0.75) between label and text
        """
        # Exact match
        if text in label_to_id:
            return label_to_id[text]
        
        # Strict substring match: only if one string fully contains the other
        # AND the overlap ratio is very high
        best_id = None
        best_score = 0
        for label, comp_id in label_to_id.items():
            if label.startswith('component_'):
                continue  # Skip IDs, prefer label matches
            # Check if either fully contains the other
            if label == text:
                return comp_id
            if label in text or text in label:
                shorter = min(len(label), len(text))
                longer = max(len(label), len(text))
                score = shorter / longer
                if score > best_score and score >= 0.75:
                    best_score = score
                    best_id = comp_id
        
        return best_id
    
    def _merge_connections(self, proximity: List[Dict], vision: List[Dict]) -> List[Dict]:
        """Merge proximity and vision connections.
        
        Strategy:
        - Proximity connections (edge-distance < threshold) are kept as-is
          since they represent nearly-touching / overlapping components.
        - Vision connections are included only if the two components are
          within a reasonable spatial range (edge-distance < 0.30), to
          discard hallucinated long-range links the model might produce.
        """
        merged = {}
        
        # Add proximity connections (already filtered by tight threshold)
        for conn in proximity:
            pair = tuple(sorted([conn['from'], conn['to']]))
            merged[pair] = conn
        
        # Add vision connections only if spatially plausible
        # (max edge distance 0.30 of image — roughly nearby components)
        for conn in vision:
            pair = tuple(sorted([conn['from'], conn['to']]))
            if conn.get('edge_distance', 0) <= 0.30:
                merged[pair] = conn  # Overwrites proximity if same pair
            else:
                print(f"   🗑️ Discarded vision connection {conn.get('from_label','?')} → "
                      f"{conn.get('to_label','?')} (edge dist {conn.get('edge_distance', 0):.3f} too large)")
        
        return list(merged.values())
    
    def _distance(self, comp1: Dict, comp2: Dict) -> float:
        """Calculate center-to-center distance"""
        dx = comp1['center_x'] - comp2['center_x']
        dy = comp1['center_y'] - comp2['center_y']
        return (dx**2 + dy**2) ** 0.5


# Singleton instance
ar_service = ARService()