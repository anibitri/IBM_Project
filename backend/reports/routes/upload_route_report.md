# Upload Route Report (`upload_route.py`)

## Overview

`upload_route.py` handles file ingestion — validating, deduplicating, and persisting uploaded files to disk. It deliberately does **no processing**: its only job is to store the file safely and return a `stored_name` token that subsequent pipeline endpoints (vision, AR, process) use to locate the file.

Blueprint: `upload_bp`, registered at `/api/upload`.

---

## Endpoints

### `POST /api/upload/`

Accepts a `multipart/form-data` request with a `file` field.

**Validation pipeline (in order):**

1. **Presence check** — returns 400 if no `file` field in the request.
2. **Filename check** — returns 400 if the filename is empty.
3. **Extension check** — `allowed_file()` checks that the extension is in `ALLOWED_EXTENSIONS = {pdf, png, jpg, jpeg, bmp, gif, webp}`. Returns 400 on failure.
4. **Size check** — `validate_file_size()` seeks to the end of the stream to measure bytes without buffering the whole file. Returns 400 if > 50 MB. Flask also enforces `MAX_CONTENT_LENGTH = 50 MB` at the WSGI layer (catches oversized multipart before the route runs).
5. **Content check** — `validate_file_content()` inspects file magic bytes rather than trusting the extension:
   - **PDF**: reads the first 5 bytes and checks for `%PDF-` header.
   - **Images**: passes the stream through `PIL.Image.open()` → `img.verify()`. PIL's verifier catches truncated, corrupted, or mismatched-format files.
   - Returns 400 on failure.

**Storage:**

- `compute_sha256()` streams the file in 8 KB chunks to compute the SHA-256 digest. The stored filename is `{sha256}{ext}` (e.g., `a3f8...png`).
- This provides **content-addressable deduplication**: uploading the same file twice returns the existing entry without writing to disk again (`is_duplicate=True`).
- The file is saved to `backend/static/uploads/`.

**Response (200):**
```json
{
  "status": "success",
  "message": "File uploaded successfully",
  "file": {
    "original_name": "diagram.png",
    "stored_name": "a3f8...png",
    "path": "/absolute/path/to/uploads/a3f8...png",
    "url": "/static/uploads/a3f8...png",
    "size": 204800,
    "type": "image/png",
    "extension": ".png",
    "sha256": "a3f8...",
    "is_duplicate": false
  }
}
```

**Error responses:**
- `400` — missing file, bad filename, disallowed extension, size exceeded, invalid content.
- `413` — caught by Flask's `MAX_CONTENT_LENGTH` (returns before reaching this route).
- `500` — unexpected exception during save.

### `GET /api/upload/health`

Returns whether the upload folder exists and is writable:
```json
{
  "status": "healthy",
  "upload_folder_exists": true,
  "upload_folder_writable": true
}
```

---

## Security Design

- **Extension allowlist**: only 7 types are accepted; all others are rejected before any file reading.
- **Magic-byte validation**: prevents extension spoofing (e.g., an `.exe` renamed to `.png` would fail PIL verify).
- **Content-addressable naming**: the hash-based filename prevents path injection and predictable name guessing.
- **No path traversal surface**: filenames supplied by the client are never used as filesystem paths. The stored path is always `UPLOAD_FOLDER + computed_hash + ext`.
- **Size enforcement at two layers**: Flask's `MAX_CONTENT_LENGTH` and an explicit stream seek — defense-in-depth against large uploads.

---

## Configuration

| Constant            | Value                           |
|---------------------|---------------------------------|
| `UPLOAD_FOLDER`     | `backend/static/uploads/`       |
| `ALLOWED_EXTENSIONS`| `{pdf, png, jpg, jpeg, bmp, gif, webp}` |
| `MAX_FILE_SIZE`     | 50 MB                           |

---

## Dependencies

- `Pillow` — image content validation via `Image.open().verify()`
- `hashlib` — SHA-256 for deterministic file naming
- `werkzeug.exceptions.RequestEntityTooLarge` — caught to return a clean 413 JSON response
- `app.utils.response_formatter` — `error_response`, `success_response`
