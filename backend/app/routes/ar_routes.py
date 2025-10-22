from flask import Blueprint, request, jsonify
from services.granite_vision_service import analyze_scene

ar_bp = Blueprint('ar', __name__)

@ar_bp.route('/analyze', methods=['POST'])
def analyze():
    data = request.get_json()
    if not data or 'scene_data' not in data:
        return jsonify({'error': 'No scene data provided'}), 400

    scene_data = data['scene_data']
    analysis_result = analyze_scene(scene_data)

    return jsonify({'analysis': analysis_result}), 200