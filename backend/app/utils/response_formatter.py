from typing import Any, Dict, Optional


def success_response(
	data: Optional[Dict[str, Any]] = None,
	message: Optional[str] = None,
) -> Dict[str, Any]:
	"""Build a consistent success response body."""
	payload: Dict[str, Any] = {"status": "success"}

	if message:
		payload["message"] = message

	if data:
		payload.update(data)

	return payload


def error_response(
	error: str,
	*,
	status: int = 400,
	code: Optional[str] = None,
	request_id: Optional[str] = None,
) -> tuple[Dict[str, Any], int]:
	"""Build a consistent error response body and status code tuple."""
	payload: Dict[str, Any] = {
		"status": "error",
		"error": error,
	}

	if code:
		payload["code"] = code

	if request_id:
		payload["request_id"] = request_id

	return payload, status
