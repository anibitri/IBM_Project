"""
test_vision.py
Tests for the vision route (/api/vision/) and granite_vision_service.py
These use the real Granite Vision model.
"""

import pytest


# ═══════════════════════════════════════════════════════════════
# VISION SERVICE - direct unit tests
# ═══════════════════════════════════════════════════════════════

class TestVisionServiceDirect:

    @pytest.fixture(autouse=True)
    def service(self, manager):
        """Ensure vision model is loaded before each test"""
        if manager.vision_model is None or manager.vision_processor is None:
            pytest.skip("Vision model not loaded")
        from app.services.granite_vision_service import analyze_images
        self.analyze_images = analyze_images

    def test_returns_dict(self, diagram_path):
        result = self.analyze_images(diagram_path)
        assert isinstance(result, dict)

    def test_has_required_keys(self, diagram_path):
        result = self.analyze_images(diagram_path)
        assert 'status'     in result
        assert 'analysis'   in result
        assert 'components' in result
        assert 'answer'     in result

    def test_status_is_success(self, diagram_path):
        result = self.analyze_images(diagram_path)
        assert result['status'] == 'success'

    def test_analysis_has_summary(self, diagram_path):
        result = self.analyze_images(diagram_path)
        assert isinstance(result['analysis'], dict)
        assert 'summary' in result['analysis']
        assert len(result['analysis']['summary']) > 0

    def test_answer_is_non_empty_string(self, diagram_path):
        result = self.analyze_images(diagram_path)
        assert isinstance(result['answer'], str)
        assert len(result['answer']) > 5

    def test_components_is_list(self, diagram_path):
        result = self.analyze_images(diagram_path)
        assert isinstance(result['components'], list)

    def test_ar_extraction_task(self, diagram_path):
        result = self.analyze_images(diagram_path, task="ar_extraction")
        assert result['status'] == 'success'
        assert isinstance(result['components'], list)

    def test_works_on_simple_image(self, simple_path):
        result = self.analyze_images(simple_path)
        assert result['status'] == 'success'
        assert len(result['answer']) > 0

    def test_accepts_pil_image(self, diagram_path):
        from PIL import Image
        img    = Image.open(diagram_path).convert("RGB")
        result = self.analyze_images([img], task="ar_extraction")
        assert result['status'] == 'success'

    def test_large_image_auto_resized(self, test_images_dir):
        result = self.analyze_images(str(test_images_dir / "large.png"))
        # Should not crash - image is resized internally
        assert result['status'] == 'success'

    def test_invalid_path_returns_error(self):
        result = self.analyze_images("/nonexistent/path/image.png")
        assert result['status'] == 'error'

    def test_empty_input_returns_error(self):
        result = self.analyze_images([])
        assert result['status'] == 'error'

    def test_no_noise_tokens_in_output(self, diagram_path):
        result    = self.analyze_images(diagram_path)
        answer    = result['answer']
        noise     = ['<|end_of_text|>', '<fim_prefix>', '<|system|>', '<|user|>', '<|assistant|>']
        for token in noise:
            assert token not in answer, f"Noise token found in output: {token}"


# ═══════════════════════════════════════════════════════════════
# VISION ROUTE - HTTP endpoint tests
# ═══════════════════════════════════════════════════════════════

class TestVisionRouteAnalyze:

    def test_analyze_valid_stored_name(self, client, uploaded_diagram):
        resp = client.post(
            '/api/vision/analyze',
            json={'stored_name': uploaded_diagram}
        )
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['status']   == 'success'
        assert 'analysis'       in data
        assert 'components'     in data
        assert 'answer'         in data

    def test_analyze_ar_extraction_task(self, client, uploaded_diagram):
        resp = client.post(
            '/api/vision/analyze',
            json={'stored_name': uploaded_diagram, 'task': 'ar_extraction'}
        )
        data = resp.get_json()
        assert resp.status_code     == 200
        assert data['status']       == 'success'
        assert isinstance(data['components'], list)

    def test_analyze_missing_stored_name(self, client):
        resp = client.post('/api/vision/analyze', json={})
        assert resp.status_code == 400

    def test_analyze_nonexistent_file(self, client):
        resp = client.post(
            '/api/vision/analyze',
            json={'stored_name': 'doesnotexist.png'}
        )
        assert resp.status_code == 404

    def test_analyze_path_traversal_blocked(self, client):
        resp = client.post(
            '/api/vision/analyze',
            json={'stored_name': '../../etc/passwd'}
        )
        assert resp.status_code in (400, 403)

    def test_analysis_summary_not_empty(self, client, uploaded_diagram):
        resp    = client.post('/api/vision/analyze', json={'stored_name': uploaded_diagram})
        summary = resp.get_json()['analysis']['summary']
        assert len(summary) > 10

    def test_file_path_in_response(self, client, uploaded_diagram):
        resp = client.post('/api/vision/analyze', json={'stored_name': uploaded_diagram})
        assert 'file' in resp.get_json()


class TestVisionRouteBatchAnalyze:

    def test_batch_analyze_single_file(self, client, uploaded_diagram):
        resp = client.post(
            '/api/vision/batch-analyze',
            json={'stored_names': [uploaded_diagram]}
        )
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['totalFiles']    == 1
        assert data['successCount']  == 1
        assert len(data['results'])  == 1

    def test_batch_analyze_empty_list(self, client):
        resp = client.post('/api/vision/batch-analyze', json={'stored_names': []})
        assert resp.status_code == 400

    def test_batch_analyze_missing_field(self, client):
        resp = client.post('/api/vision/batch-analyze', json={})
        assert resp.status_code == 400

    def test_batch_analyze_nonexistent_file_reported(self, client, uploaded_diagram):
        resp = client.post(
            '/api/vision/batch-analyze',
            json={'stored_names': [uploaded_diagram, 'missing.png']}
        )
        data    = resp.get_json()
        results = {r['file']: r['status'] for r in data['results']}
        assert results[uploaded_diagram] == 'success'
        assert results['missing.png']    == 'error'


class TestVisionRouteHealth:

    def test_health_200(self, client):
        resp = client.get('/api/vision/health')
        assert resp.status_code == 200

    def test_health_vision_model_loaded(self, client):
        data = client.get('/api/vision/health').get_json()
        assert data['vision_model_loaded'] is True