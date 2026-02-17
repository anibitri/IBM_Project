import cv2
import numpy as np
from typing import List, Dict, Tuple, Optional
from app.services.model_manager import manager
from PIL import Image
import io
import base64

class ARService:
    """Enhanced AR service for diagram segmentation and analysis"""
    
    def __init__(self):
        self.min_box_area = 500  # Minimum area for valid components
        self.iou_threshold = 0.5  # IoU threshold for duplicate removal
        self.confidence_threshold = 0.3  # Minimum confidence score
        self.max_components = 50  # Maximum components to extract
    
    def extract_document_features(self, file_path: str, hints: Optional[List[str]] = None) -> List[Dict]:
        """
        Enhanced extraction with filtering, labeling, and metadata.
        Returns list of component dictionaries with normalized coordinates.
        """
        if hints is None:
            hints = []

        if not manager.ar_model:
            print("⚠️ AR Model not loaded")
            return []

        try:
            print(f"🔍 AR SERVICE: Analyzing {file_path}")
            
            # Load image to get dimensions
            image = cv2.imread(file_path)
            if image is None:
                print(f"❌ Failed to load image: {file_path}")
                return []
            
            img_height, img_width = image.shape[:2]
            
            # Run segmentation
            results = manager.ar_model(file_path)
            if not results:
                return []

            # Extract and filter segments
            raw_segments = self._extract_segments(results)
            if not raw_segments:
                return []
            
            # Filter by confidence and size
            filtered_segments = self._filter_segments(raw_segments, img_width, img_height)
            
            # Remove overlapping boxes
            unique_segments = self._remove_overlaps(filtered_segments)
            
            # Normalize coordinates and add metadata
            normalized_components = self._normalize_components(
                unique_segments, 
                img_width, 
                img_height
            )
            
            # Label components using vision model
            labeled_components = self._label_components(
                file_path, 
                normalized_components, 
                hints
            )
            
            # Sort by position (top to bottom, left to right)
            sorted_components = self._sort_components(labeled_components)
            
            print(f"✅ Extracted {len(sorted_components)} components")
            return sorted_components[:self.max_components]

        except Exception as e:
            print(f"❌ AR Service Error: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def _extract_segments(self, results) -> List[Dict]:
        """Extract bounding boxes with confidence scores"""
        segments = []
        
        for r in results:
            if not hasattr(r, "boxes") or r.boxes is None:
                continue
            
            boxes = r.boxes
            if not hasattr(boxes, "xyxy") or boxes.xyxy is None:
                continue
            
            # Get boxes and confidence scores
            box_coords = boxes.xyxy.cpu().numpy()
            confidences = boxes.conf.cpu().numpy() if hasattr(boxes, 'conf') else None
            classes = boxes.cls.cpu().numpy() if hasattr(boxes, 'cls') else None
            
            for i, box in enumerate(box_coords):
                x1, y1, x2, y2 = box
                conf = confidences[i] if confidences is not None else 1.0
                cls = int(classes[i]) if classes is not None else 0
                
                segments.append({
                    'box': [float(x1), float(y1), float(x2), float(y2)],
                    'confidence': float(conf),
                    'class': cls
                })
        
        return segments
    
    def _filter_segments(self, segments: List[Dict], img_width: int, img_height: int) -> List[Dict]:
        """Filter segments by confidence and size"""
        filtered = []
        img_area = img_width * img_height
        
        for seg in segments:
            x1, y1, x2, y2 = seg['box']
            
            # Calculate area
            width = x2 - x1
            height = y2 - y1
            area = width * height
            
            # Filter criteria
            if seg['confidence'] < self.confidence_threshold:
                continue
            
            if area < self.min_box_area:
                continue
            
            # Ignore boxes that are too large (likely full image)
            if area > img_area * 0.8:
                continue
            
            # Ignore invalid boxes
            if width <= 0 or height <= 0:
                continue
            
            # Ignore boxes at image edges (likely artifacts)
            margin = 5
            if x1 < margin or y1 < margin or x2 > img_width - margin or y2 > img_height - margin:
                if area > img_area * 0.5:  # Only filter large edge boxes
                    continue
            
            filtered.append(seg)
        
        return filtered
    
    def _remove_overlaps(self, segments: List[Dict]) -> List[Dict]:
        """Remove overlapping bounding boxes using NMS"""
        if not segments:
            return []
        
        # Sort by confidence (highest first)
        segments = sorted(segments, key=lambda x: x['confidence'], reverse=True)
        
        keep = []
        
        for i, seg1 in enumerate(segments):
            should_keep = True
            
            for seg2 in keep:
                iou = self._calculate_iou(seg1['box'], seg2['box'])
                
                if iou > self.iou_threshold:
                    should_keep = False
                    break
            
            if should_keep:
                keep.append(seg1)
        
        return keep
    
    def _calculate_iou(self, box1: List[float], box2: List[float]) -> float:
        """Calculate Intersection over Union"""
        x1_min, y1_min, x1_max, y1_max = box1
        x2_min, y2_min, x2_max, y2_max = box2
        
        # Intersection area
        x_inter_min = max(x1_min, x2_min)
        y_inter_min = max(y1_min, y2_min)
        x_inter_max = min(x1_max, x2_max)
        y_inter_max = min(y1_max, y2_max)
        
        if x_inter_max < x_inter_min or y_inter_max < y_inter_min:
            return 0.0
        
        inter_area = (x_inter_max - x_inter_min) * (y_inter_max - y_inter_min)
        
        # Union area
        box1_area = (x1_max - x1_min) * (y1_max - y1_min)
        box2_area = (x2_max - x2_min) * (y2_max - y2_min)
        union_area = box1_area + box2_area - inter_area
        
        return inter_area / union_area if union_area > 0 else 0.0
    
    def _normalize_components(self, segments: List[Dict], img_width: int, img_height: int) -> List[Dict]:
        """Normalize coordinates to 0-1 range and add metadata"""
        components = []
        
        for i, seg in enumerate(segments):
            x1, y1, x2, y2 = seg['box']
            
            # Normalize to 0-1
            norm_x = x1 / img_width
            norm_y = y1 / img_height
            norm_width = (x2 - x1) / img_width
            norm_height = (y2 - y1) / img_height
            
            # Calculate center
            center_x = norm_x + norm_width / 2
            center_y = norm_y + norm_height / 2
            
            components.append({
                'id': f'component_{i}',
                'x': norm_x,
                'y': norm_y,
                'width': norm_width,
                'height': norm_height,
                'center_x': center_x,
                'center_y': center_y,
                'confidence': seg['confidence'],
                'area': norm_width * norm_height,
                'label': f'Component {i + 1}',  # Default label
                'description': None
            })
        
        return components
    
    def _label_components(self, image_path: str, components: List[Dict], hints: List[str]) -> List[Dict]:
        """Use vision model to label components"""
        if not manager.vision_model or not components:
            return components
        
        try:
            # Load original image
            image = Image.open(image_path)
            img_width, img_height = image.size
            
            # Process each component
            for component in components:
                try:
                    # Calculate pixel coordinates
                    x1 = int(component['x'] * img_width)
                    y1 = int(component['y'] * img_height)
                    x2 = int((component['x'] + component['width']) * img_width)
                    y2 = int((component['y'] + component['height']) * img_height)
                    
                    # Crop component region
                    cropped = image.crop((x1, y1, x2, y2))
                    
                    # Convert to base64 for vision model
                    buffered = io.BytesIO()
                    cropped.save(buffered, format="PNG")
                    img_base64 = base64.b64encode(buffered.getvalue()).decode()
                    
                    # Build prompt with hints
                    hint_text = f" Common components in this diagram: {', '.join(hints)}." if hints else ""
                    prompt = f"Identify this component from a technical diagram.{hint_text} Provide a brief, specific label (2-4 words max) and a one-sentence description."
                    
                    # Query vision model
                    response = manager.vision_model.generate_content([
                        prompt,
                        {"mime_type": "image/png", "data": img_base64}
                    ])
                    
                    if response and response.text:
                        # Parse response (expecting format: "Label: X\nDescription: Y")
                        lines = response.text.strip().split('\n')
                        label = None
                        description = None
                        
                        for line in lines:
                            if line.lower().startswith('label:'):
                                label = line.split(':', 1)[1].strip()
                            elif line.lower().startswith('description:'):
                                description = line.split(':', 1)[1].strip()
                        
                        if label:
                            component['label'] = label
                        if description:
                            component['description'] = description
                
                except Exception as e:
                    print(f"⚠️ Failed to label component {component['id']}: {e}")
                    continue
            
            return components
        
        except Exception as e:
            print(f"⚠️ Vision labeling failed: {e}")
            return components
    
    def _sort_components(self, components: List[Dict]) -> List[Dict]:
        """Sort components by position (top-to-bottom, left-to-right)"""
        return sorted(components, key=lambda c: (c['center_y'], c['center_x']))
    
    def analyze_component_relationships(self, components: List[Dict]) -> Dict:
        """Analyze spatial relationships between components"""
        relationships = {
            'connections': [],
            'groups': []
        }
        
        if len(components) < 2:
            return relationships
        
        # Find nearby components (potential connections)
        for i, comp1 in enumerate(components):
            for j, comp2 in enumerate(components[i+1:], start=i+1):
                distance = self._calculate_distance(comp1, comp2)
                
                # If components are close, consider them connected
                if distance < 0.15:  # Threshold for "closeness"
                    relationships['connections'].append({
                        'from': comp1['id'],
                        'to': comp2['id'],
                        'distance': distance
                    })
        
        return relationships
    
    def _calculate_distance(self, comp1: Dict, comp2: Dict) -> float:
        """Calculate normalized distance between component centers"""
        dx = comp1['center_x'] - comp2['center_x']
        dy = comp1['center_y'] - comp2['center_y']
        return np.sqrt(dx**2 + dy**2)


# Singleton instance
ar_service = ARService()


# Legacy function for backward compatibility
def extract_document_features(file_path: str, hints: Optional[List[str]] = None) -> List[Dict]:
    """Legacy wrapper function"""
    return ar_service.extract_document_features(file_path, hints)