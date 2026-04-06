from flask import Blueprint, request, jsonify
import logging
import threading
import time
import uuid

from app.services.granite_ai_service import ai_service
from app.services.model_manager import manager
from app.utils.shared_utils import resolve_file_path
from app.utils.response_formatter import error_response
from app.utils.validators import ensure_json_object, validate_components_list

ai_bp = Blueprint('ai', __name__)
logger = logging.getLogger(__name__)

# ── Chat job store ─────────────────────────────────────────────────────────
# Mirrors the pattern in process_route.py so /ai/ask is non-blocking and
# immune to NAT/proxy TCP timeouts (~5 min on ngrok / mobile carriers).
# ──────────────────────────────────────────────────────────────────────────
_chat_jobs      = {}
_chat_jobs_lock = threading.Lock()
_CHAT_JOB_TTL   = 3600  # 1 hour


def _cleanup_chat_jobs():
    cutoff = time.time() - _CHAT_JOB_TTL
    with _chat_jobs_lock:
        stale = [jid for jid, j in _chat_jobs.items() if j['created_at'] < cutoff]
        for jid in stale:
            del _chat_jobs[jid]


def _run_chat_job(job_id, query, context, history):
    """Background worker: runs chat inference and stores the result."""
    def _set(status, result=None):
        with _chat_jobs_lock:
            if job_id in _chat_jobs:
                _chat_jobs[job_id]['status'] = status
                _chat_jobs[job_id]['result'] = result

    try:
        manager.maybe_cleanup_before_inference()
        try:
            result = ai_service.chat_with_document(query, context, chat_history=history)
        finally:
            manager.maybe_cleanup_after_inference()

        if result.get('status') == 'error':
            _set('error', result)
        else:
            _set('success', result)
    except Exception:
        logger.exception(f"Chat job {job_id} failed")
        _set('error', {'status': 'error', 'error': 'AI chat failed'})


@ai_bp.route('/analyze', methods=['POST'])
def analyze():
    """
    Analyze technical content using AI model.
    
    Accepts JSON:
    {
        "text_excerpt": "...",  // Optional: text content
        "vision": {...},        // Optional: vision analysis results
        "components": [...],    // Optional: AR components
        "context_type": "software"  // Optional: context type
    }
    """
    try:
        payload = request.get_json(silent=True) or {}
        ok, message = ensure_json_object(payload)
        if not ok:
            body, status = error_response(message, status=400)
            return jsonify(body), status
        
        text_excerpt = payload.get('text_excerpt', '').strip()
        vision = payload.get('vision', {})
        components = payload.get('components', [])
        context_type = payload.get('context_type', 'general')
        
        # Validate input
        if not text_excerpt and not vision and not components:
            body, status = error_response(
                'At least one of text_excerpt, vision, or components is required',
                status=400
            )
            return jsonify(body), status

        if components:
            ok, message = validate_components_list(components)
            if not ok:
                body, status = error_response(message, status=400)
                return jsonify(body), status
        
        logger.info(f"🤖 AI Analysis: type={context_type}")
        
        # Run analysis with adaptive GPU housekeeping.
        manager.maybe_cleanup_before_inference()
        try:
            result = ai_service.analyze_context(
                text_excerpt=text_excerpt,
                vision=vision,
                components=components,
                context_type=context_type
            )
        finally:
            manager.maybe_cleanup_after_inference()
        
        # Check for errors
        if result.get('status') == 'error':
            return jsonify(result), 500
        
        return jsonify({
            'status': 'success',
            'ai': result
        }), 200
    
    except Exception as e:
        logger.exception("AI analysis failed")
        body, status = error_response('AI analysis failed', status=500)
        return jsonify(body), status


@ai_bp.route('/ask', methods=['POST'])
@ai_bp.route('/chat', methods=['POST'])
def ask():
    """
    Interactive Q&A with document context.
    
    Accepts JSON:
    {
        "query": "What does component X do?",  // Required
        "context": {...},                       // Required: document context
        "history": [...]                        // Optional: chat history
    }
    """
    try:
        payload = request.get_json(silent=True) or {}
        ok, message = ensure_json_object(payload)
        if not ok:
            body, status = error_response(message, status=400)
            return jsonify(body), status
        
        query = payload.get('query', '').strip()
        context = payload.get('context')
        history = payload.get('history', [])
        
        # Validate input
        if not query:
            body, status = error_response('Query is required', status=400)
            return jsonify(body), status
        
        if not context:
            body, status = error_response('Context is required', status=400)
            return jsonify(body), status
        
        logger.info(f"💬 AI Chat: {query[:50]}...")

        # Resolve image path so the chat service can query the vision model
        if isinstance(context, dict):
            stored_name = context.pop('stored_name', None)
            if stored_name and not context.get('image_path'):
                resolved_path, err = resolve_file_path(stored_name)
                if not err:
                    context['image_path'] = resolved_path

        # Run chat with adaptive GPU housekeeping.
        manager.maybe_cleanup_before_inference()
        try:
            result = ai_service.chat_with_document(query, context, chat_history=history)
        finally:
            manager.maybe_cleanup_after_inference()

        # Check for errors
        if result.get('status') == 'error':
            return jsonify(result), 500

        return jsonify(result), 200

    except Exception as e:
        logger.exception("AI chat failed")
        body, status = error_response('AI chat failed', status=500)
        return jsonify(body), status


@ai_bp.route('/ask/start', methods=['POST'])
@ai_bp.route('/chat/start', methods=['POST'])
def ask_start():
    """
    Non-blocking chat submission.  Returns immediately with a job_id.
    The client polls GET /ai/ask/status/<job_id> for the result.
    """
    _cleanup_chat_jobs()

    try:
        payload = request.get_json(silent=True) or {}
        ok, message = ensure_json_object(payload)
        if not ok:
            body, status = error_response(message, status=400)
            return jsonify(body), status

        query   = payload.get('query', '').strip()
        context = payload.get('context')
        history = payload.get('history', [])

        if not query:
            body, status = error_response('Query is required', status=400)
            return jsonify(body), status
        if not context:
            body, status = error_response('Context is required', status=400)
            return jsonify(body), status

        # Resolve image path before handing off to the background thread
        if isinstance(context, dict):
            stored_name = context.pop('stored_name', None)
            if stored_name and not context.get('image_path'):
                resolved_path, err = resolve_file_path(stored_name)
                if not err:
                    context['image_path'] = resolved_path

        job_id = str(uuid.uuid4())
        with _chat_jobs_lock:
            _chat_jobs[job_id] = {'status': 'queued', 'result': None, 'created_at': time.time()}

        thread = threading.Thread(
            target=_run_chat_job,
            args=(job_id, query, context, history),
            daemon=True,
            name=f'chat-{job_id[:8]}',
        )
        thread.start()
        logger.info(f"💬 Chat job {job_id} queued: {query[:50]}...")

        return jsonify({'job_id': job_id, 'status': 'queued'}), 202

    except Exception as e:
        logger.exception("Failed to start chat job")
        body, status = error_response('Failed to start chat job', status=500)
        return jsonify(body), status


@ai_bp.route('/ask/status/<job_id>', methods=['GET'])
@ai_bp.route('/chat/status/<job_id>', methods=['GET'])
def ask_status(job_id):
    """Poll the status of a chat job."""
    with _chat_jobs_lock:
        job = _chat_jobs.get(job_id)

    if not job:
        body, status = error_response('Job not found or expired', status=404)
        return jsonify(body), status

    return jsonify({'status': job['status'], 'result': job['result']}), 200


@ai_bp.route('/summarize-components', methods=['POST'])
def summarize_components_endpoint():
    """
    Generate natural language summary of AR components.
    
    Accepts JSON:
    {
        "components": [...],      // Required: AR components
        "relationships": {...},   // Optional: component relationships
        "document_type": "circuit"  // Optional: document type
    }
    """
    try:
        payload = request.get_json(silent=True) or {}
        ok, message = ensure_json_object(payload)
        if not ok:
            body, status = error_response(message, status=400)
            return jsonify(body), status
        
        components = payload.get('components', [])
        relationships = payload.get('relationships', {})
        document_type = payload.get('document_type', 'general')
        
        ok, message = validate_components_list(components)
        if not ok:
            body, status = error_response(message, status=400)
            return jsonify(body), status

        if not components:
            body, status = error_response('Components array is required', status=400)
            return jsonify(body), status
        
        logger.info(f"📝 Summarizing {len(components)} components")
        
        # Generate summary with adaptive GPU housekeeping.
        manager.maybe_cleanup_before_inference()
        try:
            result = ai_service.summarize_components(
                components=components,
                relationships=relationships,
                document_type=document_type
            )
        finally:
            manager.maybe_cleanup_after_inference()
        
        # Check for errors
        if result.get('status') == 'error':
            return jsonify(result), 500
        
        return jsonify({
            'status': 'success',
            'summary': result.get('summary', ''),
            'componentCount': result.get('component_count', 0)
        }), 200
    
    except Exception as e:
        logger.exception("Component summarization failed")
        body, status = error_response('Component summarization failed', status=500)
        return jsonify(body), status


@ai_bp.route('/generate-insights', methods=['POST'])
def generate_insights_endpoint():
    """
    Generate technical insights from document analysis.
    
    Accepts JSON:
    {
        "vision_analysis": {...},  // Optional
        "ar_components": [...],    // Optional
        "text_content": "...",     // Optional
        "insight_type": "architecture"  // Optional: type of insights
    }
    """
    try:
        payload = request.get_json(silent=True) or {}
        ok, message = ensure_json_object(payload)
        if not ok:
            body, status = error_response(message, status=400)
            return jsonify(body), status
        
        vision_analysis = payload.get('vision_analysis', {})
        ar_components = payload.get('ar_components', [])
        text_content = payload.get('text_content', '')
        insight_type = payload.get('insight_type', 'general')
        
        logger.info(f"💡 Generating insights: type={insight_type}")
        
        manager.maybe_cleanup_before_inference()
        try:
            result = ai_service.generate_insights(
                vision_analysis=vision_analysis,
                ar_components=ar_components,
                text_content=text_content,
                insight_type=insight_type
            )
        finally:
            manager.maybe_cleanup_after_inference()
        
        # Check for errors
        if result.get('status') == 'error':
            return jsonify(result), 500
        
        return jsonify({
            'status': 'success',
            'insights': result.get('insights', []),
            'insightType': result.get('insight_type', insight_type)
        }), 200
    
    except Exception as e:
        logger.exception("Insight generation failed")
        body, status = error_response('Insight generation failed', status=500)
        return jsonify(body), status


@ai_bp.route('/compare-documents', methods=['POST'])
def compare_documents():
    """
    Compare two documents and highlight differences/similarities.
    
    Accepts JSON:
    {
        "document1": {...},  // Required: first document analysis
        "document2": {...},  // Required: second document analysis
        "comparison_type": "architecture"  // Optional
    }
    """
    try:
        payload = request.get_json(silent=True) or {}
        ok, message = ensure_json_object(payload)
        if not ok:
            body, status = error_response(message, status=400)
            return jsonify(body), status
        
        doc1 = payload.get('document1')
        doc2 = payload.get('document2')
        comparison_type = payload.get('comparison_type', 'general')
        
        if not doc1 or not doc2:
            body, status = error_response('Both document1 and document2 are required', status=400)
            return jsonify(body), status
        
        logger.info(f"🔍 Comparing documents: type={comparison_type}")
        
        # Build comparison context
        context = f"Document 1:\n{doc1}\n\nDocument 2:\n{doc2}"
        
        prompt_text = (
            f"Compare these two technical documents. "
            f"Identify key differences, similarities, and notable changes. "
            f"Focus on {comparison_type} aspects."
        )
        
        manager.maybe_cleanup_before_inference()
        try:
            result = ai_service.analyze_context(
                text_excerpt=context,
                context_type=comparison_type
            )
        finally:
            manager.maybe_cleanup_after_inference()
        
        return jsonify({
            'status': 'success',
            'comparison': result.get('answer', ''),
            'comparisonType': comparison_type
        }), 200
    
    except Exception as e:
        logger.exception("Document comparison failed")
        body, status = error_response('Document comparison failed', status=500)
        return jsonify(body), status


@ai_bp.route('/health', methods=['GET'])
def health_check():
    """Check if AI model is loaded"""
    from app.services.model_manager import manager

    is_ready = manager.mock_mode or manager.vision_model is not None

    return jsonify({
        'status': 'healthy' if is_ready else 'degraded',
        'ai_model_loaded': is_ready,
        'mock_mode': manager.mock_mode,
    }), 200