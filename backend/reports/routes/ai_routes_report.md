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

### `POST /api/ai/ask` and `POST /api/ai/chat`

Both paths route to the same handler. Answers a user question grounded in a document context dict.

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

All five inference-running endpoints use the same pattern:

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
