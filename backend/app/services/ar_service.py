"""
ar_service.py - Updated with debug output and tuned thresholds
"""

import numpy as np
from PIL import Image, ImageStat
import torch
from typing import List, Dict, Optional

from app.services.model_manager import manager
from app.services.prompt_builder import (
    COMPONENT_LABEL_PROMPT,
    build_connection_prompt,
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
        self.min_area_ratio = 0.004
        self.min_dimension = 30
        self.max_aspect_ratio = 4.0
        
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
        self.text_edge_density_threshold = 0.12   # text has very dense edges
        self.text_fill_ratio_threshold = 0.30     # text fills the box uniformly
        self.text_max_height_px = 60              # standalone text is usually short
        self.text_min_aspect_ratio = 2.0          # text regions are wide & short

        # Empty-box detection
        self.empty_box_max_variance = 18.0        # very low colour spread
        self.empty_box_max_edge_density = 0.025   # almost no interior edges
        
        # Debug mode
        self.debug_complexity = False  # Set to True to see rejection reasons
    
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

            # Reject very long labels (>5 words) — likely a sentence the
            # model read from the image rather than a component name
            if len(label.split()) > 5:
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
            if area_ratio < self.min_area_ratio:
                if self.debug_complexity:
                    print(f"   🗑️ Too small (ratio): {seg['box_pixels']} ratio={area_ratio:.4f}")
                continue
            
            # Filter: too large (background)
            if seg['area_pixels'] > img_area * self.max_area_ratio:
                continue
            
            # Filter: extreme aspect ratios (lines, thin rectangles)
            aspect_ratio = max(width_px, height_px) / max(min(width_px, height_px), 1)
            if aspect_ratio > self.max_aspect_ratio:
                continue
            
            # Filter: too small in either dimension
            if width_px < self.min_dimension or height_px < self.min_dimension:
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
            if area_ratio < 0.008:  # For small boxes near edges
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
        # Components larger than this fraction of the image skip complexity checks
        # Raised from 0.015 → 0.04 so medium boxes still get checked
        complexity_bypass_area = 0.04
        
        complex_segments = []
        
        for seg in segments:
            area_ratio = seg['area_pixels'] / img_area
            x1, y1, x2, y2 = [int(c) for c in seg['box_pixels']]
            crop = img.crop((x1, y1, x2, y2))
            w_px = x2 - x1
            h_px = y2 - y1
            
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
            
            # ── 3. Large components skip remaining complexity checks ──
            if area_ratio >= complexity_bypass_area:
                complex_segments.append(seg)
                continue
            
            # ── 4. Standard complexity check for small detections ──
            has_color_variance = self._has_sufficient_color_variance(crop)
            has_edges = self._has_sufficient_edges(crop)
            
            if has_color_variance or has_edges:
                complex_segments.append(seg)
            elif self.debug_complexity:
                print(f"   🗑️ Visual complexity fail: [{x1},{y1},{x2},{y2}] area_r={area_ratio:.4f}")
        
        return complex_segments

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
                and area_ratio < 0.015):
            return True

        # C) Extremely high edge density alone (dense paragraph/title block)
        if edge_density > 0.25 and area_ratio < 0.03:
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

        if inner_var < 8.0 and inner_edge_density < 0.008:
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
        """Label components using Granite Vision model"""
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
                
                label = self._query_vision_for_label(crop, comp['id'])
                print(f"   🎯 Labeled {comp['id']} as '{label}'")

                # If the vision model failed, try to find a matching hint
                # based on spatial overlap or use a generic fallback
                if not label and hint_set:
                    label = f"Component {i+1}"
                
                # Post-label sanity check: reject tiny components whose label
                # doesn't match any text visible in the diagram
                # If area is much smaller than median AND label seems hallucinated, skip
                if label and comp['area'] < median_area * 0.3:
                    # This component is suspiciously small compared to others
                    if self.debug_complexity:
                        print(f"   ⚠️ Suspicious: '{label}' has area={comp['area']:.4f}, median={median_area:.4f}")
                
                comp['label'] = label if label else f"Component {i+1}"
                labeled.append(comp)
            
            except Exception as e:
                print(f"⚠️ Failed to label {comp['id']}: {e}")
                comp['label'] = f"Component {i+1}"
                labeled.append(comp)
        
        for comp in labeled:
            comp.pop('box_pixels', None)
        
        return labeled
    
    def _query_vision_for_label(self, crop_img: Image.Image, component_id: str) -> Optional[str]:
        """Query Granite Vision model to identify a cropped component"""
        try:
            if max(crop_img.size) > 224:
                ratio = 224.0 / max(crop_img.size)
                new_size = (int(crop_img.size[0] * ratio), int(crop_img.size[1] * ratio))
                crop_img = crop_img.resize(new_size, Image.LANCZOS)
            
            prompt = COMPONENT_LABEL_PROMPT
            
            chat_text = f"<|user|>\n<image>\n{prompt}\n<|assistant|>\n"
            
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
            
            chat_text = f"<|user|>\n<image>\n{prompt}\n<|assistant|>\n"
            
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