from flask import Blueprint, request, jsonify
import os
import uuid
from werkzeug.utils import secure_filename
import mimetypes
import traceback

upload_bp = Blueprint('upload', __name__)

# Configuration
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static/uploads')
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed"""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def validate_file_size(file) -> bool:
    """Validate file size"""
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    return size <= MAX_FILE_SIZE


@upload_bp.route('/', methods=['POST'])
def upload_file():
    """
    Upload file endpoint - ONLY handles file upload and storage.
    Does NOT process the file. Returns file metadata for subsequent processing.
    """
    try:
        # Validate request
        if 'file' not in request.files:
            return jsonify({
                'status': 'error',
                'error': 'No file uploaded'
            }), 400

        file = request.files['file']
        
        if not file.filename:
            return jsonify({
                'status': 'error',
                'error': 'No filename provided'
            }), 400
        
        # Validate file type
        if not allowed_file(file.filename):
            return jsonify({
                'status': 'error',
                'error': f'Invalid file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400
        
        # Validate file size
        if not validate_file_size(file):
            return jsonify({
                'status': 'error',
                'error': f'File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB'
            }), 400

        # Save file with unique name
        ext = os.path.splitext(file.filename)[1].lower()
        stored_name = f"{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(UPLOAD_FOLDER, stored_name)
        file.save(file_path)
        
        file_size = os.path.getsize(file_path)
        file_type = mimetypes.guess_type(file.filename)[0]
        
        print(f"📁 File uploaded: {stored_name} ({file_size} bytes)")

        return jsonify({
            'status': 'success',
            'message': 'File uploaded successfully',
            'file': {
                'original_name': file.filename,
                'stored_name': stored_name,
                'path': file_path,
                'url': f"/static/uploads/{stored_name}",
                'size': file_size,
                'type': file_type,
                'extension': ext
            }
        }), 200

    except Exception as e:
        print(f"❌ Upload error: {e}")
        traceback.print_exc()
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@upload_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'upload_folder_exists': os.path.exists(UPLOAD_FOLDER),
        'upload_folder_writable': os.access(UPLOAD_FOLDER, os.W_OK)
    }), 200