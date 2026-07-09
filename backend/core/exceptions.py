"""Custom exception classes for application-level errors, along with a helper function
to register them with FastAPI.
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    """Base exception for all application-level HTTP errors.

    Subclass this to create domain-specific errors. Each instance carries the
    HTTP status code, a human-readable detail message, and a machine-readable
    error code that is included in the JSON response body.

    Attributes:
        status_code: HTTP status code sent to the client.
        detail: Human-readable description of the error.
        error_code: Snake-case slug included as ``"error"`` in the JSON body.
    """

    def __init__(self, status_code: int, detail: str, error_code: str = "error"):
        """Initialize AppError.

        Args:
            status_code: HTTP status code for the error response.
            detail: Human-readable description of the error.
            error_code: Machine-readable slug (e.g. ``"lock_conflict"``).
        """
        self.status_code = status_code
        self.detail = detail
        self.error_code = error_code
        super().__init__(detail)


class AuthError(AppError):
    """Raised when a request carries a missing or invalid Bearer token (HTTP 401).

    Args:
        detail: Optional custom message. Defaults to ``"Authentication required"``.
    """

    def __init__(self, detail: str = "Authentication required"):
        super().__init__(401, detail, "auth_error")


class ForbiddenError(AppError):
    """Raised when an authenticated user lacks permission for an action (HTTP 403).

    Args:
        detail: Optional custom message. Defaults to ``"Access forbidden"``.
    """

    def __init__(self, detail: str = "Access forbidden"):
        super().__init__(403, detail, "forbidden")


class DeviceNotFoundError(AppError):
    """Raised when a requested device ID does not exist in the inventory (HTTP 404).

    Args:
        device_id: The unknown device identifier included in the error message.
    """

    def __init__(self, device_id: str):
        super().__init__(404, f"Device '{device_id}' not found", "device_not_found")


class DeviceOfflineError(AppError):
    """Raised when a command is issued to a device that is currently unreachable (HTTP 503).

    Args:
        device_id: The offline device identifier included in the error message.
    """

    def __init__(self, device_id: str):
        super().__init__(503, f"Device '{device_id}' is offline", "device_offline")


class LockConflictError(AppError):
    """Raised when a lock acquisition fails because another user holds the lock (HTTP 409).

    Args:
        device_id: The locked device identifier.
        owner: User ID of the current lock holder.
    """

    def __init__(self, device_id: str, owner: str):
        super().__init__(
            409, f"Device '{device_id}' is locked by '{owner}'", "lock_conflict"
        )


class LockRequiredError(AppError):
    """Raised when a command endpoint is called without holding the device lock (HTTP 403).

    Args:
        device_id: The device identifier for which the lock is required.
    """

    def __init__(self, device_id: str):
        super().__init__(
            403, f"You do not hold the lock for device '{device_id}'", "lock_required"
        )


class ArtifactNotFoundError(AppError):
    """Raised when a requested artifact ID does not exist in the buffer (HTTP 404).

    Args:
        artifact_id: The unknown artifact identifier included in the error message.
    """

    def __init__(self, artifact_id: str):
        super().__init__(
            404, f"Artifact '{artifact_id}' not found", "artifact_not_found"
        )


class SessionNotFoundError(AppError):
    """Raised when a requested session ID has no corresponding directory on disk (HTTP 404).

    Args:
        session_id: The unknown session identifier included in the error message.
    """

    def __init__(self, session_id: str):
        super().__init__(404, f"Session '{session_id}' not found", "session_not_found")


class OpenBISError(AppError):
    """Raised when an upstream call to the OpenBIS API fails (HTTP 502).

    Args:
        detail: Optional custom message. Defaults to ``"OpenBIS operation failed"``.
    """

    def __init__(self, detail: str = "OpenBIS operation failed"):
        super().__init__(502, detail, "openbis_error")


class ValidationError(AppError):
    """Raised when a request is syntactically valid but semantically incorrect (HTTP 400).

    Args:
        detail: Human-readable description of what is wrong with the request.
    """

    def __init__(self, detail: str):
        super().__init__(400, detail, "validation_error")


class AdminRequiredError(AppError):
    """Raised when an endpoint that requires admin privileges is accessed by a
    regular user (HTTP 403).
    """

    def __init__(self):
        super().__init__(403, "Admin privileges required", "admin_required")


def register_exception_handlers(app: FastAPI) -> None:
    """Register a global exception handler for :class:`AppError` on a FastAPI application.

    All subclasses of :class:`AppError` will be caught and converted to a JSON
    response with the shape ``{"error": "<error_code>", "detail": "<message>"}``.

    Args:
        app: The FastAPI application instance to register the handler on.
    """

    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        """Convert an :class:`AppError` into a structured JSON error response.

        Args:
            request: The incoming HTTP request (provided by FastAPI).
            exc: The :class:`AppError` instance that was raised.

        Returns:
            A :class:`JSONResponse` with the appropriate HTTP status code and
            a body containing ``error`` and ``detail`` keys.
        """
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.error_code, "detail": exc.detail},
        )
