"""
test_integration.py
Full end-to-end pipeline tests.
Upload → Vision → AR → AI → Process
These exercise the entire backend as the mobile app would.
"""

import pytest
import time


class TestFullPipelineImage:
    """
    Simulates the complete mobile app flow for an image:
    1. Upload image
    2. Get vision analysis
    3. Generate AR overlay
    4. Ask AI a question
    5. Run full process pipeline
    """

    @pytest.fixture(scope="class")
    def uploaded(self, client, test_images_dir):
        """Upload once, use across all tests in this class"""
        with open(str(test_images_dir / "diagram.png"), 'rb') as f:
            resp = client.post(
                '/api/upload/',
                data={'file': (f, 'diagram.png', 'image/png')},
                content_type='multipart/form-data'
            )
        assert resp.status_code == 200
        return resp.get_json()['file']

    def test_step1_upload_succeeds(self, uploaded):
        assert uploaded['stored_name'] is not None
        assert uploaded['size'] > 0

    def test_step2_vision_analysis(self, client, uploaded):
        resp = client.post(
            '/api/vision/analyze',
            json={'stored_name': uploaded['stored_name'], 'task': 'ar_extraction'}
        )
        data = resp.get_json()
        assert resp.status_code    == 200
        assert data['status']      == 'success'
        assert len(data['answer']) > 0

    def test_step3_ar_generation(self, client, uploaded):
        resp = client.post(
            '/api/ar/generate',
            json={'stored_name': uploaded['stored_name'], 'use_vision': True}
        )
        data = resp.get_json()
        assert resp.status_code          == 200
        assert data['componentCount']    >= 0
        assert isinstance(data['components'], list)

    def test_step4_ai_question_answering(self, client, uploaded):
        # First get vision to use as context
        vision_resp = client.post(
            '/api/vision/analyze',
            json={'stored_name': uploaded['stored_name']}
        )
        context = vision_resp.get_json()

        # Now ask AI a question
        resp = client.post('/api/ai/ask', json={
            'query':   'What are the main components in this diagram?',
            'context': context,
        })
        data = resp.get_json()
        assert resp.status_code    == 200
        assert len(data['answer']) > 5

    def test_step5_full_process_pipeline(self, client, uploaded):
        resp = client.post(
            '/api/process/document',
            json={'stored_name': uploaded['stored_name']}
        )
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['status']   == 'success'
        assert data['type']     == 'image'
        # All pipeline stages should have run
        assert 'vision'      in data
        assert 'ar'          in data
        assert 'ai'          in data
        assert 'ai_summary'  in data
        assert 'meta'        in data


class TestFullPipelinePDF:
    """
    Simulates the mobile app flow for a PDF:
    1. Upload PDF
    2. Run full process pipeline (extracts images + text)
    """

    @pytest.fixture(scope="class")
    def uploaded_pdf(self, client, test_images_dir):
        with open(str(test_images_dir / "document.pdf"), 'rb') as f:
            resp = client.post(
                '/api/upload/',
                data={'file': (f, 'document.pdf', 'application/pdf')},
                content_type='multipart/form-data'
            )
        assert resp.status_code == 200
        return resp.get_json()['file']['stored_name']

    def test_pdf_upload_succeeds(self, uploaded_pdf):
        assert uploaded_pdf.endswith('.pdf')

    def test_pdf_process_returns_success(self, client, uploaded_pdf):
        resp = client.post('/api/process/document', json={'stored_name': uploaded_pdf})
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['type']     == 'pdf'

    def test_pdf_process_has_ar(self, client, uploaded_pdf):
        resp = client.post('/api/process/document', json={'stored_name': uploaded_pdf})
        assert 'ar' in resp.get_json()

    def test_pdf_process_has_meta(self, client, uploaded_pdf):
        resp = client.post('/api/process/document', json={'stored_name': uploaded_pdf})
        meta = resp.get_json().get('meta', {})
        assert 'has_text'   in meta
        assert 'has_images' in meta


class TestConversationFlow:
    """
    Tests multi-turn conversation with document context,
    simulating the AR chatbot feature.
    """

    def test_multi_turn_conversation(self, client):
        context = "Architecture diagram with CPU, RAM, GPU, and Network card."

        # Turn 1
        resp1 = client.post('/api/ai/ask', json={
            'query':   'What components are shown?',
            'context': context,
            'history': []
        })
        assert resp1.status_code == 200
        answer1 = resp1.get_json()['answer']

        # Turn 2 - builds on Turn 1
        resp2 = client.post('/api/ai/ask', json={
            'query':   'Tell me more about the GPU.',
            'context': context,
            'history': [
                {'role': 'user',      'content': 'What components are shown?'},
                {'role': 'assistant', 'content': answer1},
            ]
        })
        assert resp2.status_code         == 200
        assert len(resp2.get_json()['answer']) > 5

    def test_component_specific_question(self, client, uploaded_diagram):
        # Get real AR components first
        ar_resp = client.post(
            '/api/ar/generate',
            json={'stored_name': uploaded_diagram, 'use_vision': True}
        )
        components = ar_resp.get_json()['components']

        if not components:
            pytest.skip("No components detected")

        first_label = components[0].get('label', 'Component 1')

        # Ask about a specific component
        resp = client.post('/api/ai/ask', json={
            'query':   f'What does {first_label} do?',
            'context': {
                'components': components,
                'vision':     ar_resp.get_json().get('vision_analysis', {})
            }
        })
        assert resp.status_code == 200
        assert len(resp.get_json()['answer']) > 5


class TestARToAIPipeline:
    """
    Tests the specific flow:
    AR components → AI summarization → AI insights
    """

    def test_ar_components_fed_into_ai_summarize(self, client, uploaded_diagram):
        # Step 1: Get AR components
        ar_resp    = client.post('/api/ar/generate', json={'stored_name': uploaded_diagram})
        components = ar_resp.get_json()['components']
        rels       = ar_resp.get_json()['relationships']

        if not components:
            pytest.skip("No components to summarize")

        # Step 2: Summarize them
        summary_resp = client.post('/api/ai/summarize-components', json={
            'components':    components,
            'relationships': rels,
            'document_type': 'general'
        })
        data = summary_resp.get_json()
        assert summary_resp.status_code == 200
        assert len(data['summary'])     > 10

    def test_ar_components_fed_into_ai_insights(self, client, uploaded_diagram):
        # Step 1: Get AR components
        ar_resp    = client.post('/api/ar/generate', json={'stored_name': uploaded_diagram})
        components = ar_resp.get_json()['components']

        # Step 2: Generate insights
        resp = client.post('/api/ai/generate-insights', json={
            'ar_components': components,
            'insight_type':  'general'
        })
        data = resp.get_json()
        assert resp.status_code         == 200
        assert isinstance(data['insights'], list)

    def test_vision_to_ar_to_ai(self, client, uploaded_diagram):
        # Vision
        vision_resp = client.post(
            '/api/vision/analyze',
            json={'stored_name': uploaded_diagram, 'task': 'ar_extraction'}
        )
        vision_data = vision_resp.get_json()

        # AR with vision hints
        ar_resp = client.post('/api/ar/generate', json={
            'stored_name': uploaded_diagram,
            'hints':       vision_data.get('components', []),
            'use_vision':  False
        })
        ar_data = ar_resp.get_json()

        # AI analysis with both
        ai_resp = client.post('/api/ai/analyze', json={
            'vision':     {'analysis': vision_data.get('analysis', {})},
            'components': ar_data.get('components', []),
        })
        data = ai_resp.get_json()
        assert ai_resp.status_code == 200
        assert data['status']      == 'success'


class TestResponseConsistency:
    """
    Verify response format is consistent across repeated calls.
    Important for the mobile app to rely on.
    """

    def test_upload_response_format_consistent(self, client, test_images_dir):
        results = []
        for _ in range(2):
            with open(str(test_images_dir / "simple.png"), 'rb') as f:
                resp = client.post(
                    '/api/upload/',
                    data={'file': (f, 'simple.png', 'image/png')},
                    content_type='multipart/form-data'
                )
            results.append(set(resp.get_json()['file'].keys()))

        assert results[0] == results[1], "Upload response keys differ between calls"

    def test_ar_response_format_consistent(self, client, uploaded_diagram):
        resp1 = client.post('/api/ar/generate', json={'stored_name': uploaded_diagram})
        resp2 = client.post('/api/ar/generate', json={'stored_name': uploaded_diagram})

        keys1 = set(resp1.get_json().keys())
        keys2 = set(resp2.get_json().keys())
        assert keys1 == keys2, "AR response keys differ between calls"

    def test_vision_response_format_consistent(self, client, uploaded_diagram):
        resp1 = client.post('/api/vision/analyze', json={'stored_name': uploaded_diagram})
        resp2 = client.post('/api/vision/analyze', json={'stored_name': uploaded_diagram})

        keys1 = set(resp1.get_json().keys())
        keys2 = set(resp2.get_json().keys())
        assert keys1 == keys2

    def test_component_schema_consistent(self, client, uploaded_diagram):
        """Every component in every call should have the same fields"""
        resp       = client.post('/api/ar/generate', json={'stored_name': uploaded_diagram})
        components = resp.get_json()['components']

        if len(components) < 2:
            pytest.skip("Need 2+ components for consistency check")

        keys_per_component = [set(c.keys()) for c in components]
        assert all(k == keys_per_component[0] for k in keys_per_component), \
            "Components have inconsistent fields"


class TestPerformance:
    """
    Basic performance sanity checks.
    Not strict benchmarks - just ensures nothing is catastrophically slow.
    """

    def test_upload_under_5_seconds(self, client, test_images_dir):
        start = time.time()
        with open(str(test_images_dir / "diagram.png"), 'rb') as f:
            client.post(
                '/api/upload/',
                data={'file': (f, 'diagram.png', 'image/png')},
                content_type='multipart/form-data'
            )
        assert time.time() - start < 5.0, "Upload took longer than 5 seconds"

    def test_vision_under_60_seconds(self, client, uploaded_diagram):
        start = time.time()
        client.post('/api/vision/analyze', json={'stored_name': uploaded_diagram})
        elapsed = time.time() - start
        assert elapsed < 60.0, f"Vision analysis took {elapsed:.1f}s (limit 60s)"

    def test_ar_under_120_seconds(self, client, uploaded_diagram):
        start = time.time()
        client.post('/api/ar/generate', json={'stored_name': uploaded_diagram})
        elapsed = time.time() - start
        assert elapsed < 120.0, f"AR generation took {elapsed:.1f}s (limit 120s)"

    def test_health_under_1_second(self, client):
        start = time.time()
        client.get('/api/health')
        assert time.time() - start < 1.0, "Health check took over 1 second"