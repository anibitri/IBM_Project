from flask import Blueprint, request, jsonify
import os
import logging
# Import the centralized orchestrator
from app.services.preprocess_service import preprocess_document  

vision_bp = Blueprint('vision', __name__)

# Resolve to backend/static/uploads absolute path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Allowed extensions (mirror upload_route)
_ALLOWED_EXTS = {'.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'}

logger = logging.getLogger(__name__)

def _safe_under_uploads(path: str) -> bool:
    """
    Security check to prevent path traversal attacks (e.g. ../../etc/passwd)
    """
    try:
        real_upload = os.path.realpath(UPLOAD_FOLDER)
        real_path = os.path.realpath(path)
        return os.path.commonpath([real_path, real_upload]) == real_upload
    except Exception:
        return False

@vision_bp.route('/analyze', methods=['POST'])
def analyze():
    """
    Run the full Preprocessing Pipeline (Vision -> AR -> AI) on an existing file.
    
    Accepts JSON: 
    { 
      "stored_name": "uuid.png",  <-- Preferred
      "file_path": "...",         <-- Fallback
      "mock": bool                <-- Optional toggle
    }
    """
    payload = request.get_json(silent=True) or {}
    file_path = payload.get('file_path')
    stored_name = payload.get('stored_name')
    mock = payload.get('mock')

    # 1. Resolve stored_name to a real file path
    trusted_from_name = False
    if isinstance(stored_name, str) and stored_name.strip():
        raw_name = stored_name.strip()
        safe_name = os.path.basename(raw_name)
        
        # Security check: filename shouldn't change after sanitization
        if safe_name != raw_name:
            return jsonify({'status': 'error', 'error': 'Invalid stored_name'}), 400
            
        ext = os.path.splitext(safe_name)[1].lower()
        if ext not in _ALLOWED_EXTS:
            return jsonify({'status': 'error', 'error': f'Unsupported file type: {ext}'}), 400
            
        file_path = os.path.join(UPLOAD_FOLDER, safe_name)
        trusted_from_name = True

    # 2. Validate Path
    if not file_path or not isinstance(file_path, str):
        logger.warning('Missing file_path or stored_name')
        return jsonify({'status': 'error', 'error': 'file_path or stored_name is required'}), 400

    file_path = os.path.realpath(file_path.strip())

    if not trusted_from_name and not _safe_under_uploads(file_path):
        return jsonify({
            'status': 'error',
            'error': 'Security Violation: File must be inside static/uploads'
        }), 403

    if not os.path.exists(file_path):
        logger.warning(f'File not found: {file_path}')
        return jsonify({'status': 'error', 'error': 'File not found'}), 404

    # 3. Run Centralized Preprocessing (Vision + AR + AI)
    try:
        pre = preprocess_document(file_path, mock=mock)
    except Exception as e:
        logger.exception("Preprocessing failed during /analyze")
        return jsonify({'status': 'error', 'error': str(e)}), 500

    ok = pre.get('status') == 'success' or pre.get('status') == 'ok'
    status_code = 200 if ok else 500

    # 4. Construct Response (RESTORED LOGIC)
    # This logic bubbles up specific data based on whether it's a PDF or Image
    
    analysis_payload = {'status': 'error', 'error': 'No analysis available'}
    ar_payload = {'status': 'error', 'error': 'No AR elements'}
    
    # Grab AI result from various possible keys
    ai_payload = pre.get('ai') or pre.get('ai_final') or pre.get('ai_initial') or {'status': 'error', 'error': 'No AI result'}
    
    # Metadata for Frontend 3D Viewer (Aspect Ratio, etc.)
    file_meta = {}

    kind = pre.get('type') or pre.get('kind')
    
    if kind == 'image':
        # For images, Vision is the primary analysis
        # Note: In the new service, we might return 'vision_data' or 'ai_summary' inside 'pre'
        if 'ai_summary' in pre:
             analysis_payload = {'summary': pre['ai_summary']}
        
        ar_payload = pre.get('ar') or ar_payload
        if 'meta' in pre:
            file_meta = pre['meta'] 

    elif kind == 'pdf':
        # For PDFs, the Final AI Summary is the primary analysis
        if pre.get('ai_summary'):
            analysis_payload = {'summary': pre['ai_summary']}
        elif pre.get('ai_final'):
            analysis_payload = pre['ai_final']
        
        ar_payload = pre.get('ar') or ar_payload

    return jsonify({
        'status': 'ok' if ok else 'error',
        'file': { 
            'path': file_path,
            'name': os.path.basename(file_path),
            'meta': file_meta 
        },
        'analysis': analysis_payload, # Legacy field (Vision or AI summary)
        'ar': ar_payload,             # The interactive components
        'ai': ai_payload,             # The AI synthesis
        'preprocess': pre             # Full raw debug data
    }), status_code