import os
import logging
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

# 1. FORCE CACHE LOCATION (Crucial for your setup)
os.environ['HF_HOME'] = r'G:\AI_Models'

# 2. CONFIGURATION
# Set to "0" to use real AI models. Set to "1" for Mock mode (fake data).
os.environ["GRANITE_MOCK"] = "0"

# 3. IMPORT ROUTES
# Ensure these filenames match your actual file structure in /routes/
from routes.upload_route import upload_bp 
from routes.ar_routes import ar_bp
from routes.vision_routes import vision_bp
from routes.ai_routes import ai_bp

# 4. IMPORT MODEL MANAGER (Triggers Initialization)
# This automatically loads the models into RAM when the app starts.
try:
    from services.model_manager import manager
except ImportError:
    # Fallback if specific libraries aren't installed yet
    manager = None 

app = Flask(__name__)
CORS(app) # Enable CORS for React Frontend

# --- LOGGING SETUP ---
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

# --- STATIC FILE SERVING ---
# Allows React/Frontend to access uploaded images
@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

# --- REGISTER BLUEPRINTS ---
app.register_blueprint(upload_bp, url_prefix='/api/upload')
app.register_blueprint(ar_bp, url_prefix='/api/ar')
app.register_blueprint(vision_bp, url_prefix='/api/vision')
app.register_blueprint(ai_bp, url_prefix='/api/ai')

# --- MAIN ENTRY POINT ---
if __name__ == '__main__':
    port = int(os.getenv('PORT', '4200'))
    
    app.logger.info(f'--- STARTING SERVER on Port {port} ---')
    app.logger.info(f'--- MODE: {"REAL AI" if os.environ["GRANITE_MOCK"] == "0" else "MOCK"} ---')

    if manager:
        app.logger.info("✅ Model Manager loaded. AI Models are ready in RAM.")
    else:
        app.logger.warning("⚠️ Model Manager not found. AI features may fail.")

    # use_reloader=False prevents the app from loading twice (saving RAM)
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)