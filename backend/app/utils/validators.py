from typing import Any, Optional, Tuple


def is_non_empty_string(value: Any) -> bool:
	return isinstance(value, str) and bool(value.strip())


def validate_string_list(value: Any, field_name: str) -> Tuple[bool, Optional[str]]:
	if not isinstance(value, list):
		return False, f"{field_name} must be an array"

	if not all(isinstance(item, str) and item.strip() for item in value):
		return False, f"{field_name} must contain only non-empty strings"

	return True, None


def validate_components_list(value: Any) -> Tuple[bool, Optional[str]]:
	if not isinstance(value, list):
		return False, "components must be an array"

	if not all(isinstance(item, dict) for item in value):
		return False, "components must contain objects"

	return True, None


def ensure_json_object(payload: Any) -> Tuple[bool, Optional[str]]:
	if not isinstance(payload, dict):
		return False, "Request body must be a JSON object"
	return True, None
