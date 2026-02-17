from flask import Blueprint, request, jsonify
import logging
import traceback

from app.services.granite_ai_service import ai_service

ai_bp = Blueprint('ai', __name__)
logger = logging.getLogger(__name__)


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
        
        text_excerpt = payload.get('text_excerpt', '').strip()
        vision = payload.get('vision', {})
        components = payload.get('components', [])
        context_type = payload.get('context_type', 'general')
        
        # Validate input
        if not text_excerpt and not vision and not components:
            return jsonify({
                'status': 'error',
                'error': 'At least one of text_excerpt, vision, or components is required'
            }), 400
        
        logger.info(f"🤖 AI Analysis: type={context_type}")
        
        # Run analysis
        result = ai_service.analyze_context(
            text_excerpt=text_excerpt,
            vision=vision,
            components=components,
            context_type=context_type
        )
        
        # Check for errors
        if result.get('status') == 'error':
            return jsonify(result), 500
        
        return jsonify({
            'status': 'success',
            'ai': result
        }), 200
    
    except Exception as e:
        logger.exception("AI analysis failed")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'details': traceback.format_exc()
        }), 500


@ai_bp.route('/ask', methods=['POST'])
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
        
        query = payload.get('query', '').strip()
        context = payload.get('context')
        history = payload.get('history', [])
        
        # Validate input
        if not query:
            return jsonify({
                'status': 'error',
                'error': 'Query is required'
            }), 400
        
        if not context:
            return jsonify({
                'status': 'error',
                'error': 'Context is required'
            }), 400
        
        logger.info(f"💬 AI Chat: {query[:50]}...")
        
        # Run chat
        result = ai_service.chat_with_document(query, context, chat_history=history)
        
        # Check for errors
        if result.get('status') == 'error':
            return jsonify(result), 500
        
        return jsonify(result), 200
    
    except Exception as e:
        logger.exception("AI chat failed")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'details': traceback.format_exc()
        }), 500


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
        
        components = payload.get('components', [])
        relationships = payload.get('relationships', {})
        document_type = payload.get('document_type', 'general')
        
        if not components:
            return jsonify({
                'status': 'error',
                'error': 'Components array is required'
            }), 400
        
        logger.info(f"📝 Summarizing {len(components)} components")
        
        # Generate summary
        result = ai_service.summarize_components(
            components=components,
            relationships=relationships,
            document_type=document_type
        )
        
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
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


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
        
        vision_analysis = payload.get('vision_analysis', {})
        ar_components = payload.get('ar_components', [])
        text_content = payload.get('text_content', '')
        insight_type = payload.get('insight_type', 'general')
        
        logger.info(f"💡 Generating insights: type={insight_type}")
        
        result = ai_service.generate_insights(
            vision_analysis=vision_analysis,
            ar_components=ar_components,
            text_content=text_content,
            insight_type=insight_type
        )
        
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
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


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
        
        doc1 = payload.get('document1')
        doc2 = payload.get('document2')
        comparison_type = payload.get('comparison_type', 'general')
        
        if not doc1 or not doc2:
            return jsonify({
                'status': 'error',
                'error': 'Both document1 and document2 are required'
            }), 400
        
        logger.info(f"🔍 Comparing documents: type={comparison_type}")
        
        # Build comparison context
        context = f"Document 1:\n{doc1}\n\nDocument 2:\n{doc2}"
        
        prompt_text = (
            f"Compare these two technical documents. "
            f"Identify key differences, similarities, and notable changes. "
            f"Focus on {comparison_type} aspects."
        )
        
        result = ai_service.analyze_context(
            text_excerpt=context,
            context_type=comparison_type
        )
        
        return jsonify({
            'status': 'success',
            'comparison': result.get('answer', ''),
            'comparisonType': comparison_type
        }), 200
    
    except Exception as e:
        logger.exception("Document comparison failed")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@ai_bp.route('/health', methods=['GET'])
def health_check():
    """Check if AI model is loaded"""
    from app.services.model_manager import manager
    
    is_loaded = manager.chat_model is not None and manager.chat_tokenizer is not None
    
    return jsonify({
        'status': 'healthy' if is_loaded else 'degraded',
        'ai_model_loaded': is_loaded
    }), 200