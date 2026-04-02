# Backend Route Reports

This directory contains one markdown report per route module under `backend/app/routes`, plus one report for the application factory.

## Reports

- `app_report.md` — Flask application factory, auth middleware, CORS, security headers, blueprint registration, OTel tracing
- `upload_route_report.md` — `POST /api/upload/` — file upload, validation, SHA-256 dedup storage
- `vision_routes_report.md` — `POST /api/vision/analyze`, `/batch-analyze` — vision model inference
- `ar_routes_report.md` — `POST /api/ar/generate`, `/analyze-relationships`, `/extract-from-multiple` — AR component detection
- `ai_routes_report.md` — `POST /api/ai/analyze`, `/ask`, `/chat`, `/summarize-components`, `/generate-insights`, `/compare-documents` — AI text generation
- `process_route_report.md` — `POST /api/process/document` — full Vision → AR → AI pipeline with inference queue

## Scope Notes

- `auth_routes.py` is currently empty — no report needed.
- The inference queue (in `process_route.py`) serializes GPU access for the full pipeline. Individual routes (vision, AR, AI) use adaptive cleanup instead; they do not queue.
- All blueprint URL prefixes are documented in `app_report.md`.
