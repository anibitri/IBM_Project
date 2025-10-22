from flask import Flask, request, jsonify
from flask_cors import CORS
from routes.upload_route import upload_bp
from routes.ar_routes import ar_bp
import os

app = Flask(__name__)
CORS(app)

app.register_blueprint(upload_bp, url_prefix='/api/upload')
app.register_blueprint(ar_bp, url_prefix='/api/ar')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)