# Process Route Report (`process_route.py`)

## Overview

`process_route.py` exposes the document processing pipeline using a **background job pattern**. Submitting a job returns a `job_id` immediately (HTTP 202); the client then polls a status endpoint until the job completes. This eliminates long-lived HTTP connections that would be dropped by proxies, NAT layers, or carrier TCP timeouts during GPU inference.

Blueprint: `process_bp`, registered at `/api/process`.

---

## Background Job Architecture

### Why background jobs instead of a blocking request?

GPU inference takes 30–120+ seconds per document. Holding an HTTP connection open for that duration causes:
- **NAT/proxy TCP timeouts** (~5 minutes on most mobile carriers and ngrok) silently dropping the connection mid-analysis
- **Flask thread starvation** if cancel/status requests arrive while the main thread is blocked on inference

The background job pattern solves both: the HTTP handler returns in milliseconds, GPU work runs in a daemon thread, and the cancel endpoint is always reachable.

### Module-level state

```python
_inference_semaphore = threading.Semaphore(1)   # serialises GPU access
_pending_lock        = threading.Lock()
_pending_count       = 0
_MAX_PENDING         = 4      # max jobs waiting (not counting the active runner)
_QUEUE_TIMEOUT       = 14400  # 4 hours — allows slow GPU jobs to wait their turn

_job_store      = {}          # job_id → {status, result, created_at}
_job_store_lock = threading.Lock()
_JOB_TTL        = 7200        # 2 hours — stale jobs are pruned lazily

_cancellation_registry = {}   # job_id → threading.Event
_registry_lock         = threading.Lock()
```

**Effective concurrency:** 1 active + up to 4 waiting = **5 in-flight jobs maximum**.

### OTel tracing

When OpenTelemetry is available, each background job emits a single `document.process` span covering the full inference lifecycle. This span carries the following attributes:

| Attribute              | Description                                  |
|------------------------|----------------------------------------------|
| `job_id`               | UUID of the job                              |
| `file`                 | Resolved file path                           |
| `extract_ar`           | Whether AR extraction was requested          |
| `generate_ai_summary`  | Whether AI summary was requested             |
| `queue_wait_s`         | Seconds spent waiting in the GPU queue       |
| `inference_time_s`     | Seconds spent in active inference            |
| `total_time_s`         | Total time from submission to completion     |
| `final_status`         | `success` or `error`                         |

The `/api/process/status/<job_id>` endpoint is **excluded from Flask auto-instrumentation** — it is a high-frequency heartbeat with no diagnostic value as individual spans. All timing context is captured in the single `document.process` span instead.

---

## Endpoints

### `POST /api/process/start`

Submits a document for processing. Returns immediately with a `job_id`.

**Request body (JSON):**
```json
{
  "stored_name": "a3f8...pdf",
  "mock": false,
  "extract_ar": true,
  "generate_ai_summary": true
}
```

| Field                 | Required   | Default | Description                                          |
|-----------------------|------------|---------|------------------------------------------------------|
| `stored_name`         | one of two | —       | Hash-based filename from the upload route            |
| `file_path`           | one of two | —       | Absolute path (must be in uploads folder)            |
| `job_id`              | No         | auto    | Client-supplied idempotency key, or auto-generated   |
| `mock`                | No         | `false` | Skip model inference and return mock results         |
| `extract_ar`          | No         | `true`  | Whether to run AR component detection                |
| `generate_ai_summary` | No         | `true`  | Whether to generate an AI text summary               |

**Processing flow:**
```
1. Prune stale jobs older than JOB_TTL
2. Validate JSON payload
3. Resolve file path (fail-fast before entering queue)
4. Queue admission check:
     if _pending_count >= _MAX_PENDING → 503 immediately
5. Register threading.Event in _cancellation_registry
6. Create job record in _job_store with status='queued'
7. Launch daemon thread → _run_processing_job(...)
8. Return {status: 'queued', job_id: '...'} HTTP 202 immediately
```

**Response (202):**
```json
{"status": "queued", "job_id": "550e8400-e29b-41d4-a716-446655440000"}
```

**503 case:** queue full — `"Server is busy — N jobs already queued. Please retry."`

---

### `GET /api/process/status/<job_id>`

Polls the status of a submitted job.

**Response:**
```json
{
  "status": "queued | processing | success | error | cancelled",
  "result": { ... }
}
```

`result` is `null` while the job is queued or processing. On `success` it contains the full pipeline output from `preprocess_service`. On `error` it contains `{"error": "..."}`.

**404** is returned if the job ID is unknown or has been pruned (TTL expired).

> **Note:** This endpoint is excluded from request/response middleware logging and OTel auto-instrumentation. During a GPU job, a client polling every 15 seconds would otherwise generate hundreds of log lines and OTel spans with no diagnostic value.

---

### `POST /api/process/cancel`

Requests cancellation of a queued or in-progress job.

**Request body (JSON):**
```json
{"job_id": "550e8400-e29b-41d4-a716-446655440000"}
```

Sets the job's `threading.Event`, which is checked at cancellation checkpoints throughout the pipeline. The pipeline raises `ProcessingCancelled` at the next checkpoint and the job status transitions to `cancelled`.

**Response (200):** `{"status": "ok", "message": "Cancellation requested"}`
**Response (404):** job not found or already completed

---

### `GET /api/process/health`

```json
{"status": "healthy"}
```

---

## Background Worker — `_run_processing_job`

The worker runs in a daemon thread and logs timing at every significant boundary:

```
🚀 Starting inference: /path/file.png (job abc123, queued 0.2s)
    ... pipeline step logs ...
📊 Pipeline timing summary (image, 1 page(s)):
   Vision analysis              42.3s
   AR extraction                18.7s
   AI summary                   31.1s
   ──────────────────────────────────────────
   Total accounted              92.1s
⏱️  Total pipeline time for file.png: 92.4s
✅ Job abc123 finished: status=success  inference=92.4s  total(+queue)=92.6s
```

Queue wait time and inference time are logged separately so GPU saturation vs. actual processing time are distinguishable.

---

## Client Polling Protocol

The frontend (`shared/api/backend.js`) implements the polling loop:

```
POST /api/process/start  → receives job_id (HTTP 202)
loop every 15 s:
    GET /api/process/status/<job_id>
    if status == 'success'   → return result
    if status == 'error'     → throw
    if status == 'cancelled' → throw (ERR_CANCELED)
    else                     → continue polling
```

The 15-second interval reflects the minimum useful granularity — GPU inference steps take 30–120 seconds each, so polling more frequently only generates noise.

---

## Cancellation Flow

```
Client                     Frontend              Backend HTTP          Background Thread
  │                            │                      │                       │
  │── tap Cancel ─────────────>│                      │                       │
  │                            │── abort controller ──>│                      │
  │                            │── POST /cancel ──────>│── event.set() ───────>│
  │                            │                      │                       │── _check_cancel()
  │                            │                      │                       │── raise ProcessingCancelled
  │                            │                      │                       │── status='cancelled'
```

The `AbortController` on the frontend immediately stops the polling loop. The `POST /cancel` call concurrently signals the backend thread. The thread checks the event at multiple checkpoints between pipeline stages and raises `ProcessingCancelled`, which is caught in `_run_processing_job` and sets the job status to `cancelled`.

---

## Threading Model

All shared state uses standard `threading` primitives (semaphore + locks). This is safe across threads within a single process but **not** across multiple Gunicorn worker processes (`--workers > 1`). In a multi-process deployment a distributed lock (e.g. Redis) would be required.

---

## Dependencies

- `app.services.preprocess_service.preprocess_service`, `ProcessingCancelled`
- `app.services.model_manager.manager`
- `app.utils.shared_utils.resolve_file_path`
- `app.utils.response_formatter.error_response`
- `app.utils.validators.ensure_json_object`
- `threading`, `time`, `uuid` (standard library)
- `opentelemetry` (optional — gracefully absent if not installed)
