import os
import logging
import traceback
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

# ============================================================
# 1. ENVIRONMENT CONFIGURATION
# Must be set BEFORE any model imports
# ============================================================

# Force HuggingFace model cache location
# os.environ['HF_HOME'] = r'G:\AI_Models'

# Set to "0" for real AI models, "1" for mock/testing mode
os.environ["GRANITE_MOCK"] = "0"

# ============================================================
# 2. IMPORT ROUTES
# ============================================================

from app.routes.upload_route import upload_bp
from app.routes.ar_routes import ar_bp
from app.routes.vision_routes import vision_bp
from app.routes.ai_routes import ai_bp
from app.routes.process_route import process_bp

# ============================================================
# 3. IMPORT MODEL MANAGER
# Triggers model initialization on startup
# ============================================================

try:
    from app.services.model_manager import manager
    MODEL_MANAGER_AVAILABLE = True
except ImportError as e:
    manager = None
    MODEL_MANAGER_AVAILABLE = False
    logging.warning(f"⚠️ Model Manager import failed: {e}")

# ============================================================
# 4. APP FACTORY
# ============================================================

def create_app() -> Flask:
    """
    Application factory.
    Creates and configures the Flask app.
    """
    app = Flask(__name__)
    
    # CORS - Allow React frontend to communicate
    CORS(app, resources={
        r"/api/*": {
            "origins": [
                "http://localhost:3000",   # React dev server
                "http://localhost:8081",   # Expo dev server
                "http://localhost:19006",  # Expo web
                "http://127.0.0.1:3000",
            ],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })
    
    # Configure logging
    _configure_logging(app)
    
    # Register middleware
    _register_middleware(app)
    
    # Register error handlers
    _register_error_handlers(app)
    
    # Register blueprints
    _register_blueprints(app)
    
    # Register static file serving
    _register_static_routes(app)
    
    # Log startup info
    _log_startup_info(app)
    
    return app


# ============================================================
# 5. LOGGING CONFIGURATION
# ============================================================

def _configure_logging(app: Flask):
    """Configure application logging"""
    log_level = logging.DEBUG if app.debug else logging.INFO
    
    logging.basicConfig(
        level=log_level,
        format='[%(asctime)s] %(levelname)s in %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    app.logger.setLevel(log_level)
    
    # Add stream handler if none exist
    if not app.logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            '[%(asctime)s] %(levelname)s in %(name)s: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        ))
        app.logger.addHandler(handler)
    
    # Suppress noisy werkzeug logs
    logging.getLogger('werkzeug').setLevel(logging.WARNING)
    logging.captureWarnings(True)
    
    app.logger.info("✅ Logging configured")


# ============================================================
# 6. MIDDLEWARE
# ============================================================

def _register_middleware(app: Flask):
    """Register request/response middleware"""
    
    @app.before_request
    def log_request():
        """Log all incoming requests"""
        app.logger.info(
            f"→ {request.method} {request.path} "
            f"from {request.remote_addr}"
        )
    
    @app.after_request
    def log_response(response):
        """Log all outgoing responses"""
        app.logger.info(
            f"← {request.method} {request.path} "
            f"→ {response.status_code}"
        )
        return response
    
    @app.after_request
    def add_headers(response):
        """Add security and cache headers"""
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        return response


# ============================================================
# 7. ERROR HANDLERS
# ============================================================

def _register_error_handlers(app: Flask):
    """Register global error handlers"""
    
    @app.errorhandler(400)
    def bad_request(e):
        app.logger.warning(f"400 Bad Request: {e}")
        return jsonify({
            'status': 'error',
            'error': 'Bad request',
            'details': str(e)
        }), 400
    
    @app.errorhandler(401)
    def unauthorized(e):
        app.logger.warning(f"401 Unauthorized: {e}")
        return jsonify({
            'status': 'error',
            'error': 'Unauthorized'
        }), 401
    
    @app.errorhandler(403)
    def forbidden(e):
        app.logger.warning(f"403 Forbidden: {e}")
        return jsonify({
            'status': 'error',
            'error': 'Forbidden'
        }), 403
    
    @app.errorhandler(404)
    def not_found(e):
        app.logger.warning(f"404 Not Found: {request.path}")
        return jsonify({
            'status': 'error',
            'error': f'Endpoint not found: {request.path}'
        }), 404
    
    @app.errorhandler(405)
    def method_not_allowed(e):
        app.logger.warning(f"405 Method Not Allowed: {request.method} {request.path}")
        return jsonify({
            'status': 'error',
            'error': f'Method {request.method} not allowed for {request.path}'
        }), 405
    
    @app.errorhandler(413)
    def file_too_large(e):
        app.logger.warning(f"413 File Too Large")
        return jsonify({
            'status': 'error',
            'error': 'File too large'
        }), 413
    
    @app.errorhandler(500)
    def internal_server_error(e):
        app.logger.error(f"500 Internal Server Error: {e}")
        return jsonify({
            'status': 'error',
            'error': 'Internal server error'
        }), 500
    
    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        app.logger.warning(f"HTTP Exception {e.code}: {e.description}")
        return jsonify({
            'status': 'error',
            'error': e.description
        }), e.code
    
    @app.errorhandler(Exception)
    def handle_exception(e):
        app.logger.exception(f"Unhandled exception: {e}")
        return jsonify({
            'status': 'error',
            'error': 'Internal server error',
            'details': str(e) if app.debug else 'Enable debug mode for details'
        }), 500


# ============================================================
# 8. BLUEPRINT REGISTRATION
# ============================================================

def _register_blueprints(app: Flask):
    """
    Register all route blueprints with their URL prefixes.
    
    API Structure:
    POST /api/upload/           → Upload file
    GET  /api/upload/health     → Upload health check
    
    POST /api/vision/analyze    → Analyze image with vision model
    POST /api/vision/batch-analyze → Batch analyze multiple images
    GET  /api/vision/health     → Vision model health check
    
    POST /api/ar/generate       → Generate AR overlay
    POST /api/ar/analyze-relationships → Analyze component relationships
    POST /api/ar/extract-from-multiple → Batch AR extraction
    GET  /api/ar/health         → AR model health check
    
    POST /api/ai/analyze        → Analyze technical content
    POST /api/ai/ask            → Q&A with document context
    POST /api/ai/summarize-components → Summarize AR components
    POST /api/ai/generate-insights    → Generate technical insights
    POST /api/ai/compare-documents    → Compare two documents
    GET  /api/ai/health         → AI model health check
    
    POST /api/process/document  → Full pipeline (Vision → AR → AI)
    GET  /api/process/health    → Pipeline health check
    """
    
    app.register_blueprint(upload_bp,  url_prefix='/api/upload')
    app.register_blueprint(vision_bp,  url_prefix='/api/vision')
    app.register_blueprint(ar_bp,      url_prefix='/api/ar')
    app.register_blueprint(ai_bp,      url_prefix='/api/ai')
    app.register_blueprint(process_bp, url_prefix='/api/process')
    
    app.logger.info("✅ All blueprints registered")


# ============================================================
# 9. STATIC FILE SERVING
# ============================================================

def _register_static_routes(app: Flask):
    """Register static file serving routes"""
    
    @app.route('/static/uploads/<path:filename>')
    def serve_upload(filename):
        """Serve uploaded files to the frontend"""
        uploads_dir = os.path.join(
            os.path.abspath(os.path.dirname(__file__)),
            'static', 'uploads'
        )
        return send_from_directory(uploads_dir, filename)
    
    @app.route('/static/<path:path>')
    def serve_static(path):
        """Serve general static files"""
        static_dir = os.path.join(
            os.path.abspath(os.path.dirname(__file__)),
            'static'
        )
        return send_from_directory(static_dir, path)


# ============================================================
# 10. HEALTH AND STATUS ROUTES
# ============================================================

def _register_static_routes(app: Flask):
    """Register static file serving and health routes"""
    
    @app.route('/static/uploads/<path:filename>')
    def serve_upload(filename):
        """Serve uploaded files to the frontend"""
        uploads_dir = os.path.join(
            os.path.abspath(os.path.dirname(__file__)),
            'static', 'uploads'
        )
        return send_from_directory(uploads_dir, filename)
    
    @app.route('/static/<path:path>')
    def serve_static(path):
        """Serve general static files"""
        static_dir = os.path.join(
            os.path.abspath(os.path.dirname(__file__)),
            'static'
        )
        return send_from_directory(static_dir, path)
    
    @app.route('/api/health', methods=['GET'])
    def health_check():
        """
        Global health check.
        Returns status of all models and services.
        """
        health = {
            'status': 'healthy',
            'mode': 'MOCK' if os.environ.get('GRANITE_MOCK') == '1' else 'REAL AI',
            'models': {}
        }
        
        # Check all models via model manager
        if MODEL_MANAGER_AVAILABLE and manager:
            health['models'] = {
                'vision': {
                    'loaded': manager.vision_model is not None,
                    'processor_loaded': manager.vision_processor is not None
                },
                'ar': {
                    'loaded': manager.ar_model is not None
                },
                'chat': {
                    'loaded': manager.chat_model is not None,
                    'tokenizer_loaded': manager.chat_tokenizer is not None
                }
            }
            
            # Determine overall health
            all_loaded = all([
                manager.vision_model is not None,
                manager.ar_model is not None,
                manager.chat_model is not None
            ])
            health['status'] = 'healthy' if all_loaded else 'degraded'
        
        else:
            health['status'] = 'degraded'
            health['models'] = {
                'error': 'Model Manager not available'
            }
        
        status_code = 200 if health['status'] == 'healthy' else 207
        return jsonify(health), status_code
    
    @app.route('/api/routes', methods=['GET'])
    def list_routes():
        """
        List all registered routes.
        Useful for debugging and API documentation.
        """
        routes = []
        for rule in app.url_map.iter_rules():
            routes.append({
                'endpoint': rule.endpoint,
                'methods': sorted(list(rule.methods - {'HEAD', 'OPTIONS'})),
                'path': str(rule)
            })
        
        routes = sorted(routes, key=lambda x: x['path'])
        
        return jsonify({
            'status': 'success',
            'total': len(routes),
            'routes': routes
        }), 200


# ============================================================
# 11. STARTUP LOGGING
# ============================================================

def _log_startup_info(app: Flask):
    """Log startup configuration and model status"""
    
    @app.before_request
    def startup_log():
        """Log once on first request"""
        if not getattr(app, '_startup_logged', False):
            app._startup_logged = True
            app.logger.info("=" * 50)
            app.logger.info("🚀 First request received - Server ready")
            app.logger.info("=" * 50)


# ============================================================
# 12. ENTRY POINT
# ============================================================

# Create app instance
app = create_app()

if __name__ == '__main__':
    port = int(os.getenv('PORT', '4200'))
    is_mock = os.environ.get("GRANITE_MOCK") == "1"
    
    print("\n" + "=" * 60)
    print("🚀  STARTING SERVER")
    print("=" * 60)
    print(f"   Port     : {port}")
    print(f"   Mode     : {'🔵 MOCK (No AI)' if is_mock else '🟢 REAL AI'}")
    print(f"   Debug    : {os.getenv('FLASK_DEBUG', 'False')}")
    print("=" * 60)
    
    if MODEL_MANAGER_AVAILABLE and manager:
        print("\n📦 MODEL STATUS:")
        print(f"   Vision Model  : {'✅ Loaded' if manager.vision_model else '❌ Not loaded'}")
        print(f"   AR Model      : {'✅ Loaded' if manager.ar_model else '❌ Not loaded'}")
        print(f"   Chat Model    : {'✅ Loaded' if manager.chat_model else '❌ Not loaded'}")
    else:
        print("\n⚠️  Model Manager not available")
    
    print("\n📡 API ENDPOINTS:")
    print("   POST  /api/upload/")
    print("   POST  /api/vision/analyze")
    print("   POST  /api/vision/batch-analyze")
    print("   POST  /api/ar/generate")
    print("   POST  /api/ar/analyze-relationships")
    print("   POST  /api/ar/extract-from-multiple")
    print("   POST  /api/ai/analyze")
    print("   POST  /api/ai/ask")
    print("   POST  /api/ai/summarize-components")
    print("   POST  /api/ai/generate-insights")
    print("   POST  /api/ai/compare-documents")
    print("   POST  /api/process/document")
    print("   GET   /api/health")
    print("   GET   /api/routes")
    print("=" * 60 + "\n")
    
    # use_reloader=False prevents double model loading
    app.run(
        host='0.0.0.0',
        port=port,
        debug=os.getenv('FLASK_DEBUG', 'False').lower() == 'true',
        use_reloader=False
    )