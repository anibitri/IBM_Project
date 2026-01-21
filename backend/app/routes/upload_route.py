from flask import Blueprint, request, jsonify
import os
import uuid
from werkzeug.utils import secure_filename
import logging
from PIL import Image

from app.services.preprocess_service import preprocess_document
from app.services.ar_service import extract_document_features
from app.services.granite_vision_service import analyze_images

upload_bp = Blueprint('upload', __name__)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
logger = logging.getLogger(__name__)

@upload_bp.route('/', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file.filename: return jsonify({'error': 'No filename'}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_FOLDER, stored_name)
    file.save(file_path)

    try:
        preprocess_result = preprocess_document(file_path)
    except Exception as e:
        preprocess_result = {'status': 'error', 'error': str(e)}

    return jsonify({
        'status': 'ok',
        'message': 'File uploaded successfully',
        'file': {
            'original_name': file.filename,
            'stored_name': stored_name,
            'url': f"/static/uploads/{stored_name}"
        },
        'preprocess': preprocess_result
    }), 200

@upload_bp.route('/process', methods=['POST'])
def process_document():
    if 'file' not in request.files: return jsonify({'error': 'No file'}), 400
    file = request.files['file']
    filename = secure_filename(file.filename)
    save_path = os.path.join(UPLOAD_FOLDER, filename)
    file.save(save_path)

    try:
        img = Image.open(save_path).convert('RGB')
        # We pass task="ar_extraction" which is now supported in vision_service
        vision_res = analyze_images([img], task="ar_extraction")
        ar_hints = vision_res.get('components', [])
        
        result = extract_document_features(save_path, hints=ar_hints)

        return jsonify({
            'message': 'Document processed',
            'elements': result,
            'vision_summary': vision_res.get('answer', '')
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500