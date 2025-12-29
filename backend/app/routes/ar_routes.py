import os
from flask import Blueprint, request, jsonify, current_app
from app.services.ar_service import extract_document_features
from app.services.granite_vision_service import analyze_images

ar_bp = Blueprint('ar_bp', __name__)

@ar_bp.route('/generate', methods=['POST'])
def generate_ar_overlay():
    data = request.get_json()
    if not data or 'stored_name' not in data:
        return jsonify({'error': 'No filename provided'}), 400
    
    filename = data['stored_name']
    
    # Construct absolute path safely
    upload_folder = current_app.config.get('UPLOAD_FOLDER', 'static/uploads')
    file_path = os.path.join(upload_folder, filename)
    file_path = os.path.abspath(file_path) # Ensure it's absolute
    
    if not os.path.exists(file_path):
        print(f"DEBUG: File not found at {file_path}")
        return jsonify({'error': 'File not found', 'path': file_path}), 404

    try:
        print(f"--- AR ROUTE: Processing {filename} ---")
        
        # 1. Run AR (SAM)
        # This returns the list of bounding boxes
        segments = extract_document_features(file_path)
        print(f"--- AR ROUTE: SAM found {len(segments)} segments ---")
        
        # 2. Run Vision (Granite)
        vision_result = analyze_images(file_path)
        vision_summary = vision_result.get('analysis', {}).get('summary', '')

        # 3. Return JSON
        # KEY CHANGE: We use 'segments' instead of 'ar_data' to match the frontend/visualizer
        return jsonify({
            'status': 'success', 
            'segments': segments,           # <--- FIXED KEY
            'vision_analysis': {'summary': vision_summary}
        })

    except Exception as e:
        print(f"ERROR in AR Route: {e}")
        return jsonify({'error': str(e), 'status': 'error'}), 500