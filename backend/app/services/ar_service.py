import cv2
import numpy as np
import torch
import logging
import os
from PIL import Image
from typing import List, Dict, Optional, Any

# --- HUGGING FACE IMPORTS ---
try:
    from transformers import AutoProcessor, AutoModelForMaskGeneration
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False

logger = logging.getLogger(__name__)

# --- CONFIGURATION ---
SAM_MODEL_ID = "facebook/sam-vit-huge"

# --- DEVICE SELECTION (Includes MPS for Mac) ---
def get_device():
    if torch.backends.mps.is_available():
        return "mps"
    elif torch.cuda.is_available():
        return "cuda"
    return "cpu"

DEVICE = get_device()

# Lazy Global Loaders
_processor = None
_model = None

def _get_sam_model():
    """
    Lazy loads the SAM model and processor via Hugging Face Transformers.
    """
    global _processor, _model
    
    # Return existing if loaded
    if _processor is not None and _model is not None:
        return _processor, _model

    if not TRANSFORMERS_AVAILABLE:
        logger.warning("Transformers library not installed. Falling back to Rectangle mode.")
        return None, None

    try:
        logger.info(f"Loading SAM model ({SAM_MODEL_ID}) on {DEVICE}...")
        
        # Load Processor and Model directly from HF
        _processor = AutoProcessor.from_pretrained(SAM_MODEL_ID)
        _model = AutoModelForMaskGeneration.from_pretrained(SAM_MODEL_ID)
        
        _model.to(DEVICE)
        _model.eval() # Set to evaluation mode
        
        logger.info("SAM model loaded successfully via Transformers.")
        return _processor, _model
    except Exception as e:
        logger.error(f"Failed to load SAM via Transformers: {e}")
        return None, None

def _mask_to_polygon(binary_mask: np.ndarray, img_w: int, img_h: int) -> List[List[float]]:
    """Converts binary mask to normalized polygon points."""
    # Convert boolean tensor/array to uint8
    mask_uint8 = (binary_mask * 255).astype(np.uint8)
    
    # Find contours
    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return []

    # Get largest contour
    largest_contour = max(contours, key=cv2.contourArea)
    
    # Simplify contour
    epsilon = 0.005 * cv2.arcLength(largest_contour, True)
    approx = cv2.approxPolyDP(largest_contour, epsilon, True)
    
    normalized_points = []
    for point in approx:
        px, py = point[0]
        normalized_points.append([float(px) / img_w, float(py) / img_h])
        
    return normalized_points

def extract_document_features(image_path: str, hints: Optional[List[Dict]] = None) -> List[Dict]:
    """
    HYBRID MODE (Transformers): Uses Granite hints + Hugging Face SAM for perfect shapes.
    """
    if not hints:
        return []

    # Load image (PIL is preferred for Transformers)
    try:
        raw_image = Image.open(image_path).convert("RGB")
        img_w, img_h = raw_image.size
    except Exception as e:
        logger.error(f"Could not read image at {image_path}: {e}")
        return []

    elements = []
    
    # 1. Prepare Base Elements (Granite Rectangles)
    # We collect input boxes for batch processing in SAM
    input_boxes = []
    element_indices_with_boxes = [] # Track which elements correspond to which box

    for i, hint in enumerate(hints):
        bbox = hint.get('bbox') # [ymin, xmin, ymax, xmax] (Normalized 0-1)
        
        element = {
            "id": f"comp_{i}",
            "label": hint.get('label', 'Unknown'),
            "description": hint.get('description', ''),
            "bbox": bbox, 
            "shape_type": "rectangle"
        }
        elements.append(element)

        if bbox:
            # Convert Normalized [ymin, xmin, ymax, xmax] to Pixels [x1, y1, x2, y2]
            # Transformers expects: [x_min, y_min, x_max, y_max]
            ymin, xmin, ymax, xmax = bbox
            box_pixels = [
                xmin * img_w, 
                ymin * img_h, 
                xmax * img_w, 
                ymax * img_h
            ]
            input_boxes.append(box_pixels)
            element_indices_with_boxes.append(i)

    # 2. Refinement with SAM (Batch Inference)
    processor, model = _get_sam_model()
    
    if processor and model and input_boxes:
        try:
            # Transformers requires boxes as a list of lists: [[box1, box2, ...]]
            inputs = processor(
                images=raw_image, 
                input_boxes=[input_boxes], 
                return_tensors="pt"
            ).to(DEVICE)

            with torch.no_grad():
                outputs = model(**inputs)

            # Post-process masks to original image size
            # Output shape: (batch_size, num_boxes, num_masks, height, width)
            masks = processor.image_processor.post_process_masks(
                outputs.pred_masks, 
                inputs.original_sizes, 
                inputs.reshaped_input_sizes
            )[0] # Take first image in batch

            # Scores to choose the best mask per box
            iou_scores = outputs.iou_scores[0] # (num_boxes, num_masks)

            # Iterate through results and update elements
            for idx, element_idx in enumerate(element_indices_with_boxes):
                # SAM usually returns 3 masks per box. We pick the one with highest IOU score.
                best_mask_idx = torch.argmax(iou_scores[idx])
                best_mask = masks[idx][best_mask_idx].cpu().numpy() # Convert to numpy boolean array

                polygon = _mask_to_polygon(best_mask, img_w, img_h)
                
                if polygon:
                    elements[element_idx]["polygon"] = polygon
                    elements[element_idx]["shape_type"] = "polygon"

            logger.info(f"Refined {len(input_boxes)} components using HF SAM.")

        except Exception as e:
            logger.error(f"SAM inference failed: {e}")
            # Fallback: Elements remain as rectangles

    return elements


# --- GRANITE ONLY VERSION (COMMENTED OUT) ---
# To use this, simply rename 'extract_document_features' above to something else
# and uncomment the function below.

# def extract_document_features(image_path: str, hints: Optional[List[Dict]] = None) -> List[Dict]:
#     """
#     GRANITE ONLY MODE: Simple, fast, rectangle-only.
#     No SAM dependency, no heavy model loading.
#     """
#     if not hints:
#         return []
# 
#     logger.info("Extracting features using Granite hints (No SAM).")
#     elements = []
#     
#     for i, hint in enumerate(hints):
#         # We just pass the Granite data straight through to the frontend.
#         # No image processing required since we trust the VLM's coordinates.
#         elements.append({
#             "id": f"comp_{i}",
#             "label": hint.get('label', 'Unknown'),
#             "description": hint.get('description', ''),
#             "bbox": hint.get('bbox'), # [ymin, xmin, ymax, xmax]
#             "shape_type": "rectangle"
#         })
# 
#     return elements