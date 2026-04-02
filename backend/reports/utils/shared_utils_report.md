# Shared Utils Report (`shared_utils.py`)

## Overview

`shared_utils.py` provides the central file-path resolution and security validation used by every route that accepts a file reference. It prevents path traversal attacks by ensuring all resolved paths remain inside the uploads directory.

---

## Constants

```python
BASE_DIR      = backend/           # absolute path two levels above shared_utils.py
UPLOAD_FOLDER = backend/static/uploads/
```

These are computed at module load time using `os.path.abspath` and `os.path.dirname(__file__)`, so they are correct regardless of where the process is started from.

---

## Functions

### `safe_under_uploads(path: str) -> bool`

Security guard that checks whether an arbitrary path resolves to a location inside `UPLOAD_FOLDER`.

```python
real_upload = os.path.realpath(UPLOAD_FOLDER)
real_path   = os.path.realpath(path)
return os.path.commonpath([real_path, real_upload]) == real_upload
```

`os.path.realpath` resolves symlinks and `..` components before the comparison, making it safe against:
- **Path traversal**: `../../etc/passwd` resolves to `/etc/passwd`, which fails the common-path check.
- **Symlink escapes**: a symlink inside uploads pointing outside is followed before the check.

Returns `False` on any exception (e.g., an invalid path on Windows) rather than propagating.

---

### `resolve_file_path(stored_name=None, file_path=None) -> Tuple[Optional[str], Optional[Tuple[dict, int]]]`

The single entry point for file resolution across all routes.

**Return type:** `(resolved_path, error_tuple)`
- On success: `(absolute_path_string, None)`
- On failure: `(None, (error_dict, http_status_code))`

Routes use it like:
```python
resolved_path, error = resolve_file_path(stored_name, file_path)
if error:
    return jsonify(error[0]), error[1]
```

**`stored_name` path (preferred):**
1. Joins `stored_name.strip()` onto `UPLOAD_FOLDER` and calls `os.path.realpath` to resolve any `..` or symlinks.
2. Calls `safe_under_uploads(resolved_path)` — if the resolved path escapes the uploads directory, returns 400 `"Invalid stored_name"`.
3. Unlike the old implementation (which used `os.path.basename` to strip directory components), this approach uses `realpath` + `safe_under_uploads`. This correctly handles subdirectory paths like `a3f8.../page1_img1.png` that arise from PDF extraction, while still rejecting traversal attempts.

**`file_path` path (fallback):**
1. Resolves `file_path.strip()` with `os.path.realpath`.
2. Calls `safe_under_uploads(resolved_path)` — returns 403 `"Security violation: file must be in uploads folder"` if outside.

**Neither provided:**
Returns 400 `"stored_name or file_path required"`.

**Existence check:**
If the resolved path does not exist on disk, returns 404 `"File not found"`.

---

## Why `stored_name` Uses `realpath` + `safe_under_uploads`

The previous implementation used `os.path.basename(stored_name)` to strip any directory components, then joined it onto `UPLOAD_FOLDER`. This was safe but prevented subdirectory references — e.g., a PDF extraction creates files at `uploads/abc123_extracted/page1_img1.png`, and `basename` would strip the subdirectory prefix.

The current approach uses `realpath` to resolve the full path (including subdirectories) and then asserts the result is still under `UPLOAD_FOLDER` using the `safe_under_uploads` common-path check. This supports nested paths while preserving path traversal protection.

---

## Error Response Format

All errors use the standard response shape (without going through `error_response` — the dict is constructed directly to avoid a circular dependency with `response_formatter`):

```python
{'status': 'error', 'error': 'message'}
```

With HTTP status codes:
- `400` — missing parameters or invalid `stored_name`
- `403` — `file_path` escapes uploads folder
- `404` — file not found

---

## Dependencies

- `os` (standard library)
- `typing` (standard library)
