from flask import Blueprint, request, jsonify
import os
import logging
from PIL import Image

# Import the services we created
from services.ar_service import extract_document_features
from services.granite_vision_service import analyze_images

ar_bp = Blueprint('ar', __name__)
logger = logging.getLogger(__name__)

# Resolve paths (standard logic)
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
_ALLOWED_EXTS = {'.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'}

@ar_bp.route('/generate', methods=['POST'])
def generate_ar_elements():
    """
    Standalone endpoint to generate AR Components for an existing file.
    
    Useful if you want to re-run the AR detection without re-uploading the file,
    or if you want to debug the SAM/Granite output in isolation.

    Expected JSON:
    { "stored_name": "uuid.png" }
    """
    data = request.get_json(silent=True) or {}
    stored_name = data.get('stored_name')

    # 1. Validate Input
    if not stored_name or '..' in stored_name:
        return jsonify({'status': 'error', 'error': 'Invalid or missing stored_name'}), 400

    file_path = os.path.join(UPLOAD_FOLDER, os.path.basename(stored_name))
    if not os.path.exists(file_path):
        return jsonify({'status': 'error', 'error': 'File not found'}), 404

    try:
        logger.info(f"Generating AR elements for {stored_name}...")

        # 2. Step A: Get "Hints" from Granite Vision
        # We need Granite to find the bounding boxes first
        img = Image.open(file_path).convert('RGB')
        
        # We use the specialized 'ar_extraction' task we added to the vision service
        vision_res = analyze_images([img], task="ar_extraction")
        
        if vision_res.get('status') == 'error':
            raise Exception(f"Vision Service failed: {vision_res.get('error')}")

        ar_hints = vision_res.get('components', [])
        logger.info(f"Granite found {len(ar_hints)} potential components.")

        # 3. Step B: Refine with SAM (Hybrid Mode)
        # Pass the Granite hints to the AR service to generate perfect polygons
        ar_elements = extract_document_features(file_path, hints=ar_hints)

        # 4. Return the standard response format
        return jsonify({
            'status': 'ok',
            'file': { 'stored_name': stored_name },
            'ar_elements': ar_elements,
            'meta': {
                'count': len(ar_elements),
                'method': 'hybrid_granite_sam'
            }
        }), 200

    except Exception as e:
        logger.exception("AR Generation failed")
        return jsonify({'status': 'error', 'error': str(e)}), 500