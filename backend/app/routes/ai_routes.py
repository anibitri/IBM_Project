from flask import Blueprint, request, jsonify
from app.services.granite_ai_service import analyze_context as ai_analyze, chat_with_document

ai_bp = Blueprint('ai', __name__)

@ai_bp.route('/analyze', methods=['POST'])
def analyze():
    payload = request.get_json(silent=True) or {}
    text_excerpt = (payload.get('text_excerpt') or '').strip()
    vision = payload.get('vision') or {}
    
    res = ai_analyze(text_excerpt=text_excerpt, vision=vision)
    return jsonify({'status': 'ok', 'ai': res})

@ai_bp.route('/ask', methods=['POST'])
def ask():
    payload = request.get_json(silent=True) or {}
    query = payload.get('query')
    context = payload.get('context')
    history = payload.get('history', [])
    
    if not query: return jsonify({'error': 'Query required'}), 400
    
    result = chat_with_document(query, context, chat_history=history)
    return jsonify(result)