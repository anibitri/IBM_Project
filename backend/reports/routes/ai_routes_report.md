# AI Routes Report (`ai_routes.py`)

## Overview

`ai_routes.py` exposes the text-generation capabilities of `AIService` as an HTTP API. Every endpoint wraps its inference call in adaptive GPU housekeeping and delegates input validation to the shared validators.

Blueprint: `ai_bp`, registered at `/api/ai`.

---

## Endpoints

### `POST /api/ai/analyze`

Analyzes technical content by combining any available context sources (text, vision output, AR components) into a structured summary.

**Request body (JSON):**
```json
{
  "text_excerpt": "...",
  "vision": {"summary": "..."},
  "components": [...],
  "context_type": "software"
}
```

| Field          | Required                | Default      | Description                                      |
|----------------|-------------------------|--------------|--------------------------------------------------|
| `text_excerpt` | at least one of three   | `""`         | Raw text from the document                       |
| `vision`       | at least one of three   | `{}`         | Vision service result dict                       |
| `components`   | at least one of three   | `[]`         | AR component list (array of objects)             |
| `context_type` | No                      | `"general"`  | Domain: `software`, `electronics`, `mechanical`, `network`, `general` |

At least one of `text_excerpt`, `vision`, or `components` must be non-empty; otherwise returns 400. If `components` is provided, it is validated as an array of objects.

**Response (200):**
```json
{
  "status": "success",
  "ai": {
    "analysis": "The diagram shows a microservices architecture...",
    "status": "ok"
  }
}
```

---

### `POST /api/ai/ask` and `POST /api/ai/chat` *(blocking — kept for compatibility)*

Both paths route to the same handler. Answers a user question grounded in a document context dict. This is a **synchronous, blocking** endpoint: the HTTP connection is held open for the full duration of GPU inference (60–120 s on slow hardware). It is retained for backward compatibility but **should not be used from mobile clients** — NAT/proxy TCP timeouts (~5 min on ngrok and mobile carriers) will silently drop the connection before inference completes. Use the non-blocking variants below instead.

**Request body (JSON):**
```json
{
  "query": "What does the API Gateway do?",
  "context": {
    "stored_name": "a3f8...png",
    "text": "...",
    "vision": {...},
    "components": [...]
  },
  "history": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "content": "..."}
  ]
}
```

| Field     | Required | Description                                                            |
|-----------|----------|------------------------------------------------------------------------|
| `query`   | Yes      | The user's question                                                    |
| `context` | Yes      | Document context dict passed to `ai_service.chat_with_document`        |
| `history` | No       | Prior conversation turns (kept to last 3 by the AI service)            |

**`stored_name` resolution in context:** if `context` is a dict containing a `stored_name` key and no `image_path`, the route resolves the stored name to an absolute path and injects it as `context['image_path']`. The AI service uses this path to call `query_image` for visual Q&A when the question is visually-oriented.

**Response (200):** the raw result dict from `ai_service.chat_with_document`:
```json
{
  "status": "ok",
  "answer": "The API Gateway routes incoming HTTP requests to downstream services..."
}
```

---

### `POST /api/ai/ask/start` and `POST /api/ai/chat/start` *(non-blocking)*

Submits a chat question as a background job and returns immediately with a `job_id`. The client polls `GET /api/ai/ask/status/<job_id>` until the answer is ready. This pattern is immune to NAT/proxy TCP timeouts and is the recommended path for all mobile and long-running chat requests.

**Why this exists:** the blocking `/ai/ask` endpoint held the HTTP connection open during GPU inference. On ngrok and mobile carriers, NAT/proxy TCP timeouts fire at ~5 minutes, silently dropping the connection before the server finished — the client received "Failed to get a response" even though the answer arrived moments later. This endpoint solves that by decoupling submission from retrieval.

**Request body (JSON):** identical to `POST /api/ai/ask`.

**Response (202):**
```json
{
  "job_id": "3f8a1b2c-...",
  "status": "queued"
}
```

**`stored_name` resolution:** same as the blocking endpoint — performed before handing off to the background thread.

---

### `GET /api/ai/ask/status/<job_id>` and `GET /api/ai/chat/status/<job_id>`

Polls the status of a chat job submitted via `/ask/start`.

**Response (200):**
```json
{
  "status": "queued | processing | success | error",
  "result": null
}
```

Once `status` is `"success"`, `result` contains the same dict that the blocking `/ai/ask` would have returned:
```json
{
  "status": "success",
  "result": {
    "status": "ok",
    "answer": "The API Gateway routes incoming HTTP requests..."
  }
}
```

On `"error"`, `result` contains `{"status": "error", "error": "..."}`. Jobs expire after 1 hour; polling an expired or unknown `job_id` returns 404.

**Recommended poll interval:** 4 seconds (matches the frontend implementation).

---

### Chat Job Store

The non-blocking endpoints use an in-memory job store (`_chat_jobs` dict, protected by `_chat_jobs_lock`). Each entry holds `status`, `result`, and `created_at`. Jobs are pruned lazily on each `/ask/start` call when older than `_CHAT_JOB_TTL` (3600 s). Background inference runs in a daemon thread; GPU housekeeping (`maybe_cleanup_before_inference` / `maybe_cleanup_after_inference`) is called inside the thread.

---

### `POST /api/ai/summarize-components`

Generates a plain-language summary of an AR component list.

**Request body (JSON):**
```json
{
  "components": [...],
  "relationships": {...},
  "document_type": "sequence"
}
```

| Field           | Required | Default      |
|-----------------|----------|--------------|
| `components`    | Yes      | —            |
| `relationships` | No       | `{}`         |
| `document_type` | No       | `"general"`  |

`components` is validated as a non-empty array of objects.

**Response (200):**
```json
{
  "status": "success",
  "summary": "This sequence diagram illustrates authentication interactions...",
  "componentCount": 5
}
```

---

### `POST /api/ai/generate-insights`

Generates 3–5 specific technical insights from any combination of analysis data.

**Request body (JSON):**
```json
{
  "vision_analysis": {...},
  "ar_components": [...],
  "text_content": "...",
  "insight_type": "architecture"
}
```

All fields are optional. `insight_type` options: `architecture`, `complexity`, `optimization`, `relationships`, `general`.

**Response (200):**
```json
{
  "status": "success",
  "insights": ["The system uses...", "A potential bottleneck is...", "..."],
  "insightType": "architecture"
}
```

---

### `POST /api/ai/compare-documents`

Compares two document analysis dicts and highlights differences.

**Request body (JSON):**
```json
{
  "document1": {...},
  "document2": {...},
  "comparison_type": "architecture"
}
```

Both `document1` and `document2` are required. The route builds a comparison context string (`"Document 1:\n...\n\nDocument 2:\n..."`) and calls `ai_service.analyze_context` with it.

**Response (200):**
```json
{
  "status": "success",
  "comparison": "Document 1 uses a monolithic architecture while Document 2...",
  "comparisonType": "architecture"
}
```

---

### `GET /api/ai/health`

```json
{
  "status": "healthy",
  "ai_model_loaded": true,
  "mock_mode": false
}
```

Status is `"healthy"` if mock mode is active OR `manager.vision_model` is not None (since the vision model handles text tasks too).

---

## GPU Housekeeping Pattern

All inference-running endpoints use the same pattern:

```python
manager.maybe_cleanup_before_inference()
try:
    result = ai_service.<method>(...)
finally:
    manager.maybe_cleanup_after_inference()
```

The `finally` block ensures cleanup runs even when the service raises an exception, preventing VRAM from staying fragmented if an error occurs mid-inference.

---

## Dependencies

- `app.services.granite_ai_service.ai_service`
- `app.services.model_manager.manager`
- `app.utils.shared_utils.resolve_file_path`
- `app.utils.response_formatter.error_response`
- `app.utils.validators.ensure_json_object`, `validate_components_list`
