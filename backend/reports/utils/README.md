# Backend Utility Reports

This directory contains one markdown report per utility module under `backend/app/utils`.

## Reports

- `shared_utils_report.md` — `resolve_file_path`, `safe_under_uploads` — path resolution and path traversal prevention
- `response_formatter_report.md` — `success_response`, `error_response` — consistent JSON response shape
- `validators_report.md` — `ensure_json_object`, `validate_string_list`, `validate_components_list` — request input validation

## Scope Notes

- `jwt_auth.py` is currently empty — no report needed.
- All route handlers call `ensure_json_object` at their entry point and `resolve_file_path` for any file reference. These two utilities are the most widely used.
- `response_formatter` is also used by the app factory middleware and error handlers, not just routes.
