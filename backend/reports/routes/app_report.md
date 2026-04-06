# App Factory Report (`app.py`)

## Overview

`app.py` is the Flask application factory. It configures the full server stack: CORS, logging, authentication middleware, security headers, error handlers, blueprint registration, static file serving, and OpenTelemetry tracing. The `create_app()` function is called at module level (bottom of the file) so Gunicorn and `python app.py` both get the same app instance.

---

## Application Factory — `create_app()`

Returns a fully configured `Flask` application. Called once at startup (not per-request). `use_reloader=False` is set in the `__main__` block to prevent the Werkzeug reloader from triggering a second `create_app()` call, which would double-load all AI models.

---

## Authentication

All `/api/*` routes (except those in `PUBLIC_API_PATHS`) require a `Bearer` token in the `Authorization` header:

```
Authorization: Bearer ibm-project-dev-token
```

The token value is read from the `API_ACCESS_TOKEN` environment variable (set in `.env`). If the variable is absent, a hardcoded development default is used.

**Public paths** (no token required):

| Path                        | Reason                        |
|-----------------------------|-------------------------------|
| `/api/health`               | Liveness probe                |
| `/api/routes`               | API introspection             |
| `/api/upload/health`        | Upload service liveness       |
| `/api/vision/health`        | Vision model liveness         |
| `/api/ar/health`            | AR model liveness             |
| `/api/ai/health`            | AI model liveness             |
| `/api/process/health`       | Pipeline liveness             |

Auth failures return 401 with `code: "AUTH_INVALID_TOKEN"` and the request ID from `X-Request-ID`. The token in the log message is masked to the first 10 characters to prevent credential leakage in logs.

---

## CORS

Allowed origins (for `/api/*` and `/static/*`):
- `http://localhost:3000` — React dev server
- `http://localhost:8081` — Expo dev server
- `http://localhost:19006` — Expo web
- `http://127.0.0.1:3000`

Allowed methods: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`.
Allowed headers: `Content-Type`, `Authorization`.

---

## Security Headers (middleware)

Every response from a non-static route gets:

| Header                      | Value                                          |
|-----------------------------|------------------------------------------------|
| `X-Content-Type-Options`    | `nosniff`                                      |
| `Referrer-Policy`           | `no-referrer`                                  |
| `Permissions-Policy`        | `camera=(self), microphone=()`                 |
| `X-Frame-Options`           | `DENY` (API routes) / `SAMEORIGIN` (static)   |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (HTTPS)  |

---

## Request Logging and Request IDs

`@app.before_request` assigns a `request_id` to `flask.g` (from the incoming `X-Request-ID` header or a fresh UUID4). This ID is:
- Logged on every request and response line
- Injected into every error response body under `"request_id"`
- Added to every response via `X-Request-ID` response header

This allows request correlation across logs and client-side error tracking.

**Status poll suppression:** `GET /api/process/status/<id>` and `GET /api/ai/ask/status/<id>` / `GET /api/ai/chat/status/<id>` requests are excluded from both the `before_request` and `after_request` log lines. During GPU inference a client polls every 15 seconds — logging each poll would generate hundreds of `→`/`←` lines with no diagnostic value. The job lifecycle is already fully logged by the background workers in `process_route.py` and `ai_routes.py`.

---

## Blueprint Registration

| Blueprint    | URL Prefix      | Source file          |
|--------------|-----------------|----------------------|
| `upload_bp`  | `/api/upload`   | `upload_route.py`    |
| `vision_bp`  | `/api/vision`   | `vision_routes.py`   |
| `ar_bp`      | `/api/ar`       | `ar_routes.py`       |
| `ai_bp`      | `/api/ai`       | `ai_routes.py`       |
| `process_bp` | `/api/process`  | `process_route.py`   |

`auth_routes.py` exists but is currently empty — no `auth_bp` is registered.

---

## Global Health — `GET /api/health`

Reports the status of all loaded models:

```json
{
  "status": "healthy",
  "mode": "REAL AI",
  "models": {
    "vision": {
      "loaded": true,
      "processor_loaded": true,
      "note": "handles vision analysis and text chat"
    },
    "ar": {"loaded": true}
  }
}
```

Status is `"healthy"` (HTTP 200) if mock mode is active or the vision model is loaded. Otherwise `"degraded"` (HTTP 207). If the model manager failed to import, `models` contains `{"error": "Model Manager not available"}`.

---

## Route Introspection — `GET /api/routes`

Returns a sorted list of all registered URL rules:

```json
{
  "status": "success",
  "total": 18,
  "routes": [
    {"endpoint": "ai.analyze", "methods": ["POST"], "path": "/api/ai/analyze"},
    ...
  ]
}
```

---

## OpenTelemetry Tracing

If the `opentelemetry` packages are installed and `OTEL_SDK_DISABLED` is not set:
- A `TracerProvider` is created with service name `ibm-ar-doc-backend`
- An `OTLPSpanExporter` sends traces to `OTEL_EXPORTER_OTLP_ENDPOINT` (default: `http://localhost:4317`)
- `FlaskInstrumentor().instrument_app(app)` wraps every HTTP request in an OTel span

**Excluded endpoints:**

```python
FlaskInstrumentor().instrument_app(
    app,
    excluded_urls=r"api/process/status/.*,api/process/health",
)
```

`/api/process/status/<id>` is excluded because a single document analysis generates one poll every 15 seconds for the duration of GPU inference. Tracing each poll would create hundreds of meaningless spans. Instead, `process_route.py` emits a single `document.process` span per job from the background thread, carrying all timing attributes (`queue_wait_s`, `inference_time_s`, `total_time_s`, `final_status`). The `POST /api/process/start` span (auto-instrumented) is the HTTP trigger; the `document.process` span is the async work — they share `job_id` for correlation.

In Instana this means:
- One span for job submission (`/api/process/start`)
- One span for the full inference run (`document.process`) — with duration, status, and per-step timing in its attributes
- No spans for the status polls

If packages are missing or `OTEL_SDK_DISABLED=true`, tracing is silently disabled with no impact on functionality.

---

## Logging

`_ColourFormatter` provides ANSI-coloured log output:

| Level    | Colour   |
|----------|----------|
| DEBUG    | Cyan     |
| INFO     | Green    |
| WARNING  | Yellow   |
| ERROR    | Red      |
| CRITICAL | Magenta  |

Werkzeug's own request log is suppressed to `WARNING` level — the middleware logs requests instead with more context. Status poll paths are additionally suppressed in middleware (see above).

---

## Error Handlers

Registered for: 400, 401, 403, 404, 405, 413, 500, and catch-all `HTTPException` and `Exception`. All return JSON with `{"status": "error", "error": "...", "request_id": "..."}` for consistency.

---

## Static File Serving

Two routes serve files from `backend/static/`:
- `GET /static/uploads/<filename>` — serves uploaded files (PDFs, images) to the frontend
- `GET /static/<path>` — serves any other static asset

`X-Frame-Options: SAMEORIGIN` is set on static responses to allow PDFs to be embedded in iframes from the same origin.

---

## Environment Variables

| Variable                      | Default                   | Description                              |
|-------------------------------|---------------------------|------------------------------------------|
| `GRANITE_MOCK`                | `"0"`                     | `"1"` to skip model loading              |
| `API_ACCESS_TOKEN`            | `"ibm-project-dev-token"` | Bearer token for API authentication      |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `"http://localhost:4317"` | OTel collector address                   |
| `OTEL_SDK_DISABLED`           | `"false"`                 | `"true"` or `"1"` to disable tracing     |
| `PORT`                        | `4200`                    | Server port (read by `__main__` block)   |
| `FLASK_DEBUG`                 | `"False"`                 | `"true"` to enable debug mode            |

---

## Dependencies

- `flask`, `flask-cors`, `werkzeug`
- `python-dotenv`
- `opentelemetry` stack (optional)
- `app.utils.response_formatter.error_response`
