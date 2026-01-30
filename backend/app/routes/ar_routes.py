from flask import Blueprint, request, jsonify
import os
from app.services.ar_service import extract_document_features
from app.services.granite_vision_service import analyze_images

ar_bp = Blueprint('ar_bp', __name__)

@ar_bp.route('/generate', methods=['POST'])
def generate_ar_overlay():
    data = request.get_json(silent=True) or {}
    filename = data.get('stored_name')
    if not filename:
        return jsonify({'error': 'No filename'}), 400

    base = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../static/uploads'))
    path = os.path.join(base, os.path.basename(filename))

    if not os.path.exists(path):
        return jsonify({'error': 'File not found'}), 404

    vision_res = analyze_images(path)
    if not isinstance(vision_res, dict):
        vision_res = {}

    vision_analysis = vision_res.get('analysis')
    if not isinstance(vision_analysis, dict):
        vision_analysis = {}

    ar_hints = vision_res.get('components')
    if not isinstance(ar_hints, list):
        ar_hints = []

    segments = extract_document_features(path, hints=ar_hints)

    return jsonify({
        'status': 'success',
        'segments': segments,
        'vision_analysis': vision_analysis
    })
