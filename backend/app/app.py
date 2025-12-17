import os
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

# --- ROUTES ---
# Ensure filenames match these imports!
# If your file is named 'upload_route.py', change this back to 'routes.upload_route'
from routes.upload_route import upload_bp 
from routes.ar_routes import ar_bp
from routes.vision_routes import vision_bp
from routes.ai_routes import ai_bp

# --- SERVICES (For Preloading) ---
from services.granite_ai_service import _ensure_llm_loaded
from services.granite_vision_service import _ensure_model_loaded as _ensure_vision_model_loaded
# Import SAM loader to warm it up on startup
try:
    from services.ar_service import _get_sam_model 
except ImportError:
    _get_sam_model = None

# --- CONFIGURATION ---
# Force mock mode by default. Change to "0" to use real AI models.
os.environ["GRANITE_MOCK"] = "0"

app = Flask(__name__)
CORS(app) # Enable CORS for React Frontend

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

configure_logging(app)

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

# --- CRITICAL: STATIC FILE SERVING ---
# This allows React to load the uploaded images as textures
@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

# --- BLUEPRINTS ---
app.register_blueprint(upload_bp, url_prefix='/api/upload')
app.register_blueprint(ar_bp, url_prefix='/api/ar')
app.register_blueprint(vision_bp, url_prefix='/api/vision')
app.register_blueprint(ai_bp, url_prefix='/api/ai')

# --- MAIN ENTRY POINT ---
if __name__ == '__main__':
    port = int(os.getenv('PORT', '4200'))
    app.logger.info(f'Starting server on 0.0.0.0:{port}')

    # --- MODEL PRELOADING ---
    # Only preload if we are NOT in mock mode
    if os.environ.get("GRANITE_MOCK") == "0":
        app.logger.info("Warm-up: Loading Granite AI...")
        _ensure_llm_loaded()
        
        app.logger.info("Warm-up: Loading Granite Vision...")
        _ensure_vision_model_loaded()
        
        if _get_sam_model:
            app.logger.info("Warm-up: Loading SAM (AR Model)...")
            try:
                _get_sam_model() # Triggers the lazy load
            except Exception as e:
                app.logger.warning(f"SAM preload failed (non-fatal): {e}")
    else:
        app.logger.info("Skipping model warm-up (Mock Mode Enabled)")

    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)