from flask import Blueprint, request, jsonify
import os
import logging
# Updated Import: Use pypdf instead of deprecated PyPDF2
from pypdf import PdfReader 

from app.services.granite_ai_service import analyze_context as ai_analyze

ai_bp = Blueprint('ai', __name__)
logger = logging.getLogger(__name__)

# Mirror uploads path resolution used elsewhere
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

_ALLOWED_EXTS = {'.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'}

def _safe_under_uploads(path: str) -> bool:
    # Consistent path safety
    try:
        real_upload = os.path.realpath(UPLOAD_FOLDER)
        real_path = os.path.realpath(path)
        return os.path.commonpath([real_path, real_upload]) == real_upload
    except Exception:
        return False

def _extract_pdf_text(file_path: str, max_chars: int = 12000) -> str:
    # Lightweight text extraction to support AI when no text is provided
    try:
        reader = PdfReader(file_path)
        parts = []
        total = 0
        for page in reader.pages:
            txt = page.extract_text() or ""
            if txt:
                parts.append(txt)
                total += len(txt)
            if total > max_chars:
                break
        text = "\n".join(parts)
        return text[:max_chars]
    except Exception as e:
        logger.warning(f'AI route PDF text extraction failed: {e}')
        return ""

@ai_bp.route('/analyze', methods=['POST'])
def analyze():
    """
    Synthesize document understanding using AI from provided context.

    Accepts JSON:
    {
        "stored_name"?: string,
        "file_path"?: string,
        "text_excerpt"?: string,
        "vision"?: { 
            "vision_answer"?: str, 
            "ar_elements"?: list,  <-- New: List of components for AR context
            "meta"?: any 
        },
        "mock"?: bool
    }

    Returns:
    { status: 'ok'|'error', ai: { status, answer? , error?, meta? }, file?: { path } }
    """
    payload = request.get_json(silent=True) or {}
    stored_name = payload.get('stored_name')
    file_path = payload.get('file_path')
    text_excerpt = (payload.get('text_excerpt') or '').strip()
    
    # This 'vision' object is passed directly to the Granite AI Service.
    # It must contain 'ar_elements' for the AI to mention interactive parts.
    vision = payload.get('vision') or {}
    
    mock = payload.get('mock')

    # Resolve from stored_name if provided
    if isinstance(stored_name, str) and stored_name.strip():
        raw_name = stored_name.strip()
        safe_name = os.path.basename(raw_name)
        if safe_name != raw_name:
            return jsonify({'status': 'error', 'error': 'Invalid stored_name'}), 400
        ext = os.path.splitext(safe_name)[1].lower()
        if ext not in _ALLOWED_EXTS:
            return jsonify({'status': 'error', 'error': f'Unsupported file type: {ext}'}), 400
        file_path = os.path.join(UPLOAD_FOLDER, safe_name)

    # Validate path if any provided
    resolved_path = None
    if isinstance(file_path, str) and file_path.strip():
        resolved_path = os.path.realpath(file_path.strip())
        if not _safe_under_uploads(resolved_path):
            return jsonify({'status': 'error', 'error': 'file_path must be within static/uploads'}), 403
        if not os.path.exists(resolved_path):
            return jsonify({'status': 'error', 'error': 'File not found'}), 404

    # If we have no text excerpt and the file is a PDF, try to extract text
    if not text_excerpt and resolved_path and resolved_path.lower().endswith('.pdf'):
        text_excerpt = _extract_pdf_text(resolved_path)

    # Call the service (which now supports AR context injection)
    try:
        ai_result = ai_analyze(text_excerpt=text_excerpt or "", vision=vision, mock=mock)
    except Exception as e:
        logger.exception("AI Analysis Service crashed")
        return jsonify({'status': 'error', 'error': str(e)}), 500

    status_ok = ai_result.get('status') == 'ok'
    return jsonify({
        'status': 'ok' if status_ok else 'error',
        'file': ({'path': resolved_path} if resolved_path else None),
        'ai': ai_result
    }), 200 if status_ok else 500


# ... (Keep existing imports) ...
# Import the new function
from app.services.granite_ai_service import analyze_context as ai_analyze, chat_with_document
# --- 2. NEW CHAT ROUTE (Add this) ---
@ai_bp.route('/ask', methods=['POST'])
def ask():
    """
    Conversational endpoint.
    Expected JSON:
    {
        "query": "What does this valve do?",
        "context": {
            "text_excerpt": "...",
            "vision_answer": "...",
            "ar_elements": [...],
            "focused_component": { "label": "Valve A", "description": "..." } (Optional)
        },
        "history": [], # Optional previous chat messages
        "mock": bool
    }
    """
    payload = request.get_json(silent=True) or {}
    
    query = payload.get('query')
    context = payload.get('context') or {}
    history = payload.get('history') or []
    mock = payload.get('mock')

    if not query:
        return jsonify({'status': 'error', 'error': 'Query string is required'}), 400

    try:
        # Call the new chat function in the service
        result = chat_with_document(query, context, chat_history=history, mock=mock)
        status_code = 200 if result.get('status') == 'ok' else 500
        return jsonify(result), status_code

    except Exception as e:
        logger.exception("Chat endpoint failed")
        return jsonify({'status': 'error', 'error': str(e)}), 500