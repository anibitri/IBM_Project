import cv2
import numpy as np

def extract_document_features(image_path):
    image = cv2.imread(image_path)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Detect edges and shapes as placeholders
    edges = cv2.Canny(gray, 100, 200)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    elements = []

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = cv2.contourArea(contour)

        if area > 1000:
            elements.append({
                "id": len(elements) + 1,
                "type": "diagram_component",
                "position": {"x": float(x), "y": float(y), "z": 0.0},
                "size": {"width": float(w), "height": float(h)},
                "label": "Detected shape",
                "color": "#4CAF50"
            })

    return elements
