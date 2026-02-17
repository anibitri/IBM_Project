from flask import Blueprint, request, jsonify
import logging
import traceback
from PIL import Image

from app.services.granite_vision_service import analyze_images
from app.utils.shared_utils import resolve_file_path

vision_bp = Blueprint('vision', __name__)
logger = logging.getLogger(__name__)


@vision_bp.route('/analyze', methods=['POST'])
def analyze():
    """
    Analyze image using vision model.
    
    Accepts JSON:
    {
        "stored_name": "uuid.png",  // Required (or file_path)
        "task": "ar_extraction"  // Optional: analysis task type
    }
    """
    try:
        data = request.get_json(silent=True) or {}
        stored_name = data.get('stored_name')
        file_path = data.get('file_path')
        task = data.get('task', 'general_analysis')
        
        # Resolve file path
        resolved_path, error = resolve_file_path(stored_name, file_path)
        if error:
            return jsonify(error[0]), error[1]
        
        logger.info(f"🔍 Vision analysis: {resolved_path} [Task: {task}]")
        
        # Analyze image
        vision_result = analyze_images(resolved_path, task=task)
        
        # Ensure consistent response format
        if not isinstance(vision_result, dict):
            return jsonify({
                'status': 'error',
                'error': 'Invalid vision service response'
            }), 500
        
        # Check for error in vision result
        if vision_result.get('status') == 'error':
            return jsonify(vision_result), 500
        
        return jsonify({
            'status': 'success',
            'analysis': vision_result.get('analysis', {}),
            'components': vision_result.get('components', []),
            'answer': vision_result.get('answer', ''),
            'file': {
                'path': resolved_path
            }
        }), 200
    
    except Exception as e:
        logger.exception("Vision analysis failed")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'details': traceback.format_exc()
        }), 500


@vision_bp.route('/batch-analyze', methods=['POST'])
def batch_analyze():
    """
    Analyze multiple images in batch.
    
    Accepts JSON:
    {
        "stored_names": ["file1.png", "file2.png"],  // Required
        "task": "ar_extraction"  // Optional
    }
    """
    try:
        data = request.get_json(silent=True) or {}
        stored_names = data.get('stored_names', [])
        task = data.get('task', 'general_analysis')
        
        if not stored_names:
            return jsonify({
                'status': 'error',
                'error': 'stored_names array is required'
            }), 400
        
        logger.info(f"🔍 Batch vision analysis: {len(stored_names)} files")
        
        results = []
        
        for stored_name in stored_names:
            try:
                # Resolve file
                resolved_path, error = resolve_file_path(stored_name=stored_name)
                if error:
                    results.append({
                        'file': stored_name,
                        'status': 'error',
                        'error': error[0]['error']
                    })
                    continue
                
                # Analyze
                vision_result = analyze_images(resolved_path, task=task)
                
                results.append({
                    'file': stored_name,
                    'status': 'success',
                    'analysis': vision_result.get('analysis', {}),
                    'components': vision_result.get('components', []),
                    'answer': vision_result.get('answer', '')
                })
                
            except Exception as e:
                logger.error(f"Failed to analyze {stored_name}: {e}")
                results.append({
                    'file': stored_name,
                    'status': 'error',
                    'error': str(e)
                })
        
        return jsonify({
            'status': 'success',
            'results': results,
            'totalFiles': len(stored_names),
            'successCount': sum(1 for r in results if r['status'] == 'success')
        }), 200
    
    except Exception as e:
        logger.exception("Batch vision analysis failed")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@vision_bp.route('/health', methods=['GET'])
def health_check():
    """Check if vision model is loaded"""
    from app.services.model_manager import manager
    
    is_loaded = manager.vision_model is not None and manager.vision_processor is not None
    
    return jsonify({
        'status': 'healthy' if is_loaded else 'degraded',
        'vision_model_loaded': is_loaded
    }), 200