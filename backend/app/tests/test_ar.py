import requests
import cv2
import os
import json 
import numpy as np

# CONFIG
BASE_URL = "http://127.0.0.1:4200/api" # Make sure this port matches your Flask run port (usually 5000)
SERVER_EXPECTED_DIR = r"backend\app\static\uploads"
KNOWN_FILE_NAME = "labeled_schematic.png" 

def visualize_ar():
    print(f"--- 1. Target File: {KNOWN_FILE_NAME} ---")
    
    # Check file exists locally for drawing
    full_path = os.path.join(SERVER_EXPECTED_DIR, KNOWN_FILE_NAME)
    if not os.path.exists(full_path):
        print(f"ERROR: File not found locally at {full_path}")
        return

    print("--- 2. Requesting AR Analysis ---")
    ar_payload = {"stored_name": KNOWN_FILE_NAME}
    
    try:
        # Check port! standard flask is 5000, your script had 4200
        ar_resp = requests.post(f"http://127.0.0.1:5000/api/ar/generate", json=ar_payload)
    except Exception as e:
        print(f"Connection Error: {e}")
        return
    
    if ar_resp.status_code != 200:
        print(f"AR Failed: {ar_resp.text}")
        return

    data = ar_resp.json()
    
    # --- DEBUGGING THE JSON RESPONSE ---
    print("\n--- SERVER RESPONSE DEBUG INFO ---")
    segments = data.get("segments", [])
    print(f"Received {len(segments)} segments.")
    # -----------------------------------

    print(f"\n--- 3. Found {len(segments)} AR Objects. Drawing... ---")

    img = cv2.imread(full_path)
    if img is None:
        print("Error reading image.")
        return

    # UPDATED LOOP FOR LIST OF LISTS
    for i, box in enumerate(segments):
        # The backend now returns raw [x1, y1, x2, y2]
        # It is NOT a dictionary with 'bbox' key anymore.
        
        try:
            x1, y1, x2, y2 = map(int, box)
            
            # Draw Green Box
            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
            
            # Simple Label
            label = f"Obj {i}"
            cv2.putText(img, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
            
        except Exception as e:
            print(f"Skipping malformed box: {box} - {e}")

    output_path = "debug_ar_result.png"
    cv2.imwrite(output_path, img)
    print(f"SUCCESS: Saved visualization to {os.path.abspath(output_path)}")

if __name__ == "__main__":
    visualize_ar()