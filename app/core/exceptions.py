from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, status_code: int, detail: str, error_code: str = "error"):
        self.status_code = status_code
        self.detail = detail
        self.error_code = error_code
        super().__init__(detail)


class AuthError(AppError):
    def __init__(self, detail: str = "Authentication required"):
        super().__init__(401, detail, "auth_error")


class ForbiddenError(AppError):
    def __init__(self, detail: str = "Access forbidden"):
        super().__init__(403, detail, "forbidden")


class DeviceNotFoundError(AppError):
    def __init__(self, device_id: str):
        super().__init__(404, f"Device '{device_id}' not found", "device_not_found")


class DeviceOfflineError(AppError):
    def __init__(self, device_id: str):
        super().__init__(503, f"Device '{device_id}' is offline", "device_offline")


class LockConflictError(AppError):
    def __init__(self, device_id: str, owner: str):
        super().__init__(409, f"Device '{device_id}' is locked by '{owner}'", "lock_conflict")


class LockRequiredError(AppError):
    def __init__(self, device_id: str):
        super().__init__(403, f"You do not hold the lock for device '{device_id}'", "lock_required")


class ArtifactNotFoundError(AppError):
    def __init__(self, artifact_id: str):
        super().__init__(404, f"Artifact '{artifact_id}' not found", "artifact_not_found")


class SessionNotFoundError(AppError):
    def __init__(self, session_id: str):
        super().__init__(404, f"Session '{session_id}' not found", "session_not_found")


class OpenBISError(AppError):
    def __init__(self, detail: str = "OpenBIS operation failed"):
        super().__init__(502, detail, "openbis_error")


class AdminRequiredError(AppError):
    def __init__(self):
        super().__init__(403, "Admin privileges required", "admin_required")


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.error_code, "detail": exc.detail},
        )
