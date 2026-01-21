from flask import Blueprint, request, jsonify, current_app
import os
from app.services.ar_service import extract_document_features
from app.services.granite_vision_service import analyze_images

ar_bp = Blueprint('ar_bp', __name__)

@ar_bp.route('/generate', methods=['POST'])
def generate_ar_overlay():
    data = request.get_json()
    filename = data.get('stored_name')
    if not filename: return jsonify({'error': 'No filename'}), 400
    
    base = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../static/uploads'))
    path = os.path.join(base, filename)
    
    if not os.path.exists(path): return jsonify({'error': 'File not found'}), 404

    segments = extract_document_features(path)
    vision_res = analyze_images(path)
    
    return jsonify({
        'status': 'success', 
        'segments': segments,
        'vision_analysis': vision_res.get('analysis', {})
    })