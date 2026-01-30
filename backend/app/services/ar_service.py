from app.services.model_manager import manager

def extract_document_features(file_path, hints=None):
    """
    Runs MobileSAM to generate bounding boxes/segments.
    Returns list of [x1, y1, x2, y2].
    """
    if hints is None:
        hints = []

    if not manager.ar_model:
        return []

    try:
        print(f"--- AR SERVICE: Segmenting {file_path} ---")
        results = manager.ar_model(file_path)

        if results is None:
            return []

        segments = []

        for r in results:
            if not hasattr(r, "boxes") or r.boxes is None:
                continue
            if not hasattr(r.boxes, "xyxy"):
                continue
            boxes = r.boxes.xyxy
            if boxes is None:
                continue
            segments.extend(boxes.cpu().numpy().tolist())

        return segments

    except Exception as e:
        print(f"❌ AR Error: {e}")
        return []
