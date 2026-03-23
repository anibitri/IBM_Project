from flask import Blueprint, request, jsonify
import logging
import threading

from app.services.preprocess_service import preprocess_service
from app.utils.shared_utils import resolve_file_path
from app.utils.response_formatter import error_response
from app.utils.validators import ensure_json_object

process_bp = Blueprint('process', __name__)
logger = logging.getLogger(__name__)

# Serialise concurrent model-inference requests so they don't compete for VRAM.
# A second request that arrives while one is already running gets a 503 response
# rather than causing an OOM crash on the GPU.
_inference_semaphore = threading.Semaphore(1)


@process_bp.route('/document', methods=['POST'])
def process_document():
    """
    Full document processing pipeline: Vision → AR → AI
    Accepts JSON: { "stored_name": "uuid.pdf" }
    """
    try:
        data = request.get_json(silent=True) or {}
        ok, message = ensure_json_object(data)
        if not ok:
            body, status = error_response(message, status=400)
            return jsonify(body), status

        stored_name = data.get('stored_name')
        file_path = data.get('file_path')
        mock = data.get('mock', False)
        extract_ar = data.get('extract_ar', True)
        generate_ai = data.get('generate_ai_summary', True)
        
        # Resolve file path
        resolved_path, error = resolve_file_path(stored_name, file_path)
        if error:
            return jsonify(error[0]), error[1]
        
        logger.info(f"📋 Processing document: {resolved_path}")

        # Acquire inference slot — reject immediately if one is already running
        acquired = _inference_semaphore.acquire(blocking=False)
        if not acquired:
            logger.warning("⏳ Inference already in progress — returning 503")
            body, status = error_response(
                'Another document is currently being processed. Please retry shortly.',
                status=503
            )
            return jsonify(body), status

        try:
            # Run preprocessing pipeline
            result = preprocess_service.preprocess_document(
                resolved_path,
                mock=mock,
                extract_ar=extract_ar,
                generate_ai_summary=generate_ai
            )
        finally:
            _inference_semaphore.release()
        
        # Determine status code
        ok = result.get('status') in ['success', 'ok']
        status_code = 200 if ok else 500
        
        return jsonify(result), status_code
    
    except Exception as e:
        logger.exception("Document processing failed")
        body, status = error_response('Document processing failed', status=500)
        return jsonify(body), status


@process_bp.route('/health', methods=['GET'])
def health_check():
    """Health check"""
    return jsonify({'status': 'healthy'}), 200