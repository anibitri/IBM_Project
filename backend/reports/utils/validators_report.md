# Validators Report (`validators.py`)

## Overview

`validators.py` provides lightweight input validation helpers used by all route handlers. Each function follows the same contract: returns `(bool, Optional[str])` — `True, None` on success, or `False, error_message_string` on failure. This lets routes use a consistent two-line pattern:

```python
ok, message = validate_<something>(value)
if not ok:
    body, status = error_response(message, status=400)
    return jsonify(body), status
```

---

## Functions

### `is_non_empty_string(value: Any) -> bool`

Returns `True` if `value` is a `str` with at least one non-whitespace character. Used internally; not directly called by routes.

---

### `validate_string_list(value: Any, field_name: str) -> Tuple[bool, Optional[str]]`

Validates that `value` is a list where every element is a non-empty string.

Failure cases:
- Not a `list` → `"{field_name} must be an array"`
- Any element is not a non-empty string → `"{field_name} must contain only non-empty strings"`

Used to validate:
- `hints` in `ar_routes.py`
- `stored_names` in `ar_routes.py` and `vision_routes.py`

---

### `validate_components_list(value: Any) -> Tuple[bool, Optional[str]]`

Validates that `value` is a list where every element is a dict.

Failure cases:
- Not a `list` → `"components must be an array"`
- Any element is not a `dict` → `"components must contain objects"`

Does not validate field names or types within each component dict — that level of schema validation is handled by the services. Used to validate `components` in `ai_routes.py` and `ar_routes.py`.

---

### `ensure_json_object(payload: Any) -> Tuple[bool, Optional[str]]`

Validates that the parsed request body is a JSON object (Python `dict`).

Failure case:
- Not a `dict` → `"Request body must be a JSON object"`

Called at the top of every route handler that reads a JSON payload. Guards against clients sending a JSON array, string, or `null` at the top level, which would cause `payload.get(...)` calls to raise `AttributeError`.

---

## Design Notes

- **No schema enforcement inside dicts**: `validate_components_list` checks only that each element is a dict, not that it has required fields like `id`, `x`, `y`. This keeps the validators thin — structural contract validation is left to the service layer, which knows what fields it actually needs.
- **String list contents**: `validate_string_list` rejects empty strings (`item.strip()` must be truthy) to prevent callers from inadvertently passing blank hint strings to the vision or AR services.
- **Consistent return type**: all functions return `(bool, Optional[str])` so routes can call them uniformly regardless of which validator is used.

---

## Dependencies

- `typing` (standard library)
