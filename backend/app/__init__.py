import os
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

# 1. FORCE CACHE LOCATION (Global Config)
os.environ["GRANITE_MOCK"] = "0"

def create_app():
    # --- APP INITIALIZATION ---
    app = Flask(__name__)
    CORS(app) # Enable CORS for React Frontend

    # --- LOGGING SETUP ---
    configure_logging(app)
    
    # --- LOAD SERVICES (Lazy Load context) ---
    # We import these here to prevent circular import issues
    try:
        from .services.model_manager import manager
        if manager:
            app.logger.info("✅ Model Manager loaded. AI Models are ready in RAM.")
    except ImportError:
        manager = None
        app.logger.warning("⚠️ Model Manager not found. AI features may fail.")

    # --- IMPORT ROUTES ---
    # Ensure these match your folder structure
    from .routes.upload_route import upload_bp 
    from .routes.ar_routes import ar_bp
    from .routes.vision_routes import vision_bp
    from .routes.ai_routes import ai_bp

    # --- REGISTER BLUEPRINTS ---
    app.register_blueprint(upload_bp, url_prefix='/api/upload')
    app.register_blueprint(ar_bp, url_prefix='/api/ar')
    app.register_blueprint(vision_bp, url_prefix='/api/vision')
    app.register_blueprint(ai_bp, url_prefix='/api/ai')

    # --- MIDDLEWARE ---
    @app.before_request
    def _log_request():
        app.logger.info(f'{request.method} {request.path} from {request.remote_addr}')

    @app.after_request
    def _log_response(response):
        app.logger.info(f'{request.method} {request.path} -> {response.status_code}')
        return response

    @app.errorhandler(Exception)
    def handle_exception(e):
        if isinstance(e, HTTPException):
            app.logger.warning(f'HTTPException: {e.description} (status {e.code})')
            return e
        app.logger.exception('Unhandled exception')
        return jsonify({'status': 'error', 'error': 'Internal server error'}), 500

    # --- STATIC FILE SERVING ---
    @app.route('/static/<path:path>')
    def serve_static(path):
        return send_from_directory('static', path)

    return app

# --- HELPER: LOGGING CONFIG ---
def configure_logging(app: Flask):
    logging.basicConfig(level=logging.INFO)
    app.logger.setLevel(logging.DEBUG if app.debug else logging.INFO)
    
    if not app.logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            '[%(asctime)s] %(levelname)s in %(name)s: %(message)s'
        ))
        app.logger.addHandler(handler)
    
    logging.getLogger('werkzeug').setLevel(logging.INFO)
    logging.captureWarnings(True)