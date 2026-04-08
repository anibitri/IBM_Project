"""
test_ai.py
Tests for the AI route (/api/ai/) and granite_ai_service.py

The Granite Vision model is used for BOTH vision analysis and text chat.
No separate chat model exists. Service tests skip if not in mock mode and
the vision model is not loaded (i.e. running on a machine without a GPU).
Set GRANITE_MOCK=1 to run all tests without a GPU using IBM OTel mock responses.
"""

import pytest


# ═══════════════════════════════════════════════════════════════
# AI SERVICE - direct unit tests
# ═══════════════════════════════════════════════════════════════

class TestAIServiceAnalyzeContext:

    @pytest.fixture(autouse=True)
    def service(self, manager):
        if not manager.mock_mode and manager.vision_model is None:
            pytest.skip("Chat model not loaded")
        from app.services.granite_ai_service import ai_service
        self.ai = ai_service

    def test_returns_dict(self):
        result = self.ai.analyze_context(text_excerpt="A circuit diagram with resistors.")
        assert isinstance(result, dict)

    def test_has_status_and_answer(self):
        result = self.ai.analyze_context(text_excerpt="CPU connected to RAM via a bus.")
        assert 'status' in result
        assert 'answer' in result

    def test_status_is_ok(self):
        result = self.ai.analyze_context(text_excerpt="A network topology diagram.")
        assert result['status'] == 'ok'

    def test_answer_is_non_empty_string(self):
        result = self.ai.analyze_context(text_excerpt="System architecture overview.")
        assert isinstance(result['answer'], str)
        assert len(result['answer']) > 10

    def test_accepts_vision_dict(self):
        vision = {'analysis': {'summary': 'Circuit diagram with capacitors and resistors.'}}
        result = self.ai.analyze_context(vision=vision)
        assert result['status'] == 'ok'

    def test_accepts_components_list(self):
        components = [
            {'id': 'c0', 'label': 'CPU',  'description': 'Processor', 'confidence': 0.9},
            {'id': 'c1', 'label': 'RAM',  'description': 'Memory',    'confidence': 0.85},
        ]
        result = self.ai.analyze_context(components=components)
        assert result['status'] == 'ok'

    def test_software_context_type(self):
        result = self.ai.analyze_context(
            text_excerpt="UML class diagram with UserController and AuthService.",
            context_type='software'
        )
        assert result['status'] == 'ok'

    def test_electronics_context_type(self):
        result = self.ai.analyze_context(
            text_excerpt="Circuit with 10k resistor and 100nF capacitor.",
            context_type='electronics'
        )
        assert result['status'] == 'ok'

    def test_network_context_type(self):
        result = self.ai.analyze_context(
            text_excerpt="Network topology with router, firewall, and load balancer.",
            context_type='network'
        )
        assert result['status'] == 'ok'

    def test_no_input_returns_error(self):
        result = self.ai.analyze_context()
        assert result['status'] == 'error'

    def test_answer_has_no_prompt_echo(self):
        excerpt = "This is my specific test excerpt about a GPS module."
        result  = self.ai.analyze_context(text_excerpt=excerpt)
        # The raw prompt should not appear verbatim in the answer
        assert "Task:" not in result['answer']
        assert "Context:" not in result['answer']

    def test_combined_inputs(self):
        result = self.ai.analyze_context(
            text_excerpt="PCB layout with power rail and ground plane.",
            vision={'analysis': {'summary': 'PCB diagram.'}},
            components=[{'id': 'c0', 'label': 'VCC', 'description': 'Power rail', 'confidence': 0.9}]
        )
        assert result['status'] == 'ok'
        assert len(result['answer']) > 10


class TestAIServiceChat:

    @pytest.fixture(autouse=True)
    def service(self, manager):
        if not manager.mock_mode and manager.vision_model is None:
            pytest.skip("Chat model not loaded")
        from app.services.granite_ai_service import ai_service
        self.ai = ai_service

    def test_returns_dict(self):
        result = self.ai.chat_with_document(
            query="What components are shown?",
            context="A diagram with CPU, RAM, and GPU."
        )
        assert isinstance(result, dict)

    def test_has_status_and_answer(self):
        result = self.ai.chat_with_document(
            query="What does the CPU connect to?",
            context="CPU is connected to RAM via bus."
        )
        assert 'status' in result
        assert 'answer' in result

    def test_answer_is_string(self):
        result = self.ai.chat_with_document(
            query="Describe the storage component.",
            context="System with storage controller managing SSD and HDD."
        )
        assert isinstance(result['answer'], str)
        assert len(result['answer']) > 5

    def test_accepts_chat_history(self):
        history = [
            {'role': 'user',      'content': 'What is in this diagram?'},
            {'role': 'assistant', 'content': 'It shows a CPU and RAM.'},
        ]
        result = self.ai.chat_with_document(
            query="Tell me more about the RAM.",
            context="System architecture with CPU and RAM.",
            chat_history=history
        )
        assert result['status'] == 'ok'

    def test_accepts_dict_context(self):
        context = {
            'text_excerpt': 'Network diagram with firewall and router.',
            'vision': {'analysis': {'summary': 'Network topology.'}},
            'components': []
        }
        result = self.ai.chat_with_document(
            query="What is the firewall protecting?",
            context=context
        )
        assert result['status'] == 'ok'

    def test_empty_history_ok(self):
        result = self.ai.chat_with_document(
            query="What is shown?",
            context="A simple circuit diagram.",
            chat_history=[]
        )
        assert result['status'] == 'ok'


class TestAIServiceSummarizeComponents:

    @pytest.fixture(autouse=True)
    def service(self, manager):
        if not manager.mock_mode and manager.vision_model is None:
            pytest.skip("Chat model not loaded")
        from app.services.granite_ai_service import ai_service
        self.ai = ai_service

    def test_returns_dict(self):
        comps  = [{'id': 'c0', 'label': 'CPU', 'description': 'Processor', 'confidence': 0.9}]
        result = self.ai.summarize_components(components=comps)
        assert isinstance(result, dict)

    def test_has_summary_key(self):
        comps  = [{'id': 'c0', 'label': 'RAM', 'description': 'Memory', 'confidence': 0.85}]
        result = self.ai.summarize_components(components=comps)
        print(result)
        assert 'summary' in result

    def test_empty_components_returns_error(self):
        result = self.ai.summarize_components(components=[])
        assert result['status'] == 'error'

    def test_accepts_relationships(self):
        comps = [
            {'id': 'c0', 'label': 'CPU', 'description': None, 'confidence': 0.9},
            {'id': 'c1', 'label': 'RAM', 'description': None, 'confidence': 0.8},
        ]
        rels   = {'connections': [{'from': 'c0', 'to': 'c1', 'distance': 0.1}]}
        result = self.ai.summarize_components(components=comps, relationships=rels)
        assert result['status'] == 'ok'


class TestAIServiceGenerateInsights:

    @pytest.fixture(autouse=True)
    def service(self, manager):
        if not manager.mock_mode and manager.vision_model is None:
            pytest.skip("Chat model not loaded")
        from app.services.granite_ai_service import ai_service
        self.ai = ai_service

    def test_returns_dict(self):
        result = self.ai.generate_insights(text_content="System with microcontroller.")
        assert isinstance(result, dict)

    def test_has_insights_key(self):
        result = self.ai.generate_insights(text_content="PCB with power management IC.")
        assert 'insights' in result

    def test_insights_is_list(self):
        result = self.ai.generate_insights(text_content="Network topology diagram.")
        assert isinstance(result['insights'], list)

    def test_all_insight_types(self):
        for insight_type in ['architecture', 'complexity', 'optimization', 'relationships', 'general']:
            result = self.ai.generate_insights(
                text_content="A complex system diagram.",
                insight_type=insight_type
            )
            assert result['status'] == 'ok', f"Failed for insight_type={insight_type}"

    def test_no_input_still_returns_dict(self):
        result = self.ai.generate_insights()
        assert isinstance(result, dict)


# ═══════════════════════════════════════════════════════════════
# AI ROUTE - HTTP endpoint tests
# ═══════════════════════════════════════════════════════════════

class TestAIRouteAnalyze:

    def test_analyze_text_excerpt(self, client):
        resp = client.post(
            '/api/ai/analyze',
            json={'text_excerpt': 'A circuit diagram with resistors and capacitors.'}
        )
        data = resp.get_json()
        assert resp.status_code  == 200
        assert data['status']    == 'success'
        assert 'ai'              in data
        assert 'answer'          in data['ai']

    def test_analyze_with_vision(self, client):
        resp = client.post('/api/ai/analyze', json={
            'vision': {'analysis': {'summary': 'Network diagram with router and switch.'}},
            'context_type': 'network'
        })
        assert resp.status_code == 200

    def test_analyze_with_components(self, client):
        resp = client.post('/api/ai/analyze', json={
            'components': [{'id': 'c0', 'label': 'CPU', 'description': 'Processor', 'confidence': 0.9}]
        })
        assert resp.status_code == 200

    def test_analyze_no_input_returns_400(self, client):
        resp = client.post('/api/ai/analyze', json={})
        assert resp.status_code == 400

    def test_analyze_all_context_types(self, client):
        for ctx in ['general', 'software', 'electronics', 'mechanical', 'network']:
            resp = client.post('/api/ai/analyze', json={
                'text_excerpt': 'Technical diagram.',
                'context_type': ctx
            })
            assert resp.status_code == 200, f"Failed for context_type={ctx}"


class TestAIRouteAsk:

    def test_ask_basic_question(self, client):
        resp = client.post('/api/ai/ask', json={
            'query':   'What components are in this diagram?',
            'context': 'Architecture diagram showing CPU, RAM, and GPU.'
        })
        data = resp.get_json()
        assert resp.status_code          == 200
        assert data['status']            == 'ok'
        assert len(data['answer'])       > 5

    def test_ask_with_history(self, client):
        resp = client.post('/api/ai/ask', json={
            'query':   'What does the GPU do?',
            'context': 'System with CPU and GPU for machine learning.',
            'history': [
                {'role': 'user',      'content': 'What is in the diagram?'},
                {'role': 'assistant', 'content': 'It shows a CPU and GPU.'},
            ]
        })
        assert resp.status_code == 200

    def test_ask_missing_query_returns_400(self, client):
        resp = client.post('/api/ai/ask', json={'context': 'Some context'})
        assert resp.status_code == 400

    def test_ask_missing_context_returns_400(self, client):
        resp = client.post('/api/ai/ask', json={'query': 'What is this?'})
        assert resp.status_code == 400

    def test_ask_empty_query_returns_400(self, client):
        resp = client.post('/api/ai/ask', json={'query': '', 'context': 'ctx'})
        assert resp.status_code == 400


class TestAIRouteSummarizeComponents:

    def test_summarize_valid_components(self, client):
        resp = client.post('/api/ai/summarize-components', json={
            'components': [
                {'id': 'c0', 'label': 'CPU',  'description': 'Processor',      'confidence': 0.9},
                {'id': 'c1', 'label': 'RAM',  'description': 'Memory',         'confidence': 0.8},
                {'id': 'c2', 'label': 'GPU',  'description': 'Graphics unit',  'confidence': 0.75},
            ]
        })
        data = resp.get_json()
        assert resp.status_code     == 200
        assert data['status']       == 'success'
        assert len(data['summary']) > 5

    def test_summarize_empty_components_returns_400(self, client):
        resp = client.post('/api/ai/summarize-components', json={'components': []})
        assert resp.status_code == 400

    def test_summarize_with_relationships(self, client):
        resp = client.post('/api/ai/summarize-components', json={
            'components':    [{'id': 'c0', 'label': 'Router', 'description': None, 'confidence': 0.9}],
            'relationships': {'connections': []},
            'document_type': 'network'
        })
        assert resp.status_code == 200


class TestAIRouteGenerateInsights:

    def test_generate_insights_with_text(self, client):
        resp = client.post('/api/ai/generate-insights', json={
            'text_content': 'Microservices architecture with API gateway and databases.',
            'insight_type': 'architecture'
        })
        data = resp.get_json()
        assert resp.status_code         == 200
        assert data['status']           == 'success'
        assert isinstance(data['insights'], list)

    def test_generate_insights_no_input_still_responds(self, client):
        resp = client.post('/api/ai/generate-insights', json={})
        assert resp.status_code == 200


class TestAIRouteCompareDocuments:

    def test_compare_two_documents(self, client):
        resp = client.post('/api/ai/compare-documents', json={
            'document1': 'Monolithic architecture with single database.',
            'document2': 'Microservices architecture with multiple databases.'
        })
        data = resp.get_json()
        assert resp.status_code      == 200
        assert data['status']        == 'success'
        assert 'comparison'          in data
        assert len(data['comparison']) > 5

    def test_compare_missing_document1(self, client):
        resp = client.post('/api/ai/compare-documents', json={
            'document2': 'Some doc'
        })
        assert resp.status_code == 400

    def test_compare_missing_document2(self, client):
        resp = client.post('/api/ai/compare-documents', json={
            'document1': 'Some doc'
        })
        assert resp.status_code == 400


class TestAIRouteAskStart:
    """Tests for the non-blocking POST /api/ai/ask/start endpoint."""

    def test_start_returns_202_and_job_id(self, client):
        resp = client.post('/api/ai/ask/start', json={
            'query':   'What components are in this diagram?',
            'context': 'Architecture diagram showing CPU, RAM, and GPU.'
        })
        data = resp.get_json()
        assert resp.status_code == 202
        assert 'job_id' in data
        assert data['status'] == 'queued'

    def test_start_missing_query_returns_400(self, client):
        resp = client.post('/api/ai/ask/start', json={'context': 'Some context'})
        assert resp.status_code == 400

    def test_start_missing_context_returns_400(self, client):
        resp = client.post('/api/ai/ask/start', json={'query': 'What is this?'})
        assert resp.status_code == 400

    def test_start_empty_query_returns_400(self, client):
        resp = client.post('/api/ai/ask/start', json={'query': '', 'context': 'ctx'})
        assert resp.status_code == 400

    def test_chat_alias_also_returns_202(self, client):
        resp = client.post('/api/ai/chat/start', json={
            'query':   'Describe the network topology.',
            'context': 'Network diagram with router and firewall.'
        })
        assert resp.status_code == 202
        assert 'job_id' in resp.get_json()


class TestAIRouteAskStatus:
    """Tests for the polling GET /api/ai/ask/status/<job_id> endpoint."""

    def test_unknown_job_id_returns_404(self, client):
        resp = client.get('/api/ai/ask/status/nonexistent-job-id')
        assert resp.status_code == 404

    def test_status_after_start_is_valid(self, client):
        # Submit a job then immediately poll — status must be one of the known states.
        start = client.post('/api/ai/ask/start', json={
            'query':   'What is shown?',
            'context': 'Simple circuit diagram.'
        })
        job_id = start.get_json()['job_id']
        resp   = client.get(f'/api/ai/ask/status/{job_id}')
        assert resp.status_code == 200
        assert resp.get_json()['status'] in ('queued', 'processing', 'success', 'error')

    def test_full_polling_flow_returns_answer(self, client):
        """Poll until success (or timeout) and verify the answer field is present."""
        import time
        start = client.post('/api/ai/ask/start', json={
            'query':   'What components are visible?',
            'context': 'IBM OTel pipeline diagram.'
        })
        assert start.status_code == 202
        job_id = start.get_json()['job_id']

        for _ in range(30):  # up to ~15 s in tests (0.5 s poll)
            time.sleep(0.5)
            resp = client.get(f'/api/ai/ask/status/{job_id}')
            data = resp.get_json()
            if data['status'] == 'success':
                assert 'answer' in data['result']
                assert len(data['result']['answer']) > 5
                return
            if data['status'] == 'error':
                pytest.fail(f"Job ended with error: {data['result']}")

        pytest.fail("Job did not complete within the expected time")

    def test_chat_alias_status_works(self, client):
        start = client.post('/api/ai/chat/start', json={
            'query':   'What is the role of the collector?',
            'context': 'IBM OTel pipeline.'
        })
        job_id = start.get_json()['job_id']
        resp   = client.get(f'/api/ai/chat/status/{job_id}')
        assert resp.status_code == 200


class TestAIRouteHealth:

    def test_health_200(self, client):
        assert client.get('/api/ai/health').status_code == 200

    def test_health_model_loaded(self, client):
        data = client.get('/api/ai/health').get_json()
        assert data['ai_model_loaded'] is True

    def test_health_mock_mode_field_present(self, client):
        data = client.get('/api/ai/health').get_json()
        assert 'mock_mode' in data
        assert isinstance(data['mock_mode'], bool)


# ═══════════════════════════════════════════════════════════════
# MOCK MODE — IBM OTel response tests
# Run with GRANITE_MOCK=1 (no GPU required).
# Verify that mock responses are IBM OTel-aware, not generic placeholders.
# ═══════════════════════════════════════════════════════════════

class TestAIMockResponses:

    @pytest.fixture(autouse=True)
    def require_mock_mode(self, manager):
        if not manager.mock_mode:
            pytest.skip("Mock mode tests only run with GRANITE_MOCK=1")
        from app.services.granite_ai_service import ai_service
        self.ai = ai_service

    # ── _mock_chat_response keyword routing ──────────────────

    def test_component_query_returns_component_info(self):
        result = self.ai.chat_with_document(
            query="What components are in this diagram?",
            context="IBM OTel pipeline"
        )
        answer = result['answer'].lower()
        assert any(w in answer for w in ['collector', 'instana', 'app', 'exporter', 'component'])

    def test_flow_query_returns_flow_info(self):
        result = self.ai.chat_with_document(
            query="How does data flow through the pipeline?",
            context="IBM OTel pipeline"
        )
        answer = result['answer'].lower()
        assert any(w in answer for w in ['flow', 'data', 'collector', 'instana', 'otlp'])

    def test_collector_query_returns_collector_info(self):
        result = self.ai.chat_with_document(
            query="What does the OpenTelemetry Collector do?",
            context="IBM OTel pipeline"
        )
        answer = result['answer'].lower()
        assert 'collector' in answer

    def test_instana_query_returns_instana_info(self):
        result = self.ai.chat_with_document(
            query="What is Instana?",
            context="IBM OTel pipeline"
        )
        answer = result['answer'].lower()
        assert 'instana' in answer

    def test_otlp_query_returns_protocol_info(self):
        result = self.ai.chat_with_document(
            query="What is the OTLP protocol?",
            context="IBM OTel pipeline"
        )
        answer = result['answer'].lower()
        assert 'otlp' in answer or 'opentelemetry' in answer

    def test_unrecognised_query_returns_default_response(self):
        result = self.ai.chat_with_document(
            query="xyz123 totally unrelated",
            context="IBM OTel pipeline"
        )
        assert isinstance(result['answer'], str)
        assert len(result['answer']) > 20

    # ── analyze_context returns IBM OTel summary ─────────────

    def test_analyze_context_returns_otel_summary(self):
        result = self.ai.analyze_context(text_excerpt="IBM OTel pipeline diagram")
        assert result['status'] == 'ok'
        answer = result['answer'].lower()
        assert any(w in answer for w in ['opentelemetry', 'instana', 'collector', 'pipeline'])

    def test_analyze_context_answer_is_not_placeholder(self):
        result = self.ai.analyze_context(text_excerpt="some content")
        assert 'placeholder' not in result['answer'].lower()
        assert 'implement' not in result['answer'].lower()

    # ── Route-level mock mode ─────────────────────────────────

    def test_route_ask_returns_200_in_mock_mode(self, client):
        resp = client.post('/api/ai/ask', json={
            'query':   'What is the OTel Collector?',
            'context': 'IBM OTel pipeline'
        })
        assert resp.status_code == 200
        assert len(resp.get_json()['answer']) > 10

    def test_route_analyze_returns_200_in_mock_mode(self, client):
        resp = client.post('/api/ai/analyze', json={
            'text_excerpt': 'IBM OpenTelemetry observability pipeline'
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data['status'] == 'success'
        assert len(data['ai']['answer']) > 10