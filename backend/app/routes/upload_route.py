from flask import Blueprint, request, jsonify
import os
from werkzeug.utils import secure_filename
from services.granite_vision_service import analyze_document

upload_bp = Blueprint('upload', __name__)   
UPLOAD_FOLDER = 'static/uploads'
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@upload_bp.route('/', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    filename = secure_filename(file.filename or '')
    if not filename or not allowed_file(filename):
        return jsonify({'error': 'Unsupported file type. Allowed: ' + ', '.join(sorted(ALLOWED_EXTENSIONS))}), 400

    file_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(file_path)

    # Optional prompt and mock flag from client
    prompt = request.form.get('prompt') or request.args.get('prompt')
    mock_param = request.form.get('mock') or request.args.get('mock')
    use_mock = None
    if mock_param is not None:
        use_mock = str(mock_param).lower() in ('1', 'true', 'yes', 'y')

    # Run Granite Vision analysis
    analysis = analyze_document(file_path, prompt=prompt, mock=use_mock)

    status_code = 200 if analysis.get('status') == 'ok' else 500
    return jsonify({
        'message': 'File uploaded successfully',
        'file_path': file_path,
        'analysis': analysis
    }), status_code