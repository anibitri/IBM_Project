"""
test_ar_visual.py

Visual test for AR service - shows detected components with bounding boxes.
Saves an annotated output image showing exactly what was detected.

Usage:
    python test_ar_visual.py --image path/to/image.png
    python test_ar_visual.py --image path/to/image.png --debug
"""

import os
import sys
import argparse
from PIL import Image, ImageDraw, ImageFont
import random

# Add backend to path
BACKEND_ROOT = os.path.abspath(os.path.dirname(__file__))
sys.path.insert(0, BACKEND_ROOT)

# Set environment before any imports
# os.environ['HF_HOME'] = "/dcs/large/u2287990/AI_models"
# os.environ['GRANITE_MOCK'] = '0'


# ═══════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════

def draw_bounding_boxes(
    image_path: str,
    components: list,
    output_path: str = "ar_output_annotated.png"
):
    """
    Draw bounding boxes on image showing detected components.
    
    Args:
        image_path: Original image path
        components: List of detected components
        output_path: Where to save annotated image
    """
    img = Image.open(image_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    img_w, img_h = img.size
    
    # Color palette (bright colors for visibility)
    colors = [
        (0, 255, 0),      # Green
        (255, 0, 0),      # Red
        (0, 0, 255),      # Blue
        (255, 255, 0),    # Yellow
        (255, 0, 255),    # Magenta
        (0, 255, 255),    # Cyan
        (255, 128, 0),    # Orange
        (128, 0, 255),    # Purple
        (255, 192, 203),  # Pink
        (0, 255, 128),    # Spring Green
    ]
    
    # Try to load a font, fallback to default
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except:
        font = ImageFont.load_default()
    
    print(f"\n📐 Drawing {len(components)} components on image...")
    
    for i, comp in enumerate(components):
        color = colors[i % len(colors)]
        
        # Convert normalized coordinates to pixels
        x = comp['x'] * img_w
        y = comp['y'] * img_h
        w = comp['width'] * img_w
        h = comp['height'] * img_h
        
        x1, y1 = int(x), int(y)
        x2, y2 = int(x + w), int(y + h)
        
        # Draw bounding box (thick line)
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        
        # Draw label background
        label = comp.get('label', comp['id'])
        conf = comp.get('confidence', 0)
        label_text = f"{label} ({conf:.2f})"
        
        # Get text size
        bbox = draw.textbbox((0, 0), label_text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        # Label background rectangle
        label_bg = [x1, y1 - text_height - 6, x1 + text_width + 6, y1]
        draw.rectangle(label_bg, fill=color)
        
        # Label text
        draw.text((x1 + 3, y1 - text_height - 3), label_text, fill=(255, 255, 255), font=font)
        
        # Draw center point
        cx = int(comp['center_x'] * img_w)
        cy = int(comp['center_y'] * img_h)
        draw.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=color)
    
    # Save
    img.save(output_path)
    print(f"✅ Saved annotated image: {output_path}")
    return output_path


def print_component_table(components: list):
    """Print a nice table of detected components"""
    if not components:
        print("⚠️  No components detected")
        return
    
    print(f"\n📊 DETECTED COMPONENTS ({len(components)}):")
    print("=" * 100)
    print(f"{'ID':<18} {'Label':<25} {'Confidence':>10}  {'Position (x,y)':<20}  {'Size (w×h)':<20}")
    print("=" * 100)
    
    for comp in components:
        comp_id = comp['id']
        label = comp.get('label', 'Unknown')[:24]
        conf = comp['confidence']
        x, y = comp['x'], comp['y']
        w, h = comp['width'], comp['height']
        
        pos = f"({x:.3f}, {y:.3f})"
        size = f"({w:.3f} × {h:.3f})"
        
        print(f"{comp_id:<18} {label:<25} {conf:>10.4f}  {pos:<20}  {size:<20}")
    
    print("=" * 100)


def print_statistics(components: list, img_width: int, img_height: int):
    """Print detection statistics"""
    if not components:
        return
    
    print(f"\n📈 STATISTICS:")
    print(f"   Total Components : {len(components)}")
    print(f"   Image Size       : {img_width} × {img_height} px")
    
    confidences = [c['confidence'] for c in components]
    print(f"   Avg Confidence   : {sum(confidences) / len(confidences):.4f}")
    print(f"   Max Confidence   : {max(confidences):.4f}")
    print(f"   Min Confidence   : {min(confidences):.4f}")
    
    areas = [c['area'] for c in components]
    print(f"   Avg Component %  : {sum(areas) / len(areas) * 100:.2f}% of image")
    print(f"   Largest Component: {max(areas) * 100:.2f}% of image")
    print(f"   Smallest Component: {min(areas) * 100:.2f}% of image")


# ═══════════════════════════════════════════════════════════
# MAIN TEST
# ═══════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description='Visual AR Service Test')
    parser.add_argument('--image', type=str, required=True, help='Path to test image')
    parser.add_argument('--output', type=str, default='', help='Output path (auto-named if omitted)')
    parser.add_argument('--debug', action='store_true', help='Enable debug mode')
    parser.add_argument('--hints', type=str, default='', help='Comma-separated hints')
    parser.add_argument('--version', type=str, choices=['v1', 'v2'], default='v2',
                        help='AR service version: v2 = ar_service (default), v1 = ARv1')
    args = parser.parse_args()
    
    print("\n" + "=" * 60)
    print("  AR SERVICE VISUAL TEST")
    print("=" * 60)
    
    # Validate image
    if not os.path.exists(args.image):
        print(f"❌ Image not found: {args.image}")
        sys.exit(1)
    
    img = Image.open(args.image)
    img_width, img_height = img.size
    print(f"\n📷 Image: {args.image}")
    print(f"   Size: {img_width} × {img_height} px")
    print(f"   Version: {args.version.upper()}")

    # Parse hints
    hints = [h.strip() for h in args.hints.split(',') if h.strip()] if args.hints else []
    if hints:
        print(f"   Hints: {hints}")

    # Enable debug mode if requested
    if args.debug:
        print("\n🔍 DEBUG MODE ENABLED")

    # Load the requested AR service version
    print("\n⏳ Loading AR service...")
    if args.version == 'v1':
        from app.services.ARv1 import ar_service
        print("   Using: app.services.ARv1")
    else:
        from app.services.ar_service import ar_service
        print("   Using: app.services.ar_service")

    # Enable debug if requested — v1 uses debug_complexity, v2 uses debug
    if args.debug:
        if hasattr(ar_service, 'debug_complexity'):
            ar_service.debug_complexity = True
        if hasattr(ar_service, 'debug'):
            ar_service.debug = True

    # Run AR extraction
    print("\n🎯 Running AR extraction...")
    print("-" * 60)

    import time
    start = time.time()
    result = ar_service.extract_document_features(args.image, hints=hints)
    elapsed = time.time() - start

    print("-" * 60)
    print(f"⏱️  Extraction took {elapsed:.2f}s")

    # v2 returns {'components': [...], ...}; v1 returns the list directly
    print(f"\n🔎 Raw result type: {type(result).__name__}", end="")
    if isinstance(result, dict):
        components = result.get('components', [])
        print(f"  keys={list(result.keys())}")
    elif isinstance(result, list):
        components = result
        print(f"  length={len(result)}")
    else:
        components = []
        print(f"  value={result!r}")

    if not components:
        print("\n❌ No components detected!")
        print("\nTroubleshooting:")
        print("  1. Check if image has clear, distinct components")
        print("  2. Try lowering confidence_threshold in ar_service.py")
        print("  3. Try lowering min_box_area")
        print("  4. Enable --debug mode to see filtering details")
        sys.exit(0)
    
    # Print results
    print_component_table(components)
    print_statistics(components, img_width, img_height)
    
    # Analyze relationships
    # print("\n🔗 Analyzing spatial relationships...")
    # relationships = ar_service.analyze_component_relationships(components)
    
    # connections = relationships.get('connections', [])
    # if connections:
    #     print(f"   Found {len(connections)} close component pairs:")
    #     for conn in connections[:5]:  # Show first 5
    #         print(f"      {conn['from']} ↔ {conn['to']} (distance: {conn['distance']:.3f})")
    #     if len(connections) > 5:
    #         print(f"      ... and {len(connections) - 5} more")
    # else:
    #     print("   No close component pairs detected")
    
    # Build output path: use explicit --output if given, otherwise auto-name
    # as  <image_stem>_ar_<version>.png  so v1 and v2 results don't overwrite each other.
    if args.output:
        output_path_final = args.output
    else:
        base = os.path.splitext(os.path.basename(args.image))[0]
        output_path_final = f"{base}_ar_{args.version}.png"

    # Draw bounding boxes
    print(f"\n🎨 Creating annotated visualization...")
    output_path = draw_bounding_boxes(args.image, components, output_path_final)
    
    # Summary
    print("\n" + "=" * 60)
    print("✅ TEST COMPLETE")
    print("=" * 60)
    print(f"   Components Detected : {len(components)}")
    print(f"   Annotated Image     : {output_path}")
    #print(f"   Relationships       : {len(connections)} connections")
    print("=" * 60 + "\n")


if __name__ == '__main__':
    main()