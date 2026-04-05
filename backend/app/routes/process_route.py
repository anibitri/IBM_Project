from flask import Blueprint, request, jsonify
import logging
import threading
import time
import uuid

from app.services.preprocess_service import preprocess_service, ProcessingCancelled
from app.services.model_manager import manager
from app.utils.shared_utils import resolve_file_path
from app.utils.response_formatter import error_response
from app.utils.validators import ensure_json_object

process_bp = Blueprint('process', __name__)
logger = logging.getLogger(__name__)

# ── Inference queue ────────────────────────────────────────────────────────
# Only one inference runs at a time (GPU serialisation).
# Background threads queue themselves; the HTTP handlers return immediately.
# ──────────────────────────────────────────────────────────────────────────
_inference_semaphore = threading.Semaphore(1)
_pending_lock        = threading.Lock()
_pending_count       = 0
_MAX_PENDING         = 4      # max jobs waiting (not counting the one running)
_QUEUE_TIMEOUT       = 14400  # 4 hours — allow slow GPU jobs to wait their turn

# ── Job store ─────────────────────────────────────────────────────────────
# Tracks every submitted job:  job_id → {status, result, cancel_event, ts}
# Jobs expire after _JOB_TTL seconds and are pruned lazily.
# ─────────────────────────────────────────────────────────────────────────
_job_store      = {}
_job_store_lock = threading.Lock()
_JOB_TTL        = 7200  # 2 hours

# ── Cancellation registry ─────────────────────────────────────────────────
# Maps job_id → threading.Event so the pipeline can be stopped mid-run.
# ─────────────────────────────────────────────────────────────────────────
_cancellation_registry = {}
_registry_lock         = threading.Lock()


# ── Helpers ───────────────────────────────────────────────────────────────

def _cleanup_old_jobs():
    cutoff = time.time() - _JOB_TTL
    with _job_store_lock:
        stale = [jid for jid, j in _job_store.items() if j['created_at'] < cutoff]
        for jid in stale:
            del _job_store[jid]
    if stale:
        logger.debug(f"🧹 Pruned {len(stale)} stale job(s)")


def _run_processing_job(job_id, resolved_path, mock, extract_ar, generate_ai, cancel_event):
    """Background worker: waits for the GPU slot then runs the pipeline."""
    global _pending_count

    def _set_status(status, result=None):
        with _job_store_lock:
            if job_id in _job_store:
                _job_store[job_id]['status'] = status
                _job_store[job_id]['result'] = result

    with _pending_lock:
        _pending_count += 1

    try:
        acquired = _inference_semaphore.acquire(blocking=True, timeout=_QUEUE_TIMEOUT)
        if not acquired:
            logger.warning(f"⏳ Job {job_id} timed out waiting in inference queue")
            _set_status('error', {'status': 'error', 'error': 'Timed out waiting for GPU slot'})
            return

        _set_status('processing')
        manager.between_requests_cleanup()

        try:
            logger.info(f"🚀 Starting inference: {resolved_path} (job {job_id})")
            result = preprocess_service.preprocess_document(
                resolved_path,
                mock=mock,
                extract_ar=extract_ar,
                generate_ai_summary=generate_ai,
                cancellation_event=cancel_event,
            )
            final_status = 'success' if result.get('status') in ('success', 'ok') else 'error'
            _set_status(final_status, result)
            logger.info(f"✅ Job {job_id} finished with status: {final_status}")

        except ProcessingCancelled:
            logger.info(f"🛑 Job {job_id} was cancelled")
            _set_status('cancelled')

        except Exception:
            logger.exception(f"Job {job_id} failed during inference")
            _set_status('error', {'status': 'error', 'error': 'Processing failed'})

        finally:
            manager.between_requests_cleanup()
            _inference_semaphore.release()

    except Exception:
        logger.exception(f"Job {job_id} failed before acquiring GPU slot")
        _set_status('error', {'status': 'error', 'error': 'Unexpected error'})

    finally:
        with _pending_lock:
            _pending_count -= 1
        with _registry_lock:
            _cancellation_registry.pop(job_id, None)


# ── Routes ────────────────────────────────────────────────────────────────

@process_bp.route('/start', methods=['POST'])
def start_processing():
    """
    Submit a document for processing.  Returns immediately with a job_id.
    The client should poll GET /process/status/<job_id> for the result.

    Accepts JSON: { "stored_name": "uuid.pdf", "extract_ar": true, "generate_ai_summary": true }
    Returns: { "job_id": "<uuid>", "status": "queued" }
    """
    _cleanup_old_jobs()

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

    # Accept a client-supplied job_id (for idempotency) or generate one
    job_id = data.get('job_id') or str(uuid.uuid4())

    resolved_path, path_error = resolve_file_path(stored_name, file_path)
    if path_error:
        return jsonify(path_error[0]), path_error[1]

    # Reject immediately if the queue is already full
    with _pending_lock:
        if _pending_count >= _MAX_PENDING:
            logger.warning(f"⏳ Queue full ({_pending_count} waiting) — rejecting job {job_id}")
            body, status = error_response(
                f'Server is busy — {_pending_count} jobs already queued. Please retry.',
                status=503
            )
            return jsonify(body), status

    # Register the cancellation event
    cancel_event = threading.Event()
    with _registry_lock:
        _cancellation_registry[job_id] = cancel_event

    # Create the job record
    with _job_store_lock:
        _job_store[job_id] = {
            'status':     'queued',
            'result':     None,
            'created_at': time.time(),
        }

    # Launch background thread — HTTP handler returns immediately
    thread = threading.Thread(
        target=_run_processing_job,
        args=(job_id, resolved_path, mock, extract_ar, generate_ai, cancel_event),
        daemon=True,
        name=f'job-{job_id[:8]}',
    )
    thread.start()
    logger.info(f"📋 Job {job_id} queued for {resolved_path}")

    return jsonify({'status': 'queued', 'job_id': job_id}), 202


@process_bp.route('/status/<job_id>', methods=['GET'])
def get_processing_status(job_id):
    """
    Poll the status of a processing job.

    Returns: { "status": "queued|processing|success|error|cancelled", "result": {...} }
    """
    with _job_store_lock:
        job = _job_store.get(job_id)

    if not job:
        body, status = error_response('Job not found or expired', status=404)
        return jsonify(body), status

    return jsonify({
        'status': job['status'],
        'result': job['result'],
    }), 200


@process_bp.route('/cancel', methods=['POST'])
def cancel_processing():
    """
    Cancel an in-progress or queued job.
    Accepts JSON: { "job_id": "<uuid>" }
    """
    data   = request.get_json(silent=True) or {}
    job_id = data.get('job_id')
    if not job_id:
        body, status = error_response('job_id is required', status=400)
        return jsonify(body), status

    with _registry_lock:
        event = _cancellation_registry.get(job_id)

    if event:
        event.set()
        logger.info(f"🛑 Cancellation requested for job {job_id}")
        return jsonify({'status': 'ok', 'message': 'Cancellation requested'}), 200

    return jsonify({'status': 'not_found', 'message': 'Job not found or already completed'}), 404


@process_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'}), 200
