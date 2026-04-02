from flask import Blueprint, request, jsonify
import logging
import threading

from app.services.preprocess_service import preprocess_service
from app.services.model_manager import manager
from app.utils.shared_utils import resolve_file_path
from app.utils.response_formatter import error_response
from app.utils.validators import ensure_json_object

process_bp = Blueprint('process', __name__)
logger = logging.getLogger(__name__)

# ── Inference queue ────────────────────────────────────────────────────────
# Only one inference runs at a time (GPU serialisation).  Rather than
# returning 503 immediately when busy, incoming requests join a queue and
# wait their turn.  If the queue is already full, *then* we 503.
#
#   _inference_semaphore  — binary semaphore; controls who is running
#   _pending_count        — how many requests are currently waiting
#   _pending_lock         — protects _pending_count
#   _MAX_PENDING          — queue depth limit (requests waiting, not counting
#                           the one actively running)
#   _QUEUE_TIMEOUT        — max seconds a request will wait before giving up
# ──────────────────────────────────────────────────────────────────────────
_inference_semaphore = threading.Semaphore(1)
_pending_lock        = threading.Lock()
_pending_count       = 0
_MAX_PENDING         = 4    # 1 running + up to 4 waiting = 5 in flight
_QUEUE_TIMEOUT       = 300  # 5 minutes — covers large PDFs with many pages


@process_bp.route('/document', methods=['POST'])
def process_document():
    """
    Full document processing pipeline: Vision → AR → AI
    Accepts JSON: { "stored_name": "uuid.pdf" }

    Concurrent requests are queued rather than rejected.  A 503 is only
    returned when the queue is full or a queued request times out.
    """
    global _pending_count

    try:
        data = request.get_json(silent=True) or {}
        ok, message = ensure_json_object(data)
        if not ok:
            body, status = error_response(message, status=400)
            return jsonify(body), status

        stored_name = data.get('stored_name')
        file_path   = data.get('file_path')
        mock        = data.get('mock', False)
        extract_ar  = data.get('extract_ar', True)
        generate_ai = data.get('generate_ai_summary', True)

        # Resolve file path before entering the queue so we fail fast on bad input
        resolved_path, path_error = resolve_file_path(stored_name, file_path)
        if path_error:
            return jsonify(path_error[0]), path_error[1]

        # ── Queue admission ────────────────────────────────────────────────
        with _pending_lock:
            if _pending_count >= _MAX_PENDING:
                logger.warning(
                    f"⏳ Inference queue full ({_pending_count} waiting) — returning 503"
                )
                body, status = error_response(
                    f'Server is busy — {_pending_count} requests already queued. '
                    'Please retry in a moment.',
                    status=503
                )
                return jsonify(body), status
            _pending_count += 1

        logger.info(
            f"📋 Request queued (position ~{_pending_count}): {resolved_path}"
        )

        try:
            # Wait for the inference slot (blocking, with timeout)
            acquired = _inference_semaphore.acquire(
                blocking=True, timeout=_QUEUE_TIMEOUT
            )
            if not acquired:
                logger.warning("⏳ Request timed out waiting in inference queue")
                body, status = error_response(
                    'Request timed out waiting for the server to become free. '
                    'Please retry.',
                    status=503
                )
                return jsonify(body), status

            # ── GPU housekeeping before inference ──────────────────────────
            # Clears fragmented VRAM left over from the previous request
            # without unloading any model weights.
            manager.between_requests_cleanup()

            try:
                logger.info(f"🚀 Starting inference: {resolved_path}")
                result = preprocess_service.preprocess_document(
                    resolved_path,
                    mock=mock,
                    extract_ar=extract_ar,
                    generate_ai_summary=generate_ai
                )
            finally:
                # ── GPU housekeeping after inference ───────────────────────
                # Frees activation/intermediate tensors so the next queued
                # request starts with as much VRAM headroom as possible.
                manager.between_requests_cleanup()
                _inference_semaphore.release()

        finally:
            with _pending_lock:
                _pending_count -= 1

        ok_status = result.get('status') in ['success', 'ok']
        return jsonify(result), (200 if ok_status else 500)

    except Exception:
        logger.exception("Document processing failed")
        body, status = error_response('Document processing failed', status=500)
        return jsonify(body), status


@process_bp.route('/health', methods=['GET'])
def health_check():
    """Health check"""
    return jsonify({'status': 'healthy'}), 200
