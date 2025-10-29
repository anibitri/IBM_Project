from flask import Blueprint, request, jsonify
import os
from services.granite_vision_service import analyze_document
import logging

vision_bp = Blueprint('vision', __name__)

# Resolve to backend/static/uploads absolute path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Allowed extensions (mirror upload_route)
_ALLOWED_EXTS = {'.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'}

def _safe_under_uploads(path: str) -> bool:
	# Use realpath + commonpath to handle symlinks and trailing slashes reliably
	try:
		real_upload = os.path.realpath(UPLOAD_FOLDER)
		real_path = os.path.realpath(path)
		return os.path.commonpath([real_path, real_upload]) == real_upload
	except Exception:
		return False


logger = logging.getLogger(__name__)

@vision_bp.route('/analyze', methods=['POST'])
def analyze():
	"""
	Run Granite Vision analysis on a previously uploaded file.

	Accepts:
	- JSON: { "file_path"?: string, "stored_name"?: string, "prompt"?: string, "mock"?: bool }
	  Prefer "stored_name" returned by /api/upload/ to avoid absolute path issues.

	Returns:
	- {
	    status: 'ok'|'error',
	    file: { path },
	    analysis: { status, answer? , error? },
	    ar: { status, elements? , error? }
	  }
	"""

	
	payload = request.get_json(silent=True) or {}
	file_path = payload.get('file_path')
	stored_name = payload.get('stored_name')
	prompt = payload.get('prompt')
	mock = payload.get('mock')

	logger.info("Analyze request received.")

	# Prefer resolving from stored_name if provided (safer and avoids absolute path mismatches)
	trusted_from_name = False
	if isinstance(stored_name, str) and stored_name.strip():
		raw_name = stored_name.strip()
		safe_name = os.path.basename(raw_name)
		# Reject if caller tries to sneak directories
		if safe_name != raw_name:
			return jsonify({'status': 'error', 'error': 'Invalid stored_name'}), 400
		ext = os.path.splitext(safe_name)[1].lower()
		if ext not in _ALLOWED_EXTS:
			return jsonify({'status': 'error', 'error': f'Unsupported file type: {ext}'}), 400
		file_path = os.path.join(UPLOAD_FOLDER, safe_name)
		trusted_from_name = True

	if not file_path or not isinstance(file_path, str):
		logger.warning('Missing file_path or stored_name')
		return jsonify({'status': 'error', 'error': 'file_path or stored_name is required'}), 400

	# Normalize
	file_path = os.path.realpath(file_path.strip())

	# Only enforce safety check if client passed an absolute file_path
	if not trusted_from_name and not _safe_under_uploads(file_path):
		return jsonify({
			'status': 'error',
			'error': 'file_path must reference an uploaded file under static/uploads'
		}), 403

	if not os.path.exists(file_path):
		logger.warning(f'File not found: {file_path}')
		return jsonify({'status': 'error', 'error': 'File not found'}), 404

	analysis = analyze_document(file_path, prompt=prompt, mock=mock)
	status_ok = analysis.get('status') == 'ok'
	status_code = 200 if status_ok else 500

	# Produce AR elements from the file regardless of analysis outcome
	try:
		from services.ar_service import extract_document_features
		ar_elements = extract_document_features(file_path)
		ar_payload = { 'status': 'ok', 'elements': ar_elements }
	except Exception as e:
		ar_payload = { 'status': 'error', 'error': f'AR extraction failed: {e}' }

	if not status_ok:
		logger.error(f'Analysis error: {analysis.get("error")}')

	return jsonify({
		'status': 'ok' if status_ok else 'error',
		'file': { 'path': file_path },
		'analysis': analysis,
		'ar': ar_payload
	}), status_code

