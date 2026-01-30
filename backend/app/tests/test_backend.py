import sys
import os

# --- PATH FIX: Add the project root to Python's search path ---
# This tells Python to look 2 levels up (from tests -> app -> backend)
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))
# --------------------------------------------------------------

import unittest
import requests
# Now this import will work because Python can see the 'app' folder
from app import create_app 
import io
from PIL import Image
import json
import time

class TestBackend(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.client = self.app.test_client()
        self.app.config['TESTING'] = True
        
        # Ensure upload folder exists
        self.upload_folder = os.path.join(self.app.root_path, 'static', 'uploads')
        if not os.path.exists(self.upload_folder):
            os.makedirs(self.upload_folder)

    def test_01_upload_endpoint(self):
        print("\n--- TEST 1: Uploading File ---")
        # Create a dummy image
        img_byte_arr = io.BytesIO()
        image = Image.new('RGB', (100, 100), color='blue')
        image.save(img_byte_arr, format='PNG')
        img_byte_arr.seek(0)

        data = {'file': (img_byte_arr, 'test_image.png')}
        response = self.client.post('/api/upload/', data=data, content_type='multipart/form-data')
        
        self.assertEqual(response.status_code, 200)
        self.assertIn('status', response.get_json())
        print("SUCCESS: Upload returned 200 OK.")

    def test_02_real_ar_and_vision(self):
        # Keep output minimal: only print vision summary.
        # 1. Use the Real Schematic (if exists), else make a dummy
        real_schematic = os.path.join(self.upload_folder, 'simple_schematic.png')
        if not os.path.exists(real_schematic):
            image = Image.new('RGB', (1024, 1024), color='orange')
            image.save(real_schematic)
            
        # 2. Upload it properly to get it into the system
        with open(real_schematic, 'rb') as f:
            data = {'file': (f, 'simple_schematic.png')}
            self.client.post('/api/upload/', data=data, content_type='multipart/form-data')

        # 3. Call AR Endpoint
        # Note: We use the filename, not the full path, as the API expects
        response = self.client.post('/api/ar/generate', json={'stored_name': real_schematic})
        self.assertEqual(response.status_code, 200)
        
        data = response.get_json()
        
        # --- THE FIX: Look for 'segments' OR 'ar_data' ---
        ar_items = []
        if 'segments' in data:
            ar_items = data['segments']
        elif 'ar_data' in data:
            ar_items = data['ar_data']

        vision_summary = data.get('vision_analysis', {}).get('summary', 'Error')
        print(vision_summary)
        self.assertNotEqual(vision_summary, "Error")

    # def test_03_chat_context(self):
    #     print("\n--- TEST 3: Real Chat (Granite) ---")
    #     payload = {
    #         "query": "What is the function of the VALVE?",
    #         "context": "The diagram contains a PUMP connected to a VALVE."
    #     }
    #     response = self.client.post('/api/ai/ask', json=payload)
    #     self.assertEqual(response.status_code, 200)
        
    #     answer = response.get_json().get('answer', '')
    #     print(f"Chat Answer: {answer[:100]}")
    #     self.assertTrue(len(answer) > 10)

    # def test_04_pdf_processing_docling(self):
    #     print("\n--- TEST 4: PDF Manual Processing (Docling) ---")
    #     pdf_path = os.path.join(self.upload_folder, "test_manual.pdf")
        
    #     # Create a minimal valid PDF header
    #     with open(pdf_path, "wb") as f:
    #         f.write(b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/Resources <<\n/Font <<\n/F1 4 0 R\n>>\n>>\n/MediaBox [0 0 612 792]\n/Contents 5 0 R\n>>\nendobj\n4 0 obj\n<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>\nendobj\n5 0 obj\n<<\n/Length 44\n>>\nstream\nBT\n/F1 24 Tf\n100 700 Td\n(Hydraulic Pump Manual) Tj\nET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\n0000000224 00000 n\n0000000311 00000 n\ntrailer\n<<\n/Size 6\n/Root 1 0 R\n>>\nstartxref\n406\n%%EOF\n")

    #     with open(pdf_path, 'rb') as f:
    #         data = {'file': (f, 'test_manual.pdf')}
    #         response = self.client.post('/api/upload/', data=data, content_type='multipart/form-data')
            
    #     self.assertEqual(response.status_code, 200)
    #     print("SUCCESS: Docling accepted PDF.")

    # def test_06_queue_stress(self):
    #     print("\n--- TEST 6: Queue Stress Test (4 Requests) ---")
        
    #     # Create ONE bytes object
    #     img_byte_arr = io.BytesIO()
    #     image = Image.new('RGB', (100, 100), color='red')
    #     image.save(img_byte_arr, format='PNG')
        
    #     for i in range(4):
    #         # Reset cursor to start of file for every iteration
    #         img_byte_arr.seek(0)
            
    #         # Create a NEW file object wrapper for each request
    #         # We copy the bytes to a new buffer to avoid "Closed File" errors
    #         current_buffer = io.BytesIO(img_byte_arr.getvalue())
            
    #         data = {'file': (current_buffer, f'stress_test_{i}.png')}
    #         response = self.client.post('/api/upload/', data=data, content_type='multipart/form-data')
    #         self.assertEqual(response.status_code, 200)
    #         print(f"Request {i+1}: Status 200")
            
    #     print("SUCCESS: Queue handled rapid fire.")

if __name__ == '__main__':
    unittest.main()