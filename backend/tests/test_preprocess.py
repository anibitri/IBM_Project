"""
test_preprocess.py
Tests for preprocess_service.py and /api/process/ route.
Full pipeline: Vision → AR → AI.
"""

import pytest


# ═══════════════════════════════════════════════════════════════
# PREPROCESS SERVICE - direct unit tests
# ═══════════════════════════════════════════════════════════════

class TestPreprocessServiceImage:

    @pytest.fixture(autouse=True)
    def service(self, manager):
        if manager.vision_model is None or manager.ar_model is None:
            pytest.skip("Vision or AR model not loaded")
        from app.services.preprocess_service import preprocess_service
        self.service = preprocess_service

    def test_returns_dict(self, diagram_path):
        result = self.service.preprocess_document(diagram_path)
        assert isinstance(result, dict)

    def test_status_is_success(self, diagram_path):
        result = self.service.preprocess_document(diagram_path)
        assert result['status'] == 'success'

    def test_type_is_image(self, diagram_path):
        result = self.service.preprocess_document(diagram_path)
        assert result['type'] == 'image'

    def test_has_vision_key(self, diagram_path):
        result = self.service.preprocess_document(diagram_path)
        assert 'vision' in result
        assert isinstance(result['vision'], dict)

    def test_has_ar_key(self, diagram_path):
        result = self.service.preprocess_document(diagram_path)
        assert 'ar' in result
        assert isinstance(result['ar'], dict)

    def test_has_ai_key(self, diagram_path):
        result = self.service.preprocess_document(diagram_path)
        assert 'ai' in result

    def test_has_ai_summary(self, diagram_path):
        result = self.service.preprocess_document(diagram_path)
        assert 'ai_summary' in result
        assert isinstance(result['ai_summary'], str)

    def test_has_meta(self, diagram_path):
        result = self.service.preprocess_document(diagram_path)
        assert 'meta' in result
        meta   = result['meta']
        assert 'width'  in meta
        assert 'height' in meta
        assert 'aspect_ratio' in meta

    def test_meta_dimensions_correct(self, diagram_path):
        from PIL import Image
        img    = Image.open(diagram_path)
        result = self.service.preprocess_document(diagram_path)
        assert result['meta']['width']  == img.size[0]
        assert result['meta']['height'] == img.size[1]

    def test_ar_has_components(self, diagram_path):
        result     = self.service.preprocess_document(diagram_path)
        ar_result  = result['ar']
        assert 'components'     in ar_result
        assert 'componentCount' in ar_result
        assert ar_result['componentCount'] == len(ar_result['components'])

    def test_images_list_populated(self, diagram_path):
        result = self.service.preprocess_document(diagram_path)
        assert 'images' in result
        assert len(result['images']) == 1
        img_entry = result['images'][0]
        assert 'vision_summary'  in img_entry
        assert 'ar_components'   in img_entry
        assert 'component_count' in img_entry

    def test_vision_summary_not_empty(self, diagram_path):
        result  = self.service.preprocess_document(diagram_path)
        summary = result['vision'].get('analysis', {}).get('summary', '')
        assert len(summary) > 5

    def test_file_path_preserved(self, diagram_path):
        result = self.service.preprocess_document(diagram_path)
        assert result['file_path'] == diagram_path

    def test_skip_ar_flag(self, diagram_path):
        result = self.service.preprocess_document(diagram_path, extract_ar=False)
        assert result['status'] == 'success'
        # AR key should either be absent or empty
        ar = result.get('ar', {})
        assert ar.get('componentCount', 0) == 0 or ar == {}

    def test_skip_ai_flag(self, diagram_path):
        result = self.service.preprocess_document(diagram_path, generate_ai_summary=False)
        assert result['status'] == 'success'
        assert result.get('ai_summary', '') == ''

    def test_invalid_path_returns_error(self):
        result = self.service.preprocess_document("/no/such/file.png")
        assert result['status'] == 'error'

    def test_corrupt_image_returns_error(self, test_images_dir):
        result = self.service.preprocess_document(str(test_images_dir / "corrupt.png"))
        assert result['status'] == 'error'

    def test_unsupported_format_returns_error(self, tmp_path):
        p = tmp_path / "file.xyz"
        p.write_bytes(b"random data")
        result = self.service.preprocess_document(str(p))
        assert result['status'] == 'error'
        assert 'supported_formats' in result

    def test_simple_image_processed(self, simple_path):
        result = self.service.preprocess_document(simple_path)
        assert result['status'] == 'success'
        assert result['type']   == 'image'


class TestPreprocessServicePDF:

    @pytest.fixture(autouse=True)
    def service(self, manager):
        from app.services.preprocess_service import preprocess_service, HAS_DOCLING
        self.service     = preprocess_service
        self.has_docling = HAS_DOCLING

    def test_returns_dict(self, pdf_path):
        result = self.service.preprocess_document(pdf_path)
        assert isinstance(result, dict)

    def test_type_is_pdf(self, pdf_path):
        result = self.service.preprocess_document(pdf_path)
        assert result['type'] == 'pdf'

    def test_has_ar_key(self, pdf_path):
        result = self.service.preprocess_document(pdf_path)
        assert 'ar' in result

    def test_has_meta(self, pdf_path):
        result = self.service.preprocess_document(pdf_path)
        assert 'meta' in result
        assert 'has_text'   in result['meta']
        assert 'has_images' in result['meta']

    def test_text_extraction_attempted(self, pdf_path):
        result = self.service.preprocess_document(pdf_path)
        if self.has_docling:
            assert 'text_excerpt' in result
        else:
            # Graceful degradation
            assert result['status'] in ('success', 'error')

    def test_pdf_docling_unavailable_graceful(self, pdf_path, monkeypatch):
        import app.services.preprocess_service as ps
        monkeypatch.setattr(ps, 'HAS_DOCLING', False)
        result = ps.preprocess_service.preprocess_document(pdf_path)
        # Should still return a result, not crash
        assert isinstance(result, dict)


# ═══════════════════════════════════════════════════════════════
# PROCESS ROUTE - HTTP endpoint tests
# ═══════════════════════════════════════════════════════════════

class TestProcessRouteDocument:

    def test_process_valid_image(self, client, uploaded_diagram):
        resp = client.post(
            '/api/process/document',
            json={'stored_name': uploaded_diagram}
        )
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['status']   == 'success'
        assert data['type']     == 'image'

    def test_process_returns_ar_components(self, client, uploaded_diagram):
        resp       = client.post('/api/process/document', json={'stored_name': uploaded_diagram})
        data       = resp.get_json()
        ar         = data.get('ar', {})
        assert 'components'     in ar
        assert 'componentCount' in ar

    def test_process_returns_vision(self, client, uploaded_diagram):
        resp = client.post('/api/process/document', json={'stored_name': uploaded_diagram})
        data = resp.get_json()
        assert 'vision' in data

    def test_process_returns_ai(self, client, uploaded_diagram):
        resp = client.post('/api/process/document', json={'stored_name': uploaded_diagram})
        data = resp.get_json()
        assert 'ai' in data

    def test_process_returns_ai_summary(self, client, uploaded_diagram):
        resp = client.post('/api/process/document', json={'stored_name': uploaded_diagram})
        assert 'ai_summary' in resp.get_json()

    def test_process_returns_meta(self, client, uploaded_diagram):
        resp = client.post('/api/process/document', json={'stored_name': uploaded_diagram})
        assert 'meta' in resp.get_json()

    def test_process_missing_stored_name(self, client):
        resp = client.post('/api/process/document', json={})
        assert resp.status_code == 400

    def test_process_nonexistent_file(self, client):
        resp = client.post('/api/process/document', json={'stored_name': 'ghost.png'})
        assert resp.status_code == 404

    def test_process_path_traversal_blocked(self, client):
        resp = client.post(
            '/api/process/document',
            json={'stored_name': '../../etc/passwd'}
        )
        assert resp.status_code in (400, 403)

    def test_process_skip_ar(self, client, uploaded_diagram):
        resp = client.post('/api/process/document', json={
            'stored_name': uploaded_diagram,
            'extract_ar': False
        })
        assert resp.status_code == 200

    def test_process_skip_ai(self, client, uploaded_diagram):
        resp = client.post('/api/process/document', json={
            'stored_name':         uploaded_diagram,
            'generate_ai_summary': False
        })
        assert resp.status_code == 200

    def test_process_pdf(self, client, test_images_dir):
        """Upload and process a PDF"""
        with open(str(test_images_dir / "document.pdf"), 'rb') as f:
            upload_resp = client.post(
                '/api/upload/',
                data={'file': (f, 'document.pdf', 'application/pdf')},
                content_type='multipart/form-data'
            )
        stored_name = upload_resp.get_json()['file']['stored_name']

        resp = client.post('/api/process/document', json={'stored_name': stored_name})
        data = resp.get_json()
        assert data['type'] == 'pdf'


class TestProcessRouteHealth:

    def test_health_200(self, client):
        assert client.get('/api/process/health').status_code == 200