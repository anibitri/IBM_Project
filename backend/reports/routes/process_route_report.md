# Process Route Report (`process_route.py`)

## Overview

`process_route.py` exposes the full document processing pipeline as a single endpoint. It orchestrates Vision → AR → AI by delegating to `preprocess_service`, and implements a **queuing mechanism** that serializes GPU inference across concurrent requests rather than immediately rejecting them with a 503.

Blueprint: `process_bp`, registered at `/api/process`.

---

## Inference Queue

The queue is implemented with three module-level variables protected by a threading lock:

```python
_inference_semaphore = threading.Semaphore(1)   # binary: 1 running at a time
_pending_lock        = threading.Lock()
_pending_count       = 0
_MAX_PENDING         = 4    # max concurrent waiters (not counting the active runner)
_QUEUE_TIMEOUT       = 300  # seconds a waiter will block before giving up
```

**Effective concurrency:** 1 active + up to 4 waiting = **5 in-flight requests maximum**.

**Why queue instead of reject?**

Immediately returning 503 when the GPU is busy forces clients to implement retry logic with exponential backoff — this adds client-side complexity and increases round-trip time. Queuing lets clients fire and forget: they block for up to 5 minutes, which comfortably covers large PDFs with many pages. A 503 is only returned when the queue itself is full or a waiter times out.

---

## Endpoint

### `POST /api/process/document`

Runs the full Vision → AR → AI pipeline on an uploaded file.

**Request body (JSON):**
```json
{
  "stored_name": "a3f8...pdf",
  "mock": false,
  "extract_ar": true,
  "generate_ai_summary": true
}
```

| Field                 | Required   | Default | Description                                            |
|-----------------------|------------|---------|--------------------------------------------------------|
| `stored_name`         | one of two | —       | Hash-based filename from the upload route              |
| `file_path`           | one of two | —       | Absolute path (must be in uploads folder)              |
| `mock`                | No         | `false` | Skip model inference and return mock results           |
| `extract_ar`          | No         | `true`  | Whether to run AR component detection                  |
| `generate_ai_summary` | No         | `true`  | Whether to generate an AI text summary                 |

**Processing flow:**

```
1. Validate JSON payload
2. Resolve file path (fail-fast before entering queue)
3. Queue admission check:
     if _pending_count >= _MAX_PENDING → 503 immediately
     else _pending_count += 1
4. Acquire _inference_semaphore (blocking, timeout=300s)
     if timeout → 503
5. manager.between_requests_cleanup()          ← clear prior request's VRAM
6. preprocess_service.preprocess_document(...)  ← Vision → AR → AI
7. manager.between_requests_cleanup()          ← clear this request's VRAM
8. _inference_semaphore.release()
9. _pending_count -= 1
10. Return result (200 if success/ok, 500 otherwise)
```

**Queue admission** (step 3) is checked under `_pending_lock` so the count increment and the check are atomic. The path resolution happens *before* entering the queue — a bad `stored_name` fails immediately without consuming a queue slot.

**GPU cleanup** (steps 5 and 7) calls `manager.between_requests_cleanup()` (unconditional cache clear + gc.collect), not the adaptive variants. At the process-route level the intent is always to give the full pipeline a clean start and leave a clean state for the next queued request.

**Response (200 or 500):** the raw result dict from `preprocess_service.preprocess_document`:
```json
{
  "status": "success",
  "type": "pdf",
  "images": [
    {
      "vision": {...},
      "ar": {...},
      "ai": {...}
    }
  ],
  "meta": {...}
}
```

**503 cases:**
- Queue full: `"Server is busy — N requests already queued. Please retry in a moment."`
- Timeout: `"Request timed out waiting for the server to become free. Please retry."`

---

### `GET /api/process/health`

```json
{"status": "healthy"}
```

Always returns healthy — this route has no model dependency of its own.

---

## Error Handling

The outer `try/except Exception` catches anything that escapes the inner blocks (e.g., JSON parsing failure, unexpected exceptions in file resolution). The `_pending_count` decrement is in a `finally` block nested inside the semaphore acquisition block, ensuring the count is always decremented even if inference raises.

The cleanup and semaphore release are also in a `finally`, so VRAM is never left dirty and the semaphore is never leaked on an exception.

---

## Threading Model

All state (`_pending_count`, `_inference_semaphore`) is module-level. Flask runs routes in threads (by default with Werkzeug's threaded dev server, or with Gunicorn workers in production). The semaphore and lock are standard `threading` primitives and are safe across threads within a single process. They are **not** safe across multiple worker processes (e.g., Gunicorn with `--workers > 1`) — in that case a Redis-backed distributed lock would be needed.

---

## Dependencies

- `app.services.preprocess_service.preprocess_service`
- `app.services.model_manager.manager`
- `app.utils.shared_utils.resolve_file_path`
- `app.utils.response_formatter.error_response`
- `app.utils.validators.ensure_json_object`
- `threading` (standard library)
