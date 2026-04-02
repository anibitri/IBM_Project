# Vision Routes Report (`vision_routes.py`)

## Overview

`vision_routes.py` exposes the Granite Vision model as an HTTP API. It handles file resolution, delegates to `granite_vision_service.analyze_images`, wraps GPU housekeeping around each call, and normalizes the response shape.

Blueprint: `vision_bp`, registered at `/api/vision`.

---

## Endpoints

### `POST /api/vision/analyze`

Runs vision analysis on a single image.

**Request body (JSON):**
```json
{
  "stored_name": "a3f8...png",
  "task": "ar_extraction"
}
```

| Field         | Required | Default             | Description                              |
|---------------|----------|---------------------|------------------------------------------|
| `stored_name` | one of two | —                 | Hash-based filename from the upload route |
| `file_path`   | one of two | —                 | Absolute path (must be in uploads folder) |
| `task`        | No       | `"general_analysis"` | `"ar_extraction"` or `"general_analysis"` |

**Processing:**
1. `ensure_json_object` validates the payload is a JSON object.
2. `resolve_file_path` resolves and security-checks the file path.
3. `manager.maybe_cleanup_before_inference()` — adaptive pre-inference VRAM cleanup.
4. `analyze_images(resolved_path, task=task)` — calls the vision service.
5. `manager.maybe_cleanup_after_inference()` — adaptive post-inference VRAM cleanup.
6. Response shape is normalized (handles non-dict service responses).

**Response (200):**
```json
{
  "status": "success",
  "analysis": {"summary": "..."},
  "components": ["API Gateway", "Redis Cache"],
  "answer": "...",
  "file": {"path": "/absolute/path/to/file"}
}
```

**Error responses:**
- `400` — invalid JSON payload.
- `404` — file not found.
- `500` — vision model error or unexpected exception.

---

### `POST /api/vision/batch-analyze`

Runs vision analysis on multiple images sequentially.

**Request body (JSON):**
```json
{
  "stored_names": ["file1.png", "file2.png"],
  "task": "ar_extraction"
}
```

| Field          | Required | Default               |
|----------------|----------|-----------------------|
| `stored_names` | Yes      | —                     |
| `task`         | No       | `"general_analysis"`  |

**Processing:**

Iterates over `stored_names`. For each file:
- Resolves the path via `resolve_file_path`.
- Wraps `analyze_images` in `maybe_cleanup_before/after_inference`.
- Appends a per-file result dict to `results`.
- Failures for individual files are caught and recorded as `"status": "error"` entries without aborting the rest of the batch.

**Response (200):**
```json
{
  "status": "success",
  "results": [
    {
      "file": "file1.png",
      "status": "success",
      "analysis": {...},
      "components": [...],
      "answer": "..."
    },
    {
      "file": "file2.png",
      "status": "error",
      "error": "File not found"
    }
  ],
  "totalFiles": 2,
  "successCount": 1
}
```

---

### `GET /api/vision/health`

Returns whether both the vision model and processor are loaded:
```json
{
  "status": "healthy",
  "vision_model_loaded": true,
  "mock_mode": false
}
```

Status is `"healthy"` if mock mode is active OR both `manager.vision_model` and `manager.vision_processor` are not None.

---

## GPU Housekeeping Pattern

Every inference call in this route is wrapped with adaptive cleanup:

```python
manager.maybe_cleanup_before_inference()
try:
    vision_result = analyze_images(resolved_path, task=task)
finally:
    manager.maybe_cleanup_after_inference()
```

The `finally` block ensures cleanup runs even if inference raises an exception.

---

## Dependencies

- `app.services.granite_vision_service.analyze_images`
- `app.services.model_manager.manager`
- `app.utils.shared_utils.resolve_file_path`
- `app.utils.response_formatter.error_response`
- `app.utils.validators.ensure_json_object`, `validate_string_list`
