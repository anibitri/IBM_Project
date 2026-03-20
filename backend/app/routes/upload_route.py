from flask import Blueprint, request, jsonify
import os
import hashlib
import mimetypes
import traceback
from PIL import Image
from werkzeug.exceptions import RequestEntityTooLarge

from app.utils.response_formatter import error_response, success_response

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


def validate_file_content(file, ext: str) -> tuple[bool, str]:
    """Validate file magic/signature instead of trusting extension."""
    try:
        file.stream.seek(0)

        if ext == '.pdf':
            header = file.stream.read(5)
            file.stream.seek(0)
            if header != b'%PDF-':
                return False, 'Invalid PDF file content'
            return True, ''

        # For images, PIL verification ensures the binary can be parsed safely.
        img = Image.open(file.stream)
        img.verify()
        file.stream.seek(0)
        return True, ''

    except Exception:
        file.stream.seek(0)
        return False, 'Invalid or corrupted file content'


def compute_sha256(file) -> str:
    """Compute SHA-256 digest of the uploaded file stream."""
    digest = hashlib.sha256()
    file.stream.seek(0)
    while True:
        chunk = file.stream.read(8192)
        if not chunk:
            break
        digest.update(chunk)
    file.stream.seek(0)
    return digest.hexdigest()


@upload_bp.route('/', methods=['POST'])
def upload_file():
    """
    Upload file endpoint - ONLY handles file upload and storage.
    Does NOT process the file. Returns file metadata for subsequent processing.
    """
    try:
        # Validate request
        if 'file' not in request.files:
            body, status = error_response('No file uploaded', status=400)
            return jsonify(body), status

        file = request.files['file']
        
        if not file.filename:
            body, status = error_response('No filename provided', status=400)
            return jsonify(body), status
        
        # Validate file type
        if not allowed_file(file.filename):
            body, status = error_response(
                f'Invalid file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}',
                status=400
            )
            return jsonify(body), status
        
        # Validate file size
        if not validate_file_size(file):
            body, status = error_response(
                f'File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB',
                status=400
            )
            return jsonify(body), status

        ext = os.path.splitext(file.filename)[1].lower()
        is_valid_content, validation_error = validate_file_content(file, ext)
        if not is_valid_content:
            body, status = error_response(validation_error, status=400)
            return jsonify(body), status

        # Use deterministic hash-based naming for integrity and dedup.
        file_hash = compute_sha256(file)
        stored_name = f"{file_hash}{ext}"
        file_path = os.path.join(UPLOAD_FOLDER, stored_name)
        is_duplicate = os.path.exists(file_path)
        if not is_duplicate:
            file.save(file_path)
        
        file_size = os.path.getsize(file_path)
        file_type = mimetypes.guess_type(file.filename)[0]
        
        print(f"📁 File uploaded: {stored_name} ({file_size} bytes) duplicate={is_duplicate}")

        return jsonify(success_response({
            'file': {
                'original_name': file.filename,
                'stored_name': stored_name,
                'path': file_path,
                'url': f"/static/uploads/{stored_name}",
                'size': file_size,
                'type': file_type,
                'extension': ext,
                'sha256': file_hash,
                'is_duplicate': is_duplicate
            }
        }, message='File uploaded successfully')), 200

    except Exception as e:
        if isinstance(e, RequestEntityTooLarge):
            body, status = error_response(
                f'File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB',
                status=413,
            )
            return jsonify(body), status

        print(f"❌ Upload error: {e}")
        traceback.print_exc()
        body, status = error_response('Upload failed', status=500)
        return jsonify(body), status


@upload_bp.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'upload_folder_exists': os.path.exists(UPLOAD_FOLDER),
        'upload_folder_writable': os.access(UPLOAD_FOLDER, os.W_OK)
    }), 200