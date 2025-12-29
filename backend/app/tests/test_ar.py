import requests
import cv2
import os
import json # Added to pretty-print

# CONFIG
BASE_URL = "http://127.0.0.1:4200/api"
SERVER_EXPECTED_DIR = r"G:\IBM_Project\backend\app\static\uploads"
KNOWN_FILE_NAME = "labeled_schematic.png" 

def visualize_ar():
    print(f"--- 1. Target File: {KNOWN_FILE_NAME} ---")
    
    # Check file
    full_path = os.path.join(SERVER_EXPECTED_DIR, KNOWN_FILE_NAME)
    if not os.path.exists(full_path):
        print(f"ERROR: File not found at {full_path}")
        return

    print("--- 2. Requesting AR Analysis ---")
    ar_payload = {"stored_name": KNOWN_FILE_NAME}
    
    try:
        ar_resp = requests.post(f"{BASE_URL}/ar/generate", json=ar_payload)
    except Exception as e:
        print(f"Connection Error: {e}")
        return
    
    if ar_resp.status_code != 200:
        print(f"AR Failed: {ar_resp.text}")
        return

    data = ar_resp.json()
    
    # --- DEBUGGING THE JSON RESPONSE ---
    print("\n--- SERVER RESPONSE DEBUG INFO ---")
    print(f"Keys found in JSON: {list(data.keys())}")
    
    # Try to find the list of objects
    segments = []
    if "segments" in data:
        segments = data["segments"]
        print("Found key 'segments'.")
    elif "objects" in data:
        segments = data["objects"]
        print("Found key 'objects'.")
    elif "data" in data and isinstance(data["data"], list):
        segments = data["data"]
        print("Found key 'data'.")
    else:
        print("WARNING: Could not find a list of objects in the response!")
        print("Full Response Dump:")
        print(json.dumps(data, indent=2)) # Print everything so we can see it
    # -----------------------------------

    print(f"\n--- 3. Found {len(segments)} AR Objects. Drawing... ---")

    img = cv2.imread(full_path)
    if img is None:
        print("Error reading image.")
        return

    for obj in segments:
        # Handle cases where 'bbox' might be missing or different format
        if 'bbox' not in obj:
            continue
            
        bbox = obj['bbox']
        x1, y1, x2, y2 = map(int, bbox)
        conf = obj.get('confidence', 0.0)
        label = f"{obj.get('label', 'Obj')} {obj.get('id', '')} ({conf:.2f})"

        # Draw Green Box
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(img, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    output_path = "debug_ar_result.png"
    cv2.imwrite(output_path, img)
    print(f"SUCCESS: Saved visualization to {os.path.abspath(output_path)}")

if __name__ == "__main__":
    visualize_ar()