from flask import Blueprint, request, jsonify

ar_bp = Blueprint('ar', __name__)


@ar_bp.route('/elements', methods=['POST'])
def build_ar_elements():
    """
    Create AR elements from a provided analysis payload.

    Expected JSON body:
    - analysis: string (Granite Vision textual analysis)

    Returns a simple AR element graph that the frontend can render.
    """
    data = request.get_json(silent=True) or {}
    analysis_text = data.get('analysis')

    if not analysis_text or not isinstance(analysis_text, str):
        return jsonify({'status': 'error', 'error': 'Missing or invalid analysis text'}), 400

    # Minimal AR element construction; can be expanded with NLP/entity parsing later
    nodes = [
        {
            'id': 'summary',
            'type': 'text',
            'label': 'Document Summary',
            'content': analysis_text[:500]
        }
    ]
    anchors = []
    connections = []

    return jsonify({
        'status': 'ok',
        'ar_elements': {
            'nodes': nodes,
            'anchors': anchors,
            'connections': connections
        }
    }), 200