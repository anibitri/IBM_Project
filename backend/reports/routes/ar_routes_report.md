# AR Routes Report (`ar_routes.py`)

## Overview

`ar_routes.py` exposes AR component detection as an HTTP API. It optionally runs a vision pre-pass to extract diagram type and component name hints before calling the AR service, and wraps GPU housekeeping around every inference call.

Blueprint: `ar_bp`, registered at `/api/ar`.

---

## Endpoints

### `POST /api/ar/generate`

Extracts AR overlay components from a single image.

**Request body (JSON):**
```json
{
  "stored_name": "a3f8...png",
  "hints": ["API Gateway", "Database"],
  "use_vision": true
}
```

| Field         | Required   | Default | Description                                              |
|---------------|------------|---------|----------------------------------------------------------|
| `stored_name` | one of two | —       | Hash-based filename from the upload route                |
| `file_path`   | one of two | —       | Absolute path (must be in uploads folder)                |
| `hints`       | No         | `[]`    | Optional component name hints to pass to the AR service  |
| `use_vision`  | No         | `true`  | Whether to run a vision pre-pass to extract hints        |

**Processing pipeline:**

1. Validate payload and resolve file path.
2. **Step 1 — Vision pre-pass** (if `use_vision=true`):
   - Calls `analyze_images(resolved_path, task="ar_extraction")` wrapped in `maybe_cleanup_before/after_inference`.
   - Extracts `vision_components` from the result and merges them with any `hints` from the request.
   - Deduplicates hints (case-insensitive, order-preserving).
   - On vision failure, logs a warning and continues with manual hints only.
3. **Step 2 — AR extraction:**
   - Calls `ar_service.extract_document_features(resolved_path, hints=ar_hints)` wrapped in `maybe_cleanup_before/after_inference`.
   - The `hints` list passed to the AR service begins with the diagram type string extracted by the vision service, followed by component names. This lets the AR service skip its own heuristic type detection.

**Response (200):**
```json
{
  "status": "success",
  "components": [...],
  "componentCount": 8,
  "connections": [],
  "relationships": {},
  "hints": ["architecture", "API Gateway", "Redis Cache"],
  "vision_analysis": {"summary": "..."},
  "metadata": {"diagram_type": "architecture", ...},
  "file": {"path": "/absolute/path/to/file"}
}
```

**Error responses:**
- `400` — invalid JSON, invalid hints list (must be non-empty strings).
- `403/404` — path resolution failure.
- `500` — AR or vision service error.

---

### `POST /api/ar/analyze-relationships`

Computes spatial relationships from an already-extracted component list. Does not run inference — pure geometry.

**Request body (JSON):**
```json
{
  "components": [
    {"id": "component_0", "x": 0.1, "y": 0.2, "width": 0.15, "height": 0.1, ...}
  ]
}
```

`components` must be a non-empty array of objects. Calls `ar_service.analyze_component_relationships(components)`.

**Response (200):**
```json
{
  "status": "success",
  "relationships": {...},
  "componentCount": 5
}
```

---

### `POST /api/ar/extract-from-multiple`

Batch AR extraction across multiple images. Optionally runs a vision pre-pass for each image.

**Request body (JSON):**
```json
{
  "stored_names": ["file1.png", "file2.png"],
  "hints": ["shared_hint"],
  "use_vision": true
}
```

**Processing:**

Iterates over `stored_names`. For each file:
- Resolves path; records an error entry and continues on failure.
- If `use_vision`, runs `analyze_images` wrapped in `maybe_cleanup_before/after_inference`, merging vision components into per-file hints.
- Runs `ar_service.extract_document_features` wrapped in `maybe_cleanup_before/after_inference`.
- Extends the `all_components` list with per-file components.

After the loop, if any components were found, `ar_service.analyze_component_relationships(all_components)` is called to compute cross-image spatial relationships.

**Response (200):**
```json
{
  "status": "success",
  "results": [
    {"file": "file1.png", "status": "success", "componentCount": 6, "components": [...]},
    {"file": "file2.png", "status": "error", "error": "..."}
  ],
  "totalComponents": 6,
  "combinedRelationships": {...}
}
```

---

### `GET /api/ar/health`

```json
{
  "status": "healthy",
  "ar_model_loaded": true,
  "mock_mode": false
}
```

Status is `"healthy"` if mock mode is active OR `manager.ar_model` is not None.

---

## GPU Housekeeping Pattern

Every inference call (both vision pre-pass and AR extraction) is independently wrapped:

```python
manager.maybe_cleanup_before_inference()
try:
    result = ar_service.extract_document_features(...)
finally:
    manager.maybe_cleanup_after_inference()
```

In the batch endpoint, this pattern repeats inside the per-file loop, so each image's two inference calls (vision + AR) get independent cleanup cycles.

---

## Vision → AR Hint Flow

```
Vision output:  diagram_type="architecture", components=["API Gateway", "Redis Cache"]
ar_hints list:  ["architecture", "API Gateway", "Redis Cache"]
                 ↑ first element is always the diagram type
AR service:     reads hints[0] → sets _hint_diagram_type = "architecture"
                skips heuristic detection → uses architecture thresholds directly
```

This is the primary mechanism by which the vision model guides the AR service to the correct detection strategy without the AR service needing to re-analyse the image.

---

## Dependencies

- `app.services.ar_service.ar_service`
- `app.services.granite_vision_service.analyze_images`
- `app.services.model_manager.manager`
- `app.utils.shared_utils.resolve_file_path`
- `app.utils.response_formatter.error_response`
- `app.utils.validators.ensure_json_object`, `validate_components_list`, `validate_string_list`
