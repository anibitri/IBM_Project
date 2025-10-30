from flask import Blueprint, request, jsonify
import os
import logging
from services.preprocess_service import preprocess_document  # use centralized extraction/analysis

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
	Run preprocessing + analysis on a previously uploaded file.

	Accepts:
	- JSON: { "file_path"?: string, "stored_name"?: string, "prompt"?: string, "mock"?: bool }
	  Prefer "stored_name" returned by /api/upload/.

	Returns:
	- {
	    status: 'ok'|'error',
	    file: { path },
	    analysis: { status, answer? , error? },   // compatibility
	    ar: { status, elements? , error? },       // compatibility
	    ai: { ... },                               // synthesized AI result
	    preprocess: { ... }                        // full pipeline output
	  }
	"""
	payload = request.get_json(silent=True) or {}
	file_path = payload.get('file_path')
	stored_name = payload.get('stored_name')
	mock = payload.get('mock')

	# Resolve stored_name to path under uploads
	trusted_from_name = False
	if isinstance(stored_name, str) and stored_name.strip():
		raw_name = stored_name.strip()
		safe_name = os.path.basename(raw_name)
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

	file_path = os.path.realpath(file_path.strip())

	if not trusted_from_name and not _safe_under_uploads(file_path):
		return jsonify({
			'status': 'error',
			'error': 'file_path must reference an uploaded file under static/uploads'
		}), 403

	if not os.path.exists(file_path):
		logger.warning(f'File not found: {file_path}')
		return jsonify({'status': 'error', 'error': 'File not found'}), 404

	# Centralized preprocessing
	pre = preprocess_document(file_path, mock=mock)
	ok = pre.get('status') == 'ok'
	status_code = 200 if ok else 500

	# Back-compat fields
	analysis_payload = {'status': 'error', 'error': 'No analysis available'}
	ar_payload = {'status': 'error', 'error': 'No AR elements'}
	ai_payload = pre.get('ai') or pre.get('ai_final') or pre.get('ai_initial') or {'status': 'error', 'error': 'No AI result'}

	kind = pre.get('kind')
	if kind == 'image':
		analysis_payload = pre.get('vision') or analysis_payload
		ar_payload = pre.get('ar') or ar_payload
	elif kind == 'pdf':
		# Prefer final AI as analysis answer for PDFs
		if pre.get('ai_final'):
			analysis_payload = pre['ai_final']
		elif pre.get('ai_initial'):
			analysis_payload = pre['ai_initial']
		ar_payload = pre.get('ar') or ar_payload

	return jsonify({
		'status': 'ok' if ok else 'error',
		'file': { 'path': file_path },
		'analysis': analysis_payload,
		'ar': ar_payload,
		'ai': ai_payload,
		'preprocess': pre
	}), status_code

