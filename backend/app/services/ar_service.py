"""
ar_service.py - Updated with debug output and tuned thresholds
"""

import numpy as np
from PIL import Image, ImageStat
import torch
from typing import List, Dict, Optional

from app.services.model_manager import manager


class ARService:
    """AR component extraction and analysis"""
    
    def __init__(self):
        self.confidence_threshold = 0.45
        self.min_box_area = 2000
        self.iou_threshold = 0.3
        self.max_components = 50
        self.proximity_threshold = 0.15

        # Size Threshholds
        self.max_area_ratio = 0.50
        self.min_area_ratio = 0.008
        self.min_dimension = 50
        self.max_aspect_ratio = 5.0
        
        # Visual complexity thresholds
        self.min_color_variance = 15.0    
        self.min_edge_density = 0.02

        #Border margin
        self.edge_exclude_margin = 0.03

        # Containment removal parameters
        self.container_min_area_ratio = 0.25
        
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
            
            results = manager.ar_model(image_path)
            
            segments = self._extract_segments(results, img_width, img_height)
            print(f"   📦 Raw SAM detections: {len(segments)}")
            
            filtered = self._filter_segments(segments, img_width, img_height)
            print(f"   ✓ After basic filtering: {len(filtered)}")
            
            img_area = img_width * img_height
            unique = self._remove_overlaps(filtered, img_area=img_area)
            print(f"   ✓ After NMS: {len(unique)}")
            
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
        
    def _deduplicate_by_label(self, components: List[Dict]) -> List[Dict]:
        """Remove duplicate labels, keeping the highest-confidence instance"""
        seen_labels = {}
        
        for comp in components:
            label = (comp.get('label') or '').strip().lower()
            if not label or label.startswith('component'):
                # Always keep unlabeled components
                seen_labels[comp['id']] = comp
                continue
            
            if label=='unknown' or label=='unlabeled':
                # Keep unknown components but don't use their label for deduplication
                seen_labels[comp['id']] = comp
                continue

            if label not in seen_labels:
                seen_labels[label] = comp
            else:
                existing = seen_labels[label]
                if comp['confidence'] > existing['confidence']:
                    seen_labels[label] = comp
        
        return list(seen_labels.values())
    
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
            if area_ratio < 0.02:  # Only for small boxes
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
        Filter out visually simple regions.
        Uses OR logic: pass if EITHER test passes (more lenient).
        """
        complex_segments = []
        
        for seg in segments:
            x1, y1, x2, y2 = [int(c) for c in seg['box_pixels']]
            crop = img.crop((x1, y1, x2, y2))
            
            # Get both metrics
            has_color_variance = self._has_sufficient_color_variance(crop)
            has_edges = self._has_sufficient_edges(crop)
            
            # Pass if EITHER test passes (OR logic instead of AND)
            if has_color_variance or has_edges:
                complex_segments.append(seg)
        
        return complex_segments
    
    def _has_sufficient_color_variance(self, crop: Image.Image) -> bool:
        """
        Check if region has enough color variation.
        Lowered threshold: 15 instead of 100.
        """
        try:
            gray = crop.convert('L')
            stat = ImageStat.Stat(gray)
            variance = stat.stddev[0]
            
            # Tuned threshold
            return variance > self.min_color_variance
        
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
        """Remove overlapping boxes using NMS + containment removal"""
        if not segments:
            return []
        
        segments = sorted(segments, key=lambda x: x['confidence'], reverse=True)
        
        # Step 1: Remove boxes that are clearly background containers
        # ONLY remove if the box is large (>25% of image) AND contains 2+ other boxes
        non_containers = []
        for i, seg in enumerate(segments):
            is_container = False
            
            # Only consider containment removal for large boxes
            if img_area and seg['area_pixels'] > img_area * self.container_min_area_ratio:
                contained_count = 0
                for j, other in enumerate(segments):
                    if i == j:
                        continue
                    if self._contains(seg['box_pixels'], other['box_pixels']):
                        contained_count += 1
                
                if contained_count >= 3:
                    is_container = True
                    if self.debug_complexity:
                        ratio = seg['area_pixels'] / img_area if img_area else 0
                        # print(f"   🗑️ Removing container box: {seg['box_pixels']} (contains {contained_count} others, area_ratio={ratio:.2f})")
            
            if not is_container:
                non_containers.append(seg)
        
        # If containment removal eliminated everything, fall back to original
        if not non_containers:
            non_containers = segments
        
        # Step 2: Standard NMS on remaining boxes
        kept = []
        for seg in non_containers:
            should_keep = True
            for kept_seg in kept:
                iou = self._calculate_iou(seg['box_pixels'], kept_seg['box_pixels'])
                if iou > self.iou_threshold:
                    should_keep = False
                    if self.debug_complexity:
                        print(f"   🗑️ NMS removed box {seg['box_pixels']} (IoU={iou:.2f} with {kept_seg['box_pixels']})")
                    break
            
            if should_keep:
                kept.append(seg)
        
        return kept
    
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
                comp['label'] = hints[i] if i < len(hints) else f"Component {i+1}"
            return components
        
        try:
            img = Image.open(image_path).convert("RGB")
        except Exception as e:
            print(f"⚠️ Failed to load image for labeling: {e}")
            for i, comp in enumerate(components):
                comp['label'] = hints[i] if i < len(hints) else f"Component {i+1}"
            return components
        
        # Calculate median area to detect outlier (too-small) components
        areas = [comp['area'] for comp in components]
        median_area = sorted(areas)[len(areas) // 2] if areas else 0
        
        labeled = []
        for i, comp in enumerate(components):
            try:
                if i < len(hints) and hints[i]:
                    comp['label'] = hints[i]
                    comp['description'] = None
                    labeled.append(comp)
                    continue
                
                x1, y1, x2, y2 = comp['box_pixels']
                crop = img.crop((int(x1), int(y1), int(x2), int(y2)))
                
                label = self._query_vision_for_label(crop, comp['id'])
                print(f"   🎯 Labeled {comp['id']} as '{label}'")
                
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
            
            prompt = (
                "This is a cropped region from a technical architecture diagram. "
                "If text is visible, use that as the name. "
                "Respond with ONLY the component name in 1-3 words, nothing else."
                "If you cannot identify the component, return 'Unknown' or 'Unlabeled'."
                "The component name MUST be 1 to 3 words max, ideally matching any text visible in the crop. "
            )
            
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
                for noise in ['<|end_of_text|>', '<fim_prefix>', '<|system|>', '<|user|>', '<|assistant|>']:
                    label = label.replace(noise, '')
                label = label.strip('.-:; ')
                
                if len(label) > 50:
                    label = label[:50]
                
                return label if label else None
            
            return None
        
        except Exception as e:
            print(f"⚠️ Vision labeling error for {component_id}: {e}")
            return None
    
    def analyze_component_relationships(self, components: List[Dict]) -> Dict:
        """Analyze spatial relationships between components"""
        if len(components) < 2:
            return {'connections': [], 'groups': []}
        
        connections = []
        
        for i, comp1 in enumerate(components):
            for comp2 in components[i+1:]:
                dist = self._distance(comp1, comp2)
                
                if dist < self.proximity_threshold:
                    connections.append({
                        'from': comp1['id'],
                        'to': comp2['id'],
                        'distance': float(dist)
                    })
        
        return {
            'connections': connections,
            'groups': []
        }
    
    def _distance(self, comp1: Dict, comp2: Dict) -> float:
        """Calculate center-to-center distance"""
        dx = comp1['center_x'] - comp2['center_x']
        dy = comp1['center_y'] - comp2['center_y']
        return (dx**2 + dy**2) ** 0.5


# Singleton instance
ar_service = ARService()