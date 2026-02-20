"""
test_ar.py
Tests for the AR route (/api/ar/) and ar_service.py
These use the real SAM model.
"""

import pytest


# ═══════════════════════════════════════════════════════════════
# AR SERVICE - direct unit tests
# ═══════════════════════════════════════════════════════════════

class TestARServiceDirect:

    @pytest.fixture(autouse=True)
    def service(self, manager):
        if manager.ar_model is None:
            pytest.skip("SAM model not loaded")
        from app.services.ar_service import ar_service
        self.ar_service = ar_service

    # --- extract_document_features ---

    def test_returns_list(self, diagram_path):
        result = self.ar_service.extract_document_features(diagram_path)
        assert isinstance(result, list)

    def test_detects_components(self, diagram_path):
        result = self.ar_service.extract_document_features(diagram_path)
        assert len(result) > 0, "Expected at least one component in diagram"

    def test_component_has_required_fields(self, diagram_path):
        result    = self.ar_service.extract_document_features(diagram_path)
        required  = {'id', 'x', 'y', 'width', 'height', 'confidence', 'label'}
        for comp in result:
            missing = required - set(comp.keys())
            assert not missing, f"Component missing fields: {missing}"

    def test_normalised_coordinates_in_range(self, diagram_path):
        result = self.ar_service.extract_document_features(diagram_path)
        for comp in result:
            assert 0.0 <= comp['x']      <= 1.0, f"x out of range: {comp['x']}"
            assert 0.0 <= comp['y']      <= 1.0, f"y out of range: {comp['y']}"
            assert 0.0 <  comp['width']  <= 1.0, f"width out of range: {comp['width']}"
            assert 0.0 <  comp['height'] <= 1.0, f"height out of range: {comp['height']}"

    def test_confidence_in_range(self, diagram_path):
        result = self.ar_service.extract_document_features(diagram_path)
        for comp in result:
            assert comp['confidence'] >= 0.0

    def test_ids_are_unique(self, diagram_path):
        result = self.ar_service.extract_document_features(diagram_path)
        ids    = [c['id'] for c in result]
        assert len(ids) == len(set(ids)), "Duplicate component IDs found"

    def test_hints_accepted(self, diagram_path):
        hints  = ['CPU', 'RAM', 'GPU', 'Storage']
        result = self.ar_service.extract_document_features(diagram_path, hints=hints)
        assert isinstance(result, list)

    def test_empty_hints_ok(self, diagram_path):
        result = self.ar_service.extract_document_features(diagram_path, hints=[])
        assert isinstance(result, list)

    def test_simple_image_returns_list(self, simple_path):
        result = self.ar_service.extract_document_features(simple_path)
        assert isinstance(result, list)
        assert len(result) > 0

    def test_no_full_image_boxes(self, diagram_path):
        """No component should span almost the entire image"""
        result = self.ar_service.extract_document_features(diagram_path)
        for comp in result:
            area = comp['width'] * comp['height']
            assert area < 0.85, f"Component spans {area*100:.0f}% of image (likely background)"

    def test_invalid_path_returns_empty(self):
        result = self.ar_service.extract_document_features("/no/such/file.png")
        assert result == []

    # --- analyze_component_relationships ---

    def test_relationships_returns_dict(self, diagram_path):
        components = self.ar_service.extract_document_features(diagram_path)
        if len(components) < 2:
            pytest.skip("Need at least 2 components for relationship test")
        result = self.ar_service.analyze_component_relationships(components)
        assert isinstance(result, dict)

    def test_relationships_has_connections_key(self, diagram_path):
        components = self.ar_service.extract_document_features(diagram_path)
        if len(components) < 2:
            pytest.skip("Need at least 2 components")
        result = self.ar_service.analyze_component_relationships(components)
        assert 'connections' in result

    def test_relationships_empty_input(self):
        result = self.ar_service.analyze_component_relationships([])
        assert isinstance(result, dict)

    def test_relationships_single_component(self):
        single = [{
            'id': 'c0', 'x': 0.1, 'y': 0.1, 'width': 0.2, 'height': 0.2,
            'center_x': 0.2, 'center_y': 0.2, 'confidence': 0.9,
            'label': 'Test', 'description': None, 'area': 0.04
        }]
        result = self.ar_service.analyze_component_relationships(single)
        assert isinstance(result, dict)
        assert result.get('connections', []) == []


# ═══════════════════════════════════════════════════════════════
# AR ROUTE - HTTP endpoint tests
# ═══════════════════════════════════════════════════════════════

class TestARRouteGenerate:

    def test_generate_valid_file(self, client, uploaded_diagram):
        resp = client.post(
            '/api/ar/generate',
            json={'stored_name': uploaded_diagram}
        )
        data = resp.get_json()
        assert resp.status_code      == 200
        assert data['status']        == 'success'
        assert 'components'          in data
        assert 'componentCount'      in data
        assert 'relationships'       in data
        assert isinstance(data['components'], list)

    def test_generate_component_count_matches_list(self, client, uploaded_diagram):
        resp = client.post('/api/ar/generate', json={'stored_name': uploaded_diagram})
        data = resp.get_json()
        assert data['componentCount'] == len(data['components'])

    def test_generate_with_hints(self, client, uploaded_diagram):
        resp = client.post(
            '/api/ar/generate',
            json={'stored_name': uploaded_diagram, 'hints': ['CPU', 'RAM', 'GPU']}
        )
        assert resp.status_code          == 200
        assert resp.get_json()['status'] == 'success'

    def test_generate_with_vision_disabled(self, client, uploaded_diagram):
        resp = client.post(
            '/api/ar/generate',
            json={'stored_name': uploaded_diagram, 'use_vision': False}
        )
        assert resp.status_code == 200

    def test_generate_with_vision_enabled(self, client, uploaded_diagram):
        resp = client.post(
            '/api/ar/generate',
            json={'stored_name': uploaded_diagram, 'use_vision': True}
        )
        data = resp.get_json()
        assert resp.status_code == 200
        # When vision is used, hints should be populated
        assert 'hints' in data

    def test_generate_missing_stored_name(self, client):
        resp = client.post('/api/ar/generate', json={})
        assert resp.status_code == 400

    def test_generate_nonexistent_file(self, client):
        resp = client.post('/api/ar/generate', json={'stored_name': 'ghost.png'})
        assert resp.status_code == 404

    def test_generate_path_traversal_blocked(self, client):
        resp = client.post(
            '/api/ar/generate',
            json={'stored_name': '../../../etc/passwd'}
        )
        assert resp.status_code in (400, 403)

    def test_generate_components_have_required_fields(self, client, uploaded_diagram):
        resp       = client.post('/api/ar/generate', json={'stored_name': uploaded_diagram})
        components = resp.get_json()['components']
        required   = {'id', 'x', 'y', 'width', 'height', 'confidence', 'label'}
        for comp in components:
            missing = required - set(comp.keys())
            assert not missing, f"Missing fields: {missing}"

    def test_generate_coordinates_normalised(self, client, uploaded_diagram):
        resp       = client.post('/api/ar/generate', json={'stored_name': uploaded_diagram})
        components = resp.get_json()['components']
        for comp in components:
            assert 0.0 <= comp['x']     <= 1.0
            assert 0.0 <= comp['y']     <= 1.0
            assert 0.0 <  comp['width'] <= 1.0
            assert 0.0 <  comp['height']<= 1.0


class TestARRouteRelationships:

    def test_analyze_relationships_valid_components(self, client):
        components = [
            {'id': 'c0', 'x': 0.1, 'y': 0.1, 'width': 0.2, 'height': 0.2,
             'center_x': 0.2, 'center_y': 0.2, 'confidence': 0.9,
             'label': 'CPU', 'description': None, 'area': 0.04},
            {'id': 'c1', 'x': 0.4, 'y': 0.1, 'width': 0.2, 'height': 0.15,
             'center_x': 0.5, 'center_y': 0.175, 'confidence': 0.85,
             'label': 'RAM', 'description': None, 'area': 0.03},
        ]
        resp = client.post('/api/ar/analyze-relationships', json={'components': components})
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['status']   == 'success'
        assert 'relationships'  in data

    def test_analyze_relationships_empty_list(self, client):
        resp = client.post('/api/ar/analyze-relationships', json={'components': []})
        assert resp.status_code == 400

    def test_analyze_relationships_missing_field(self, client):
        resp = client.post('/api/ar/analyze-relationships', json={})
        assert resp.status_code == 400


class TestARRouteExtractMultiple:

    def test_extract_multiple_single_file(self, client, uploaded_diagram):
        resp = client.post(
            '/api/ar/extract-from-multiple',
            json={'stored_names': [uploaded_diagram]}
        )
        data = resp.get_json()
        assert resp.status_code == 200
        assert data['status']   == 'success'
        assert len(data['results']) == 1

    def test_extract_multiple_empty_list(self, client):
        resp = client.post('/api/ar/extract-from-multiple', json={'stored_names': []})
        assert resp.status_code == 400

    def test_extract_multiple_missing_file_reported(self, client, uploaded_diagram):
        resp = client.post(
            '/api/ar/extract-from-multiple',
            json={'stored_names': [uploaded_diagram, 'missing.png']}
        )
        data    = resp.get_json()
        results = {r['file']: r['status'] for r in data['results']}
        assert results[uploaded_diagram] == 'success'
        assert results['missing.png']    == 'error'


class TestARRouteHealth:

    def test_health_200(self, client):
        assert client.get('/api/ar/health').status_code == 200

    def test_health_ar_model_loaded(self, client):
        data = client.get('/api/ar/health').get_json()
        assert data['ar_model_loaded'] is True