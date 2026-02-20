"""
test_upload_route.py
Tests for POST /api/upload/
"""

import io
import pytest
from PIL import Image


class TestUploadSuccess:

    def test_upload_valid_png(self, client, test_images_dir):
        with open(str(test_images_dir / "diagram.png"), 'rb') as f:
            resp = client.post(
                '/api/upload/',
                data={'file': (f, 'diagram.png', 'image/png')},
                content_type='multipart/form-data'
            )
        data = resp.get_json()

        assert resp.status_code == 200
        assert data['status'] == 'success'
        assert 'file' in data
        assert 'stored_name' in data['file']
        assert 'url' in data['file']
        assert 'size' in data['file']
        assert data['file']['size'] > 0

    def test_upload_returns_stored_name(self, client, test_images_dir):
        with open(str(test_images_dir / "simple.png"), 'rb') as f:
            resp = client.post(
                '/api/upload/',
                data={'file': (f, 'simple.png', 'image/png')},
                content_type='multipart/form-data'
            )
        stored_name = resp.get_json()['file']['stored_name']
        # stored_name should be a uuid hex + extension, not the original filename
        assert stored_name.endswith('.png')
        assert 'simple' not in stored_name

    def test_upload_jpeg(self, client, tmp_path):
        p = tmp_path / "test.jpg"
        Image.new("RGB", (100, 100), color=(200, 100, 50)).save(str(p), format='JPEG')
        with open(str(p), 'rb') as f:
            resp = client.post(
                '/api/upload/',
                data={'file': (f, 'test.jpg', 'image/jpeg')},
                content_type='multipart/form-data'
            )
        assert resp.status_code == 200
        assert resp.get_json()['file']['stored_name'].endswith('.jpg')

    def test_upload_pdf(self, client, test_images_dir):
        with open(str(test_images_dir / "document.pdf"), 'rb') as f:
            resp = client.post(
                '/api/upload/',
                data={'file': (f, 'document.pdf', 'application/pdf')},
                content_type='multipart/form-data'
            )
        assert resp.status_code == 200
        assert resp.get_json()['file']['stored_name'].endswith('.pdf')

    def test_upload_large_image_accepted(self, client, test_images_dir):
        """Large image should be accepted (optimised server-side)"""
        with open(str(test_images_dir / "large.png"), 'rb') as f:
            resp = client.post(
                '/api/upload/',
                data={'file': (f, 'large.png', 'image/png')},
                content_type='multipart/form-data'
            )
        assert resp.status_code == 200


class TestUploadErrors:

    def test_upload_no_file(self, client):
        resp = client.post('/api/upload/', data={}, content_type='multipart/form-data')
        assert resp.status_code == 400
        assert 'error' in resp.get_json()

    def test_upload_invalid_extension(self, client):
        data = {'file': (io.BytesIO(b"hello"), 'file.exe', 'application/octet-stream')}
        resp = client.post('/api/upload/', data=data, content_type='multipart/form-data')
        assert resp.status_code == 400

    def test_upload_txt_rejected(self, client):
        data = {'file': (io.BytesIO(b"plain text"), 'notes.txt', 'text/plain')}
        resp = client.post('/api/upload/', data=data, content_type='multipart/form-data')
        assert resp.status_code == 400

    def test_upload_empty_filename(self, client):
        data = {'file': (io.BytesIO(b"data"), '', 'image/png')}
        resp = client.post('/api/upload/', data=data, content_type='multipart/form-data')
        assert resp.status_code == 400

    def test_upload_no_content_type(self, client):
        resp = client.post('/api/upload/')
        assert resp.status_code in (400, 415)


class TestUploadHealth:

    def test_health_returns_200(self, client):
        resp = client.get('/api/upload/health')
        assert resp.status_code == 200

    def test_health_reports_folder_exists(self, client):
        data = resp = client.get('/api/upload/health').get_json()
        assert data['upload_folder_exists'] is True
        assert data['upload_folder_writable'] is True