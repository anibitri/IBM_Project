"""
test_health.py  - Global health, model manager status, /api/routes
test_security.py - Path traversal, input validation, injection
"""

import pytest
import io

VALID_AUTH = {'Authorization': 'Bearer ibm-project-dev-token'}
INVALID_AUTH = {'Authorization': 'Bearer invalid-token'}


# ═══════════════════════════════════════════════════════════════
# GLOBAL HEALTH
# ═══════════════════════════════════════════════════════════════

class TestGlobalHealth:

    def test_api_health_200(self, client):
        resp = client.get('/api/health')
        assert resp.status_code in (200, 207)

    def test_api_health_returns_status(self, client):
        data = client.get('/api/health').get_json()
        assert 'status' in data
        assert data['status'] in ('healthy', 'degraded')

    def test_api_health_returns_models(self, client):
        data = client.get('/api/health').get_json()
        assert 'models' in data

    def test_api_health_vision_reported(self, client):
        data   = client.get('/api/health').get_json()
        models = data.get('models', {})
        assert 'vision' in models
        assert 'loaded' in models['vision']

    def test_api_health_ar_reported(self, client):
        data   = client.get('/api/health').get_json()
        models = data.get('models', {})
        assert 'ar' in models

    def test_api_health_mode_reported(self, client):
        data = client.get('/api/health').get_json()
        assert 'mode' in data
        assert data['mode'] in ('REAL AI', 'MOCK')

    def test_ai_health_reports_mock_mode(self, client):
        data = client.get('/api/ai/health').get_json()
        assert 'mock_mode' in data
        assert isinstance(data['mock_mode'], bool)

    def test_api_routes_200(self, client):
        resp = client.get('/api/routes')
        assert resp.status_code == 200

    def test_api_routes_lists_endpoints(self, client):
        data   = client.get('/api/routes').get_json()
        paths  = [r['path'] for r in data['routes']]
        for expected in ['/api/upload/', '/api/vision/analyze', '/api/ar/generate',
                         '/api/ai/analyze', '/api/process/start']:
            assert expected in paths, f"Missing endpoint: {expected}"

    def test_all_individual_health_checks(self, client):
        endpoints = [
            '/api/upload/health',
            '/api/vision/health',
            '/api/ar/health',
            '/api/ai/health',
            '/api/process/health',
        ]
        for ep in endpoints:
            resp = client.get(ep)
            assert resp.status_code == 200, f"{ep} returned {resp.status_code}"


class TestModelManagerStatus:

    def test_get_status_returns_dict(self, manager):
        status = manager.get_status()
        assert isinstance(status, dict)

    def test_get_status_has_vision(self, manager):
        status = manager.get_status()
        assert 'vision' in status
        expected = not status.get('mock_mode', False)
        assert status['vision']['loaded'] is expected

    def test_get_status_has_ar(self, manager):
        status = manager.get_status()
        assert 'ar' in status
        expected = not status.get('mock_mode', False)
        assert status['ar']['loaded'] is expected

    def test_get_status_all_loaded(self, manager):
        status = manager.get_status()
        assert status['all_loaded'] is True

    def test_get_status_hardware_info(self, manager):
        status = manager.get_status()
        assert 'hardware' in status
        hw = status['hardware']
        assert 'device'        in hw
        assert 'total_vram_gb' in hw

    def test_vision_model_is_not_none(self, manager):
        status = manager.get_status()
        if status.get('mock_mode', False):
            assert manager.vision_model is None
            assert manager.vision_processor is None
        else:
            assert manager.vision_model is not None
            assert manager.vision_processor is not None

    def test_ar_model_is_not_none(self, manager):
        status = manager.get_status()
        if status.get('mock_mode', False):
            assert manager.ar_model is None
        else:
            assert manager.ar_model is not None

    def test_vision_model_used_for_chat(self, manager):
        """Vision model is the sole inference model — no separate chat model."""
        status = manager.get_status()
        assert 'chat' not in status, "chat key should not exist — vision handles both roles"
        assert 'note' in status.get('vision', {}) or 'model_id' in status.get('vision', {})

    def test_no_chat_model_attribute(self, manager):
        """manager must not have chat_model or chat_tokenizer attributes."""
        assert not hasattr(manager, 'chat_model'), \
            "chat_model was removed — vision model handles chat"
        assert not hasattr(manager, 'chat_tokenizer'), \
            "chat_tokenizer was removed — vision processor handles tokenisation"


# ═══════════════════════════════════════════════════════════════
# SECURITY
# ═══════════════════════════════════════════════════════════════

class TestPathTraversalPrevention:
    """Every endpoint that accepts stored_name must block traversal"""

    TRAVERSAL_INPUTS = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        'subdir/../../etc/passwd',
        '/etc/passwd',
        'C:\\Windows\\System32',
        'valid.png/../../../etc/passwd',
        '%2e%2e%2fetc%2fpasswd',
    ]

    @pytest.mark.parametrize("payload", TRAVERSAL_INPUTS)
    def test_vision_analyze_blocks_traversal(self, client, payload):
        resp = client.post('/api/vision/analyze', json={'stored_name': payload})
        assert resp.status_code in (400, 403, 404), \
            f"Traversal not blocked for: {payload!r} (got {resp.status_code})"

    @pytest.mark.parametrize("payload", TRAVERSAL_INPUTS)
    def test_ar_generate_blocks_traversal(self, client, payload):
        resp = client.post('/api/ar/generate', json={'stored_name': payload})
        assert resp.status_code in (400, 403, 404), \
            f"Traversal not blocked for: {payload!r}"

    @pytest.mark.parametrize("payload", TRAVERSAL_INPUTS)
    def test_process_start_blocks_traversal(self, client, payload):
        resp = client.post('/api/process/start', json={'stored_name': payload})
        assert resp.status_code in (400, 403, 404), \
            f"Traversal not blocked for: {payload!r}"


class TestInputValidation:

    # --- Upload ---
    def test_upload_rejects_oversized_file(self, client):
        """File exceeding 50MB limit should be rejected"""
        big_data = io.BytesIO(b"x" * (51 * 1024 * 1024))
        resp     = client.post(
            '/api/upload/',
            data={'file': (big_data, 'big.png', 'image/png')},
            content_type='multipart/form-data'
        )
        assert resp.status_code in (400, 413)

    def test_upload_rejects_php_extension(self, client):
        resp = client.post(
            '/api/upload/',
            data={'file': (io.BytesIO(b"<?php echo 'hack'; ?>"), 'shell.php', 'image/png')},
            content_type='multipart/form-data'
        )
        assert resp.status_code == 400

    def test_upload_rejects_no_extension(self, client):
        resp = client.post(
            '/api/upload/',
            data={'file': (io.BytesIO(b"data"), 'noextension', 'image/png')},
            content_type='multipart/form-data'
        )
        assert resp.status_code == 400

    # --- Vision ---
    def test_vision_analyze_empty_body(self, client):
        resp = client.post('/api/vision/analyze', json={})
        assert resp.status_code == 400

    def test_vision_analyze_null_stored_name(self, client):
        resp = client.post('/api/vision/analyze', json={'stored_name': None})
        assert resp.status_code in (400, 404)

    # --- AR ---
    def test_ar_generate_empty_body(self, client):
        resp = client.post('/api/ar/generate', json={})
        assert resp.status_code == 400

    def test_ar_relationships_wrong_type(self, client):
        resp = client.post('/api/ar/analyze-relationships', json={'components': "not a list"})
        assert resp.status_code in (400, 500)

    # --- AI ---
    def test_ai_analyze_empty_body(self, client):
        resp = client.post('/api/ai/analyze', json={})
        assert resp.status_code == 400

    def test_ai_ask_empty_query(self, client):
        resp = client.post('/api/ai/ask', json={'query': '', 'context': 'ctx'})
        assert resp.status_code == 400

    def test_ai_ask_whitespace_query(self, client):
        resp = client.post('/api/ai/ask', json={'query': '   ', 'context': 'ctx'})
        assert resp.status_code == 400

    def test_ai_summarize_components_missing_key(self, client):
        resp = client.post('/api/ai/summarize-components', json={})
        assert resp.status_code == 400


class TestMethodNotAllowed:
    """Routes should reject wrong HTTP methods"""

    def test_upload_get_not_allowed(self, client):
        resp = client.get('/api/upload/')
        assert resp.status_code == 405

    def test_vision_analyze_get_not_allowed(self, client):
        resp = client.get('/api/vision/analyze')
        assert resp.status_code == 405

    def test_ar_generate_get_not_allowed(self, client):
        resp = client.get('/api/ar/generate')
        assert resp.status_code == 405

    def test_ai_analyze_get_not_allowed(self, client):
        resp = client.get('/api/ai/analyze')
        assert resp.status_code == 405

    def test_process_start_get_not_allowed(self, client):
        resp = client.get('/api/process/start')
        assert resp.status_code == 405


class TestUnknownEndpoints:

    def test_unknown_route_returns_404(self, client):
        resp = client.get('/api/doesnotexist')
        assert resp.status_code == 404

    def test_unknown_route_returns_json(self, client):
        resp = client.get('/api/doesnotexist')
        data = resp.get_json()
        assert data is not None
        assert 'error' in data
        assert data.get('status') == 'error'
        assert 'request_id' in data


class TestAuthentication:

    def test_protected_endpoint_requires_token(self, unauthenticated_client):
        resp = unauthenticated_client.post('/api/ai/analyze', json={'text_excerpt': 'hello'})
        assert resp.status_code == 401
        data = resp.get_json()
        assert data['status'] == 'error'
        assert data['code'] == 'AUTH_INVALID_TOKEN'
        assert data['error'] == 'Missing or invalid API token'
        assert 'request_id' in data

    def test_protected_endpoint_rejects_invalid_token(self, unauthenticated_client):
        resp = unauthenticated_client.post(
            '/api/ai/analyze',
            json={'text_excerpt': 'hello'},
            headers=INVALID_AUTH,
        )
        assert resp.status_code == 401
        data = resp.get_json()
        assert data['status'] == 'error'
        assert data['code'] == 'AUTH_INVALID_TOKEN'

    def test_valid_token_reaches_endpoint_validation(self, unauthenticated_client):
        resp = unauthenticated_client.post('/api/ai/analyze', json={}, headers=VALID_AUTH)
        assert resp.status_code == 400
        data = resp.get_json()
        assert data['status'] == 'error'
        assert data['error'] != 'Missing or invalid API token'

    def test_public_health_does_not_require_token(self, unauthenticated_client):
        resp = unauthenticated_client.get('/api/health')
        assert resp.status_code in (200, 207)

    def test_request_id_header_is_returned(self, unauthenticated_client):
        resp = unauthenticated_client.post('/api/ai/analyze', json={'text_excerpt': 'x'}, headers=INVALID_AUTH)
        data = resp.get_json()
        assert 'X-Request-ID' in resp.headers
        assert data.get('request_id') == resp.headers['X-Request-ID']


class TestHttpsAndSecurityHeaders:

    def test_api_security_headers_present(self, client):
        resp = client.get('/api/health')
        assert resp.headers.get('X-Content-Type-Options') == 'nosniff'
        assert resp.headers.get('Referrer-Policy') == 'no-referrer'
        assert resp.headers.get('Permissions-Policy') == 'camera=(self), microphone=()'
        assert resp.headers.get('X-Frame-Options') == 'DENY'

    def test_hsts_not_set_on_plain_http(self, client):
        resp = client.get('/api/health')
        assert 'Strict-Transport-Security' not in resp.headers

    def test_hsts_set_when_forwarded_proto_https(self, client):
        resp = client.get('/api/health', headers={'X-Forwarded-Proto': 'https'})
        assert resp.headers.get('Strict-Transport-Security') == 'max-age=31536000; includeSubDomains'

    def test_static_route_has_sameorigin_frame_header(self, client, uploaded_diagram):
        resp = client.get(f'/static/uploads/{uploaded_diagram}')
        assert resp.status_code == 200
        assert resp.headers.get('X-Frame-Options') == 'SAMEORIGIN'


class TestErrorHandlingContract:

    def test_404_error_payload_is_standardized(self, client):
        resp = client.get('/api/not-a-route')
        assert resp.status_code == 404
        data = resp.get_json()
        assert data['status'] == 'error'
        assert 'error' in data
        assert 'request_id' in data
        assert 'details' not in data

    def test_405_error_payload_is_standardized(self, client):
        resp = client.get('/api/ai/analyze')
        assert resp.status_code == 405
        data = resp.get_json()
        assert data['status'] == 'error'
        assert 'error' in data
        assert 'request_id' in data
        assert 'details' not in data

    def test_upload_oversize_returns_413_with_standard_error(self, client):
        big_data = io.BytesIO(b'x' * (51 * 1024 * 1024))
        resp = client.post(
            '/api/upload/',
            data={'file': (big_data, 'big.png', 'image/png')},
            content_type='multipart/form-data',
        )
        assert resp.status_code in (400, 413)
        data = resp.get_json()
        assert data['status'] == 'error'
        assert 'error' in data
        assert 'details' not in data