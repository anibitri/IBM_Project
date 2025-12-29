import numpy as np
from ultralytics import SAM
import torch
import gc
import os

# --- ENSURE THIS IS "mobile_sam.pt" ---
MODEL_PATH = "mobile_sam.pt"

def extract_document_features(image_path, **kwargs):
    model = None
    detected_objects = []
    
    # 1. Sanity Check: Is the model actually small?
    if os.path.exists(MODEL_PATH):
        size_mb = os.path.getsize(MODEL_PATH) / (1024 * 1024)
        if size_mb > 100:
            print(f"WARNING: Your 'mobile_sam.pt' is huge ({size_mb:.2f} MB). This is likely the wrong model!")
            print("ACTION: Deleting it to force a re-download...")
            os.remove(MODEL_PATH)

    try:
        print(f"INFO: Running SAM ({MODEL_PATH}) on {image_path}...")
        
        # 2. Force CPU for SAM (It is fast enough now)
        device = 'cpu'
        print(f"INFO: SAM Device -> {device}")

        model = SAM(MODEL_PATH)
        results = model(image_path, device=device)
        
        for r in results:
            if r.masks is None: continue
            
            masks = r.masks.xy
            boxes = r.boxes.xyxy.tolist()
            scores = r.boxes.conf.tolist()
            
            for i, mask_coords in enumerate(masks):
                if scores[i] < 0.3: continue
                x1, y1, x2, y2 = boxes[i]
                detected_objects.append({
                    "id": str(len(detected_objects) + 1),
                    "label": "Object",
                    "bbox": [x1, y1, x2, y2],
                    "mask": mask_coords.tolist(),
                    "confidence": scores[i]
                })

        print(f"INFO: SAM finished. Found {len(detected_objects)} segments.")

    except Exception as e:
        print(f"ERROR in AR Service: {e}")
        return []

    finally:
        if model: del model
        gc.collect()

    return detected_objects