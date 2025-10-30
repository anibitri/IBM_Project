from flask import Blueprint, request, jsonify
import os
import uuid
from werkzeug.utils import secure_filename
import logging

upload_bp = Blueprint('upload', __name__)   
# Resolve to backend/static/uploads absolute path to avoid CWD issues
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

logger = logging.getLogger(__name__)

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@upload_bp.route('/', methods=['POST'])
def upload_file():
    """
    Handle file upload only. Returns stored file info.
    Triggers preprocessing and returns its result under 'preprocess'.

    Optional query param:
      - mock=1|true to force mock processing regardless of environment
    """
    logger.info("Upload request received.")

    # Read mock toggle from query string; fallback to env if not provided
    mock_q = (request.args.get('mock') or '').strip().lower()
    mock = True if mock_q in ('1', 'true', 'yes') else (os.getenv("GRANITE_MOCK") == "1")
    logger.info(f"Preprocess mock mode: {mock}")

    if 'file' not in request.files:
        return jsonify({'status': 'error', 'error': 'No file uploaded'}), 400

    file = request.files['file']
    original_name = secure_filename(file.filename or '')
    if not original_name or not allowed_file(original_name):
        return jsonify({'status': 'error', 'error': 'Unsupported file type. Allowed: ' + ', '.join(sorted(ALLOWED_EXTENSIONS))}), 400

    # Use a unique filename to avoid collisions
    ext = os.path.splitext(original_name)[1].lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_FOLDER, stored_name)
    file.save(file_path)

    logger.info(f"File uploaded: {file_path}")

    # Kick off preprocessing orchestrator
    try:
        from services.preprocess_service import preprocess_document
        preprocess_result = preprocess_document(file_path, mock=mock)
    except Exception as e:
        logger.exception('Preprocessing invocation failed')
        preprocess_result = {'status': 'error', 'error': f'Preprocess call failed: {e}'}

    return jsonify({
        'status': 'ok',
        'message': 'File uploaded successfully',
        'file': {
            'original_name': original_name,
            'stored_name': stored_name,
            'path': file_path
        },
        'preprocess': preprocess_result
    }), 200

@upload_bp.route('/process', methods=['POST'])
def process_document():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    filename = secure_filename(file.filename)
    save_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(save_path)

    # Extract data for AR representation
    from services.ar_service import extract_document_features
    result = extract_document_features(save_path)

    return jsonify({
        'message': 'Document processed',
        'elements': result
    })
