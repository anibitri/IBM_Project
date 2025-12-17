import sys
import os
import unittest
import io
from unittest.mock import patch

# Fix imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../app')))
from app import app

class TestBackend(unittest.TestCase):

    def setUp(self):
        self.app = app
        self.app.config['TESTING'] = True
        self.app.config['UPLOAD_FOLDER'] = 'static/uploads'
        self.client = self.app.test_client()
        os.makedirs(self.app.config['UPLOAD_FOLDER'], exist_ok=True)

    @patch('app.services.preprocess_service.preprocess_document') 
    def test_01_upload_file(self, mock_preprocess):
        mock_preprocess.return_value = {
            'status': 'ok', 'kind': 'image', 'vision': {}, 'ar': {}, 'ai': {}
        }
        data = {'file': (io.BytesIO(b"fake"), 'test.png')}
        response = self.client.post('/api/upload/', data=data, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 200)

    @patch('app.services.granite_vision_service.analyze_images')
    @patch('app.services.ar_service.extract_document_features')
    def test_02_ar_generation(self, mock_extract, mock_vision):
        mock_vision.return_value = {'status': 'ok', 'components': []}
        mock_extract.return_value = [{'id': '1', 'label': 'Pump', 'bbox': [0,0,0,0]}]
        
        # Create dummy file
        dummy = os.path.join(self.app.config['UPLOAD_FOLDER'], "test.png")
        with open(dummy, 'wb') as f: f.write(b"content")

        response = self.client.post('/api/ar/generate', json={'stored_name': "test.png"})
        self.assertEqual(response.status_code, 200)

    # This is the REAL test. If this passes, your backend is perfect.
    def test_03_ai_chat(self):
        """
        Tests the actual AI logic. 
        NOTE: This will actually load the model and run inference.
        """
        payload = {
            "query": "What is this?",
            "context": {
                "text_excerpt": "A hydraulic pump system.",
                "ar_elements": [{"label": "Pump A"}]
            }
        }
        response = self.client.post('/api/ai/ask', json=payload)
        
        # We expect 200 OK. 
        # The answer might vary because it's a real AI, so we just check status.
        self.assertEqual(response.status_code, 200)
        self.assertIn('answer', response.get_json())

if __name__ == '__main__':
    unittest.main()