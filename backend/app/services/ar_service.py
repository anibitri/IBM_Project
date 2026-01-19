import numpy as np
from PIL import Image
from app.services.model_manager import manager

def extract_document_features(image_path):
    """
    Uses the pre-loaded MobileSAM model to find bounding boxes.
    """
    # 1. Safety Check
    if not manager.ar_model:
        print("❌ Error: AR Model (SAM) not loaded.")
        return []

    try:
        print(f"--- AR SERVICE: Running SAM on {image_path} ---")
        
        # 2. Run Inference using the Manager's model
        # The Ultralytics SAM model handles image loading internally or via path
        results = manager.ar_model(image_path)

        segments = []
        
        # 3. Process Results
        # Ultralytics returns a list of Results objects
        for result in results:
            boxes = result.boxes  # Boxes object for bbox outputs
            
            if boxes is not None:
                # Convert to standard Python list for JSON serialization
                # box.xyxy is [x1, y1, x2, y2]
                for box in boxes.xyxy.tolist():
                    # Round to integers for cleaner JSON
                    clean_box = [int(coord) for coord in box]
                    segments.append(clean_box)

        print(f"--- AR SERVICE: Found {len(segments)} segments ---")
        return segments

    except Exception as e:
        print(f"❌ ERROR in AR Service: {e}")
        return []