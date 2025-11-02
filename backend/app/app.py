from flask import Flask, request, jsonify
from flask_cors import CORS
from routes.upload_route import upload_bp
from routes.ar_routes import ar_bp
from routes.vision_routes import vision_bp
from routes.ai_routes import ai_bp  # added
import os
import logging
from werkzeug.exceptions import HTTPException
from transformers import pipeline
# Force mock mode by default. Uncomment and set to "0" to test real services.
os.environ["GRANITE_MOCK"] = "1"
from services.granite_ai_service import _ensure_llm_loaded  # added
from services.granite_vision_service import _ensure_model_loaded as _ensure_vision_model_loaded  # added

app = Flask(__name__)
CORS(app)


def configure_logging(app: Flask):
    # Set root logging level
    logging.basicConfig(level=logging.INFO)
    # Configure Flask app logger
    app.logger.setLevel(logging.DEBUG if app.debug else logging.INFO)
    if not app.logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            '[%(asctime)s] %(levelname)s in %(name)s: %(message)s'
        ))
        app.logger.addHandler(handler)
    # Werkzeug (HTTP access) logger
    wlog = logging.getLogger('werkzeug')
    wlog.setLevel(logging.INFO)
    # Ensure warnings are captured
    logging.captureWarnings(True)
    # Propagate exceptions for better visibility
    app.config['PROPAGATE_EXCEPTIONS'] = True

configure_logging(app)

# Basic request logging
@app.before_request
def _log_request():
    app.logger.info(f'{request.method} {request.path} from {request.remote_addr}')

@app.after_request
def _log_response(response):
    app.logger.info(f'{request.method} {request.path} -> {response.status_code}')
    return response

# Log any uncaught exceptions with stack trace
@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        app.logger.warning(f'HTTPException: {e.description} (status {e.code})')
        return e
    app.logger.exception('Unhandled exception')
    return jsonify({'status': 'error', 'error': 'Internal server error'}), 500

app.register_blueprint(upload_bp, url_prefix='/api/upload')
app.register_blueprint(ar_bp, url_prefix='/api/ar')
app.register_blueprint(vision_bp, url_prefix='/api/vision')
app.register_blueprint(ai_bp, url_prefix='/api/ai')  # added

if __name__ == '__main__':
    port = int(os.getenv('PORT', '4200'))
    app.logger.info(f'Starting server on 0.0.0.0:{port}')
    # Using mock mode; models are not loaded. To test real services:
    # 1) change the env to "0": os.environ["GRANITE_MOCK"] = "0"
    # 2) uncomment the two lines below to preload models at server start
    # _ensure_llm_loaded()
    # _ensure_vision_model_loaded()
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)