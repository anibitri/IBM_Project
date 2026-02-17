"""
test_ar_service.py

Standalone test for SAM model AR segmentation.
Runs INDEPENDENTLY - does not load vision or chat models.

Usage:
    python test_ar_service.py                          # Uses generated test image
    python test_ar_service.py --image path/to/img.png  # Uses your own image
    python test_ar_service.py --image path/to/img.png --save  # Saves annotated output
"""

import os
import sys
import argparse
import time
import torch
import numpy as np
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

# ============================================================
# ARGUMENT PARSING
# ============================================================

parser = argparse.ArgumentParser(description='Test SAM AR segmentation')
parser.add_argument('--image',  type=str, default=None,   help='Path to test image')
parser.add_argument('--save',   action='store_true',      help='Save annotated output image')
parser.add_argument('--model',  type=str, default='mobile_sam.pt', help='SAM model file')
parser.add_argument('--device', type=str, default='auto', help='cpu | cuda | auto')
parser.add_argument('--conf',   type=float, default=0.3,  help='Confidence threshold (0-1)')
parser.add_argument('--min-area', type=int, default=500,  help='Minimum box area in pixels')
args = parser.parse_args()


# ============================================================
# HELPERS
# ============================================================

def separator(title: str = ""):
    width = 55
    if title:
        pad = (width - len(title) - 2) // 2
        print(f"\n{'=' * pad} {title} {'=' * pad}")
    else:
        print("=" * width)


def create_test_image(save_path: str = "test_input.png") -> str:
    """
    Generate a simple technical diagram image for testing.
    Contains clear geometric shapes that SAM should segment easily.
    """
    print("🎨 Generating test image...")

    width, height = 800, 600
    img = Image.new("RGB", (width, height), color=(240, 240, 245))
    draw = ImageDraw.Draw(img)

    # Background grid (blueprint style)
    for x in range(0, width, 40):
        draw.line([(x, 0), (x, height)], fill=(220, 225, 235), width=1)
    for y in range(0, height, 40):
        draw.line([(0, y), (width, y)], fill=(220, 225, 235), width=1)

    # Component 1 - Large rectangle (CPU/Processor)
    draw.rectangle([80, 80, 280, 200], fill=(70, 130, 180), outline=(30, 80, 140), width=3)
    draw.text((160, 130), "CPU", fill="white", anchor="mm")

    # Component 2 - Medium rectangle (RAM)
    draw.rectangle([340, 80, 520, 160], fill=(60, 160, 80), outline=(30, 100, 50), width=3)
    draw.text((430, 120), "RAM", fill="white", anchor="mm")

    # Component 3 - Small rectangle (Cache)
    draw.rectangle([340, 180, 460, 240], fill=(180, 100, 60), outline=(120, 60, 30), width=3)
    draw.text((400, 210), "Cache", fill="white", anchor="mm")

    # Component 4 - Circle (Clock)
    draw.ellipse([560, 80, 700, 220], fill=(160, 60, 180), outline=(100, 30, 130), width=3)
    draw.text((630, 150), "CLK", fill="white", anchor="mm")

    # Component 5 - Rectangle (Storage)
    draw.rectangle([80, 280, 300, 380], fill=(200, 160, 40), outline=(140, 110, 20), width=3)
    draw.text((190, 330), "Storage", fill="white", anchor="mm")

    # Component 6 - Rectangle (GPU)
    draw.rectangle([340, 280, 620, 420], fill=(180, 50, 50), outline=(120, 20, 20), width=3)
    draw.text((480, 350), "GPU", fill="white", anchor="mm")

    # Component 7 - Small rectangle (I/O)
    draw.rectangle([80, 440, 220, 520], fill=(80, 160, 160), outline=(40, 110, 110), width=3)
    draw.text((150, 480), "I/O", fill="white", anchor="mm")

    # Component 8 - Rectangle (Network)
    draw.rectangle([280, 440, 480, 520], fill=(100, 80, 180), outline=(60, 40, 130), width=3)
    draw.text((380, 480), "Network", fill="white", anchor="mm")

    # Connection lines between components
    connections = [
        ((280, 140), (340, 120)),   # CPU → RAM
        ((280, 160), (340, 210)),   # CPU → Cache
        ((280, 140), (560, 150)),   # CPU → CLK
        ((190, 200), (190, 280)),   # CPU → Storage
        ((430, 160), (480, 280)),   # RAM → GPU
        ((190, 380), (150, 440)),   # Storage → I/O
        ((480, 420), (380, 440)),   # GPU → Network
    ]
    for start, end in connections:
        draw.line([start, end], fill=(100, 100, 120), width=2)

    # Title
    draw.rectangle([0, 0, width, 35], fill=(50, 50, 70))
    draw.text((width // 2, 17), "System Architecture Diagram - AR Test", fill="white", anchor="mm")

    img.save(save_path)
    print(f"   ✅ Test image saved: {save_path} ({width}x{height}px)")
    return save_path


def resolve_device(device_arg: str) -> str:
    """Resolve device from argument"""
    if device_arg == 'auto':
        return 'cuda' if torch.cuda.is_available() else 'cpu'
    return device_arg


def calculate_iou(box1, box2) -> float:
    """Calculate Intersection over Union between two boxes"""
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


def nms_filter(detections: list, iou_threshold: float = 0.5) -> list:
    """Remove overlapping detections using Non-Maximum Suppression"""
    if not detections:
        return []

    # Sort by confidence descending
    detections = sorted(detections, key=lambda x: x['confidence'], reverse=True)

    kept = []
    for det in detections:
        should_keep = True
        for kept_det in kept:
            iou = calculate_iou(det['box_pixels'], kept_det['box_pixels'])
            if iou > iou_threshold:
                should_keep = False
                break
        if should_keep:
            kept.append(det)

    return kept


def annotate_image(image_path: str, detections: list, output_path: str):
    """Draw bounding boxes on image and save"""
    img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Color palette for boxes
    colors = [
        (255, 100, 100), (100, 255, 100), (100, 100, 255),
        (255, 200, 0),   (0, 200, 255),   (255, 100, 255),
        (100, 255, 200), (255, 150, 50),  (150, 50, 255),
    ]

    for i, det in enumerate(detections):
        color = colors[i % len(colors)]
        x1, y1, x2, y2 = det['box_pixels']

        # Draw box
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)

        # Draw label background
        label = f"#{det['id']} ({det['confidence']:.2f})"
        label_bg = [x1, y1 - 20, x1 + len(label) * 7, y1]
        draw.rectangle(label_bg, fill=color)
        draw.text((x1 + 3, y1 - 18), label, fill="white")

    img.save(output_path)
    print(f"\n💾 Annotated image saved: {output_path}")


# ============================================================
# MAIN TEST
# ============================================================

def run_test():
    separator("SAM AR SERVICE TEST")
    print("Tests SAM segmentation ONLY (no vision/chat models loaded)\n")

    # --- Setup ---
    device = resolve_device(args.device)
    model_path = args.model

    print(f"⚙️  Config:")
    print(f"   Device          : {device.upper()}")
    print(f"   Model           : {model_path}")
    print(f"   Confidence      : {args.conf}")
    print(f"   Min Box Area    : {args.min_area}px²")
    print(f"   Save Output     : {args.save}")

    # --- Resolve image ---
    if args.image:
        image_path = args.image
        if not os.path.exists(image_path):
            print(f"\n❌ Image not found: {image_path}")
            sys.exit(1)
        print(f"\n📷 Using provided image: {image_path}")
    else:
        image_path = "test_input.png"
        create_test_image(image_path)

    # --- Load image info ---
    img = Image.open(image_path)
    img_width, img_height = img.size
    img_area = img_width * img_height

    print(f"\n📐 Image Info:")
    print(f"   Size     : {img_width} x {img_height}")
    print(f"   Area     : {img_area:,} px²")
    print(f"   Mode     : {img.mode}")

    # --- Load SAM ---
    separator("LOADING SAM")

    if not os.path.exists(model_path):
        print(f"❌ SAM model file not found: {model_path}")
        print("   Download from: https://github.com/ultralytics/assets/releases")
        sys.exit(1)

    print(f"📐 Loading {model_path}...")
    load_start = time.time()

    try:
        from ultralytics import SAM
        model = SAM(model_path)
        model.to(device)
        load_time = time.time() - load_start
        print(f"   ✅ SAM loaded in {load_time:.2f}s on {device.upper()}")

    except Exception as e:
        print(f"   ❌ SAM failed to load: {e}")
        sys.exit(1)

    # --- Run inference ---
    separator("RUNNING INFERENCE")

    print(f"🔍 Running SAM on image...")
    infer_start = time.time()

    try:
        results = model(image_path)
        infer_time = time.time() - infer_start
        print(f"   ✅ Inference complete in {infer_time:.2f}s")

    except Exception as e:
        print(f"   ❌ Inference failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # --- Parse raw results ---
    separator("RAW RESULTS")

    raw_detections = []

    for r in results:
        if not hasattr(r, 'boxes') or r.boxes is None:
            print("   ⚠️ No boxes in result")
            continue

        boxes = r.boxes

        if not hasattr(boxes, 'xyxy') or boxes.xyxy is None:
            print("   ⚠️ No xyxy coordinates")
            continue

        box_coords = boxes.xyxy.cpu().numpy()
        confidences = boxes.conf.cpu().numpy() if hasattr(boxes, 'conf') and boxes.conf is not None else None
        classes = boxes.cls.cpu().numpy() if hasattr(boxes, 'cls') and boxes.cls is not None else None

        print(f"   📦 Raw detections found: {len(box_coords)}")

        for i, box in enumerate(box_coords):
            x1, y1, x2, y2 = float(box[0]), float(box[1]), float(box[2]), float(box[3])

            conf = float(confidences[i]) if confidences is not None else 1.0
            cls  = int(classes[i]) if classes is not None else 0

            width_px  = x2 - x1
            height_px = y2 - y1
            area_px   = width_px * height_px

            raw_detections.append({
                'id': i,
                'box_pixels': [x1, y1, x2, y2],
                'width_px': width_px,
                'height_px': height_px,
                'area_px': area_px,
                'confidence': conf,
                'class': cls,
                # Normalised (0-1) coordinates for AR overlay
                'x_norm': x1 / img_width,
                'y_norm': y1 / img_height,
                'w_norm': width_px / img_width,
                'h_norm': height_px / img_height,
            })

    print(f"\n   Total raw boxes: {len(raw_detections)}")

    # --- Filter detections ---
    separator("FILTERING")

    filtered = []
    filter_log = {
        'low_confidence': 0,
        'too_small': 0,
        'too_large': 0,
        'kept': 0
    }

    for det in raw_detections:
        # Filter: low confidence
        if det['confidence'] < args.conf:
            filter_log['low_confidence'] += 1
            continue

        # Filter: too small (likely noise)
        if det['area_px'] < args.min_area:
            filter_log['too_small'] += 1
            continue

        # Filter: too large (likely full image/background)
        if det['area_px'] > img_area * 0.85:
            filter_log['too_large'] += 1
            continue

        filtered.append(det)
        filter_log['kept'] += 1

    print(f"   Filtered out (low confidence) : {filter_log['low_confidence']}")
    print(f"   Filtered out (too small)      : {filter_log['too_small']}")
    print(f"   Filtered out (too large)      : {filter_log['too_large']}")
    print(f"   Remaining after filters       : {filter_log['kept']}")

    # --- Remove overlapping boxes (NMS) ---
    final_detections = nms_filter(filtered, iou_threshold=0.5)

    print(f"   Removed (overlapping/NMS)     : {len(filtered) - len(final_detections)}")
    print(f"   ✅ Final detections           : {len(final_detections)}")

    # Re-assign sequential IDs
    for i, det in enumerate(final_detections):
        det['id'] = i + 1

    # --- Print final detections ---
    separator("DETECTIONS")

    if not final_detections:
        print("⚠️  No components detected after filtering.")
        print("   Try lowering --conf or --min-area")
    else:
        print(f"Detected {len(final_detections)} component(s):\n")
        print(f"  {'ID':<4} {'Confidence':>10}  {'Box (pixels)':<30}  {'Size (px)':<20}  {'Norm (x,y,w,h)'}")
        print(f"  {'-'*4} {'-'*10}  {'-'*30}  {'-'*20}  {'-'*30}")

        for det in final_detections:
            x1, y1, x2, y2 = det['box_pixels']
            box_str  = f"({x1:.0f},{y1:.0f}) → ({x2:.0f},{y2:.0f})"
            size_str = f"{det['width_px']:.0f} x {det['height_px']:.0f}"
            norm_str = (
                f"x={det['x_norm']:.3f}, y={det['y_norm']:.3f}, "
                f"w={det['w_norm']:.3f}, h={det['h_norm']:.3f}"
            )
            print(f"  #{det['id']:<3} {det['confidence']:>10.4f}  {box_str:<30}  {size_str:<20}  {norm_str}")

    # --- AR-ready output (what the frontend receives) ---
    separator("AR-READY OUTPUT")

    ar_components = [
        {
            'id': f"component_{det['id']}",
            'x': det['x_norm'],
            'y': det['y_norm'],
            'width': det['w_norm'],
            'height': det['h_norm'],
            'confidence': det['confidence'],
            'label': f"Component {det['id']}",  # Would be filled by vision model
            'description': None
        }
        for det in final_detections
    ]

    print("AR component format (as sent to frontend):\n")
    for comp in ar_components:
        print(f"  {comp['id']}")
        print(f"    position  : x={comp['x']:.3f}, y={comp['y']:.3f}")
        print(f"    size      : w={comp['width']:.3f}, h={comp['height']:.3f}")
        print(f"    confidence: {comp['confidence']:.4f}")
        print(f"    label     : {comp['label']}")

    # --- Summary ---
    separator("SUMMARY")

    print(f"  Image           : {image_path} ({img_width}x{img_height})")
    print(f"  Model           : {model_path} on {device.upper()}")
    print(f"  Load time       : {load_time:.2f}s")
    print(f"  Inference time  : {infer_time:.2f}s")
    print(f"  Raw detections  : {len(raw_detections)}")
    print(f"  After filtering : {len(filtered)}")
    print(f"  Final (NMS)     : {len(final_detections)}")

    if torch.cuda.is_available():
        used_vram = torch.cuda.memory_allocated() / (1024**3)
        print(f"  VRAM used       : {used_vram:.2f}GB")

    # --- Save annotated image ---
    if args.save and final_detections:
        output_path = f"test_output_annotated.png"
        annotate_image(image_path, final_detections, output_path)

    separator()
    print("✅ Test complete\n")

    return final_detections


# ============================================================
# ENTRY POINT
# ============================================================

if __name__ == '__main__':
    run_test()