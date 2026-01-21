from app.services.model_manager import manager

def extract_document_features(file_path, hints=None):
    """
    Runs MobileSAM to generate bounding boxes/segments.
    Args:
        file_path: Path to image
        hints: Optional list of components from Vision (not fully used yet, but signature required)
    """
    if not manager.ar_model:
        return []

    try:
        print(f"--- AR SERVICE: Segmenting {file_path} ---")
        
        # Run Inference
        results = manager.ar_model(file_path)
        
        segments = []
        for r in results:
            # Extract boxes in [x1, y1, x2, y2] format
            boxes = r.boxes.xyxy.cpu().numpy().tolist()
            segments.extend(boxes)
            
        return segments

    except Exception as e:
        print(f"❌ AR Error: {e}")
        return []