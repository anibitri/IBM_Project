# Response Formatter Report (`response_formatter.py`)

## Overview

`response_formatter.py` provides two functions that produce consistent JSON response bodies across all routes. Centralizing this ensures every success and error response shares the same top-level shape, making client-side parsing predictable.

---

## Functions

### `success_response(data=None, message=None) -> Dict[str, Any]`

Builds a success response body. Always sets `"status": "success"`. Optionally adds a human-readable `"message"` and merges any additional `data` fields at the top level.

```python
success_response(
    {"file": {"stored_name": "abc.png", ...}},
    message="File uploaded successfully"
)
# → {"status": "success", "message": "File uploaded successfully", "file": {...}}
```

`data` is merged with `payload.update(data)`, so its keys appear at the top level of the response rather than nested under a `"data"` wrapper. This matches the response shape used by the upload route and keeps response bodies flat.

Used only by `upload_route.py`. Most other routes construct their response dicts inline.

---

### `error_response(error, *, status=400, code=None, request_id=None) -> Tuple[Dict[str, Any], int]`

Builds an error response body **and** returns the HTTP status code as a second tuple element, so routes can unpack both at once:

```python
body, status = error_response('File not found', status=404)
return jsonify(body), status
```

Always sets `"status": "error"` and `"error": <message>`. Optionally adds:
- `"code"` — machine-readable error code string (e.g., `"AUTH_INVALID_TOKEN"`), useful for programmatic error handling in clients.
- `"request_id"` — UUID from the request context, enabling log correlation.

```python
error_response(
    'Missing or invalid API token',
    status=401,
    code='AUTH_INVALID_TOKEN',
    request_id='a1b2c3...'
)
# → ({"status": "error", "error": "...", "code": "AUTH_INVALID_TOKEN", "request_id": "..."}, 401)
```

Used throughout all routes and in the app factory's middleware and error handlers.

---

## Response Shape Summary

All API responses follow one of two shapes:

**Success:**
```json
{
  "status": "success",
  "message": "optional human-readable message",
  "<key>": "<value>",
  "...": "..."
}
```

**Error:**
```json
{
  "status": "error",
  "error": "human-readable description",
  "code": "OPTIONAL_MACHINE_CODE",
  "request_id": "optional-uuid"
}
```

---

## Dependencies

- `typing` (standard library)
