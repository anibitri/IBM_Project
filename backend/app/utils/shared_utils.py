import os
from typing import Tuple, Optional

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')


def safe_under_uploads(path: str) -> bool:
    """Security check to prevent path traversal attacks"""
    try:
        real_upload = os.path.realpath(UPLOAD_FOLDER)
        real_path = os.path.realpath(path)
        return os.path.commonpath([real_path, real_upload]) == real_upload
    except Exception:
        return False


def resolve_file_path(
    stored_name: str = None, 
    file_path: str = None
) -> Tuple[Optional[str], Optional[Tuple[dict, int]]]:
    """
    Resolve and validate file path from stored_name or file_path.
    
    Returns:
        (resolved_path, error_tuple) - error_tuple is (response_dict, status_code) if error
    """
    # Prefer stored_name
    if stored_name:
        safe_name = os.path.basename(stored_name.strip())
        
        # Security check
        if safe_name != stored_name.strip():
            return None, ({'status': 'error', 'error': 'Invalid stored_name'}, 400)
        
        resolved_path = os.path.join(UPLOAD_FOLDER, safe_name)
    
    elif file_path:
        resolved_path = os.path.realpath(file_path.strip())
        
        # Security check
        if not safe_under_uploads(resolved_path):
            return None, ({
                'status': 'error',
                'error': 'Security violation: file must be in uploads folder'
            }, 403)
    
    else:
        return None, ({
            'status': 'error', 
            'error': 'stored_name or file_path required'
        }, 400)
    
    # Check existence
    if not os.path.exists(resolved_path):
        return None, ({'status': 'error', 'error': 'File not found'}, 404)
    
    return resolved_path, None