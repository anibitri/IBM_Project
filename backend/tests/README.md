# Backend Test Suite

Real-model tests - no mocking. Models load **once per session**.

## Structure

```
tests/
├── conftest.py                 # Shared fixtures, image generation, model loading
├── pytest.ini                  # pytest config
├── test_upload_route.py        # POST /api/upload/
├── test_vision.py              # Vision service + /api/vision/
├── test_ar.py                  # AR service   + /api/ar/
├── test_ai.py                  # AI service   + /api/ai/
├── test_preprocess.py          # Preprocess service + /api/process/
├── test_health_and_security.py # /api/health, path traversal, input validation
└── test_integration.py         # Full end-to-end pipeline tests
```

## Setup

```bash
pip install pytest pytest-timeout
```

## Running

```bash
# All tests (from backend/)
pytest tests/

# Single file
pytest tests/test_ar.py

# Single class
pytest tests/test_ar.py::TestARServiceDirect

# Single test
pytest tests/test_ar.py::TestARServiceDirect::test_detects_components

# Skip slow tests
pytest tests/ -m "not slow"

# Only smoke tests
pytest tests/ -m smoke

# Stop on first failure
pytest tests/ -x

# Show print statements (useful when debugging model output)
pytest tests/ -s

# Run fast tests only (skip integration)
pytest tests/ --ignore=tests/test_integration.py
```

## Test Count by File

| File                       | Tests |
|----------------------------|-------|
| test_upload_route.py       |  ~15  |
| test_vision.py             |  ~25  |
| test_ar.py                 |  ~35  |
| test_ai.py                 |  ~45  |
| test_preprocess.py         |  ~30  |
| test_health_and_security.py|  ~35  |
| test_integration.py        |  ~25  |
| **Total**                  | **~210** |

## Notes

- Models load **once** at session start (expensive). Tests reuse them.
- The `uploaded_diagram` fixture uploads once per session too.
- Integration tests run the full pipeline - expect ~2-5 min on CPU.
- Performance tests use loose timeouts (60s vision, 120s AR) for CPU.
- Path traversal tests run parametrized with 7 attack vectors each.