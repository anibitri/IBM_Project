import os
import logging
import uuid
from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from dotenv import load_dotenv
from app.utils.response_formatter import error_response

# ============================================================
# 1. ENVIRONMENT CONFIGURATION
# Must be set BEFORE any model imports
# ============================================================

# Load .env from the backend directory (one level up from app/)
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Set to "0" for real AI models, "1" for mock/testing mode
# Controlled via GRANITE_MOCK in .env — do not hardcode here
os.environ.setdefault("GRANITE_MOCK", "0")

# Static API token auth (no signup/login required)
# Set API_ACCESS_TOKEN in .env — do not hardcode here
API_ACCESS_TOKEN = os.environ.get("API_ACCESS_TOKEN", "ibm-project-dev-token")
PUBLIC_API_PATHS = {
    "/api/health",
    "/api/routes",
    "/api/upload/health",
    "/api/vision/health",
    "/api/ar/health",
    "/api/ai/health",
    "/api/process/health",
}

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
# OPENTELEMETRY INSTRUMENTATION
# Sends traces to the OTel Collector (see otel-collector-config.yaml)
# Set OTEL_EXPORTER_OTLP_ENDPOINT env var to change collector address.
# Gracefully skipped if opentelemetry packages are not installed.
# ============================================================
if os.getenv("OTEL_SDK_DISABLED", "false").lower() in ("true", "1"):
    OTEL_AVAILABLE = False
    logging.info("ℹ️  OpenTelemetry disabled via OTEL_SDK_DISABLED — tracing skipped")
else:
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource

        _otel_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
        _resource = Resource.create({"service.name": "ibm-ar-doc-backend"})
        _provider = TracerProvider(resource=_resource)
        _provider.add_span_processor(
            BatchSpanProcessor(OTLPSpanExporter(endpoint=_otel_endpoint, insecure=True))
        )
        trace.set_tracer_provider(_provider)
        OTEL_AVAILABLE = True
        logging.info(f"✅ OpenTelemetry enabled → {_otel_endpoint}")
    except ImportError:
        OTEL_AVAILABLE = False
        logging.info("ℹ️  OpenTelemetry packages not installed — tracing disabled")

# ============================================================
# 4. APP FACTORY
# ============================================================

def create_app() -> Flask:
    """
    Application factory.
    Creates and configures the Flask app.
    """
    app = Flask(__name__)
    app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024

    # Auto-instrument Flask so every request becomes an OTel span.
    # Status polls are excluded — they are high-frequency heartbeat calls with
    # no diagnostic value as individual spans; the job span in process_route.py
    # already covers the full document processing lifecycle.
    if OTEL_AVAILABLE:
        from opentelemetry.instrumentation.flask import FlaskInstrumentor
        FlaskInstrumentor().instrument_app(
            app,
            excluded_urls=r"api/process/status/.*,api/process/health",
        )
    
    # CORS - Allow React frontend to communicate
    allowed_origins = [
        "http://localhost:3000",   # React dev server
        "http://localhost:8081",   # Expo dev server
        "http://localhost:19006",  # Expo web
        "http://127.0.0.1:3000",
    ]
    CORS(app, resources={
        r"/api/*": {
            "origins": allowed_origins,
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        },
        r"/static/*": {
            "origins": allowed_origins,
            "methods": ["GET", "OPTIONS"],
            "allow_headers": ["Content-Type"]
        }
    })
    
    # Configure logging
    _configure_logging(app)

    app.logger.info(
        f"🛡️  Security: token auth ON | "
        f"public paths: {len(PUBLIC_API_PATHS)} | "
        f"CORS origins: {len(allowed_origins)} | "
        f"max upload: 50 MB"
    )

    # Register middleware
    _register_middleware(app)
    
    # Register error handlers
    _register_error_handlers(app)
    
    # Register blueprints
    _register_blueprints(app)
    
    # Register static file serving
    _register_static_routes(app)

    # Register health and status routes
    _register_health_routes(app)
    
    # Log startup info
    _log_startup_info(app)
    
    return app


# ============================================================
# 5. LOGGING CONFIGURATION
# ============================================================

class _ColourFormatter(logging.Formatter):
    _RESET  = '\033[0m'
    _BOLD   = '\033[1m'
    _LEVEL_COLOURS = {
        logging.DEBUG:    '\033[36m',   # cyan
        logging.INFO:     '\033[32m',   # green
        logging.WARNING:  '\033[33m',   # yellow
        logging.ERROR:    '\033[31m',   # red
        logging.CRITICAL: '\033[35m',   # magenta
    }

    def format(self, record: logging.LogRecord) -> str:
        colour = self._LEVEL_COLOURS.get(record.levelno, '')
        time_str  = self.formatTime(record, '%Y-%m-%d %H:%M:%S')
        level_str = f'{colour}{self._BOLD}{record.levelname:<8}{self._RESET}'
        name_str  = f'\033[90m{record.name}{self._RESET}'  # dark grey
        msg       = record.getMessage()
        return f'[{time_str}] {level_str} in {name_str}: {msg}'


def _configure_logging(app: Flask):
    """Configure application logging with coloured output"""
    log_level = logging.DEBUG if app.debug else logging.INFO

    # Replace root handler with colour formatter
    root = logging.getLogger()
    root.setLevel(log_level)
    if root.handlers:
        root.handlers.clear()
    root_handler = logging.StreamHandler()
    root_handler.setFormatter(_ColourFormatter())
    root.addHandler(root_handler)

    app.logger.setLevel(log_level)
    app.logger.propagate = True   # let root handler do the printing

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
        g.request_id = request.headers.get('X-Request-ID') or uuid.uuid4().hex

        # Token-based authentication for API routes (excluding health/meta routes)
        if request.path.startswith('/api/') and request.method != 'OPTIONS':
            if request.path not in PUBLIC_API_PATHS:
                auth_header = request.headers.get('Authorization', '').strip()
                expected = f"Bearer {API_ACCESS_TOKEN}"
                if auth_header != expected:
                    # Mask token in log: show first 10 chars only
                    masked = auth_header[:10] + '…' if auth_header else '(none)'
                    app.logger.warning(
                        f"🔒 AUTH FAIL [{g.request_id}] "
                        f"{request.method} {request.path} "
                        f"from {request.remote_addr} | token: {masked}"
                    )
                    body, status = error_response(
                        'Missing or invalid API token',
                        status=401,
                        code='AUTH_INVALID_TOKEN',
                        request_id=g.request_id,
                    )
                    return jsonify(body), status

                app.logger.debug(
                    f"🔓 AUTH OK  [{g.request_id}] "
                    f"{request.method} {request.path} "
                    f"from {request.remote_addr}"
                )

        # Suppress per-request log lines for high-frequency status polls —
        # the job runner already logs job lifecycle at the right granularity.
        if not request.path.startswith('/api/process/status/'):
            app.logger.info(
                f"→ [{g.request_id}] {request.method} {request.path} "
                f"from {request.remote_addr}"
            )
    
    @app.after_request
    def log_response(response):
        """Log all outgoing responses"""
        request_id = getattr(g, 'request_id', None)
        if request_id:
            response.headers['X-Request-ID'] = request_id
        if not request.path.startswith('/api/process/status/'):
            app.logger.info(
                f"← [{request_id}] {request.method} {request.path} "
                f"→ {response.status_code}"
            )
        return response
    
    @app.after_request
    def add_headers(response):
        """Add security and cache headers"""
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['Permissions-Policy'] = 'camera=(self), microphone=()'
        # Advertise HTTPS-only preference when deployed behind TLS.
        if request.is_secure or request.headers.get('X-Forwarded-Proto') == 'https':
            response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
            app.logger.debug(f"🔐 HSTS header set for {request.path}")
        # Allow static files (PDFs, images) to be embedded in iframes
        # from the same origin, but block cross-origin framing for API routes
        if request.path.startswith('/static/'):
            response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        else:
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
        request_id = getattr(g, 'request_id', None)
        body, status = error_response('Bad request', status=400, request_id=request_id)
        return jsonify(body), status
    
    @app.errorhandler(401)
    def unauthorized(e):
        app.logger.warning(f"401 Unauthorized: {e}")
        request_id = getattr(g, 'request_id', None)
        body, status = error_response('Unauthorized', status=401, request_id=request_id)
        return jsonify(body), status
    
    @app.errorhandler(403)
    def forbidden(e):
        app.logger.warning(f"403 Forbidden: {e}")
        request_id = getattr(g, 'request_id', None)
        body, status = error_response('Forbidden', status=403, request_id=request_id)
        return jsonify(body), status
    
    @app.errorhandler(404)
    def not_found(e):
        app.logger.warning(f"404 Not Found: {request.path}")
        request_id = getattr(g, 'request_id', None)
        body, status = error_response(
            f'Endpoint not found: {request.path}',
            status=404,
            request_id=request_id
        )
        return jsonify(body), status
    
    @app.errorhandler(405)
    def method_not_allowed(e):
        app.logger.warning(f"405 Method Not Allowed: {request.method} {request.path}")
        request_id = getattr(g, 'request_id', None)
        body, status = error_response(
            f'Method {request.method} not allowed for {request.path}',
            status=405,
            request_id=request_id
        )
        return jsonify(body), status
    
    @app.errorhandler(413)
    def file_too_large(e):
        app.logger.warning(f"413 File Too Large")
        request_id = getattr(g, 'request_id', None)
        body, status = error_response('File too large', status=413, request_id=request_id)
        return jsonify(body), status
    
    @app.errorhandler(500)
    def internal_server_error(e):
        app.logger.error(f"500 Internal Server Error: {e}")
        request_id = getattr(g, 'request_id', None)
        body, status = error_response('Internal server error', status=500, request_id=request_id)
        return jsonify(body), status
    
    @app.errorhandler(HTTPException)
    def handle_http_exception(e):
        app.logger.warning(f"HTTP Exception {e.code}: {e.description}")
        request_id = getattr(g, 'request_id', None)
        body, status = error_response(e.description, status=e.code, request_id=request_id)
        return jsonify(body), status
    
    @app.errorhandler(Exception)
    def handle_exception(e):
        app.logger.exception(f"Unhandled exception: {e}")
        request_id = getattr(g, 'request_id', None)
        body, status = error_response('Internal server error', status=500, request_id=request_id)
        return jsonify(body), status


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
    
    POST /api/process/start          → Submit document for processing (returns job_id immediately)
    GET  /api/process/status/<id>   → Poll job status / result
    POST /api/process/cancel         → Cancel an in-progress job
    GET  /api/process/health         → Pipeline health check
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
    
    # Base dir = backend/ (two levels up from app/, matching upload_route.py)
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

    @app.route('/static/uploads/<path:filename>')
    def serve_upload(filename):
        """Serve uploaded files to the frontend"""
        uploads_dir = os.path.join(base_dir, 'static', 'uploads')
        return send_from_directory(uploads_dir, filename)
    
    @app.route('/static/<path:path>')
    def serve_static(path):
        """Serve general static files"""
        static_dir = os.path.join(base_dir, 'static')
        return send_from_directory(static_dir, path)


# ============================================================
# 10. HEALTH AND STATUS ROUTES
# ============================================================

def _register_health_routes(app: Flask):
    """Register static file serving and health routes"""
    
    # @app.route('/static/uploads/<path:filename>')
    # def serve_upload(filename):
    #     """Serve uploaded files to the frontend"""
    #     uploads_dir = os.path.join(
    #         os.path.abspath(os.path.dirname(__file__)),
    #         'static', 'uploads'
    #     )
    #     return send_from_directory(uploads_dir, filename)
    
    # @app.route('/static/<path:path>')
    # def serve_static(path):
    #     """Serve general static files"""
    #     static_dir = os.path.join(
    #         os.path.abspath(os.path.dirname(__file__)),
    #         'static'
    #     )
    #     return send_from_directory(static_dir, path)
    
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
                    'processor_loaded': manager.vision_processor is not None,
                    'note': 'handles vision analysis and text chat'
                },
                'ar': {
                    'loaded': manager.ar_model is not None
                },
            }

            # Healthy = mock mode OR vision model loaded
            all_loaded = manager.mock_mode or manager.vision_model is not None
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
        print(f"   Vision Model  : {'✅ Loaded' if manager.vision_model else '❌ Not loaded'} (vision + chat)")
        print(f"   AR Model      : {'✅ Loaded' if manager.ar_model else '❌ Not loaded'}")
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