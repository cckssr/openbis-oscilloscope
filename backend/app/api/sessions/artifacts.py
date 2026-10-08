"""Per-session artifact routes: list, flag, annotate, read data / image."""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel

from app.api.sessions.access import require_session_access
from app.buffer.service import ArtifactInfo, BufferService
from app.openbis_client.client import UserInfo

router = APIRouter(prefix="/sessions", tags=["sessions"])


def get_buffer(request: Request) -> BufferService:
    """Extract the BufferService from the application state.

    Args:
        request: The current HTTP request.

    Returns:
        The :class:`~app.buffer.service.BufferService` instance from
        ``request.app.state``.
    """
    return request.app.state.buffer_service


def artifact_dict(a: ArtifactInfo) -> dict:
    """Serialise an artifact for API responses.

    Args:
        a: The artifact record.

    Returns:
        A dict with the fields of the frontend ``Artifact`` type.
    """
    return {
        "artifact_id": a.artifact_id,
        "artifact_type": a.artifact_type,
        "channel": a.channel,
        "seq": a.seq,
        "persist": a.persist,
        "created_at": a.created_at,
        "files": a.files,
        "acquisition_id": a.acquisition_id,
        "annotation": a.annotation,
        "run_id": a.run_id,
        "uploaded": a.uploaded,
        "uploaded_at": a.uploaded_at,
        "perm_id": a.perm_id,
    }


@router.get("/{session_id}/artifacts", response_model=list[dict])
async def list_artifacts(
    session_id: str,
    request: Request,
    user: UserInfo = Depends(require_session_access),
) -> list[dict]:
    """Return all artifacts stored for a control session.

    Reads the session's ``index.json`` and returns every artifact entry
    including its type, channel, sequence number, persist flag, upload status
    and file list. Returns an empty list if the session exists but has no
    artifacts, or if the session directory does not exist.

    Args:
        session_id: Path parameter; the UUID returned when the device lock was acquired.
        request: The current HTTP request.
        user: The authenticated user (must own the session or be an admin).

    Returns:
        A list of dicts with ``artifact_id``, ``artifact_type``, ``channel``,
        ``seq``, ``persist``, ``created_at``, ``files``, ``acquisition_id``,
        ``annotation``, ``run_id``, ``uploaded``, ``uploaded_at`` and ``perm_id``.

    Raises:
        ForbiddenError: If the session belongs to another user.
    """
    return [artifact_dict(a) for a in get_buffer(request).list_artifacts(session_id)]


@router.post("/{session_id}/artifacts/{artifact_id}/flag", response_model=dict)
async def flag_artifact(
    session_id: str,
    artifact_id: str,
    persist: bool,
    request: Request,
    user: UserInfo = Depends(require_session_access),
) -> dict:
    """Set or clear the persist flag on a single artifact.

    When ``persist=true`` the artifact will be included in the next call to
    ``POST /sessions/{session_id}/commit``. When ``persist=false`` it is
    excluded from future commits (but the file remains on disk).

    Args:
        session_id: Path parameter; the control session UUID.
        artifact_id: Path parameter; the artifact identifier to update.
        persist: Query parameter; ``true`` to mark for commit, ``false`` to unmark.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``artifact_id`` and the new ``persist`` value.

    Raises:
        SessionNotFoundError: If the session directory does not exist.
        ArtifactNotFoundError: If ``artifact_id`` is not in the session index.
        ForbiddenError: If the session belongs to another user.
    """
    get_buffer(request).set_flag(session_id, artifact_id, persist)
    return {"artifact_id": artifact_id, "persist": persist}


class _AnnotationBody(BaseModel):
    annotation: str


@router.post(
    "/{session_id}/acquisitions/{acquisition_id}/annotation",
    response_model=dict,
    summary="Set acquisition annotation",
    response_description="The acquisition ID and the stored annotation text.",
)
async def set_acquisition_annotation(
    session_id: str,
    acquisition_id: str,
    body: _AnnotationBody,
    request: Request,
    user: UserInfo = Depends(require_session_access),
) -> dict:
    """Attach a user-supplied label to all artifacts in an acquisition group.

    Args:
        session_id: Path parameter; the control session UUID.
        acquisition_id: Path parameter; the UUID shared by channels from one acquire call.
        body: JSON body with ``annotation`` string.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``acquisition_id`` and the stored ``annotation``.

    Raises:
        SessionNotFoundError: If the session directory does not exist.
        ArtifactNotFoundError: If no artifact in the session has this acquisition ID.
        ForbiddenError: If the session belongs to another user.
    """
    get_buffer(request).set_annotation(session_id, acquisition_id, body.annotation)
    return {"acquisition_id": acquisition_id, "annotation": body.annotation}


@router.get(
    "/{session_id}/artifacts/{artifact_id}/data",
    response_model=dict,
    summary="Get artifact waveform data",
    response_description="Time and voltage arrays for the requested trace artifact.",
)
async def get_artifact_data(
    session_id: str,
    artifact_id: str,
    request: Request,
    user: UserInfo = Depends(require_session_access),
) -> dict:
    """Return the time and voltage arrays stored in a trace artifact's CSV file.

    Args:
        session_id: Path parameter; the control session UUID.
        artifact_id: Path parameter; the trace artifact identifier.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A dict with ``artifact_id``, ``channel``, ``time_s``, and ``voltage_V``.

    Raises:
        SessionNotFoundError: If the session directory does not exist.
        ArtifactNotFoundError: If the artifact is not found or has no CSV.
        ForbiddenError: If the session belongs to another user.
    """
    buffer_service = get_buffer(request)
    time_s, voltage_v = buffer_service.get_trace_data(session_id, artifact_id)
    artifacts = buffer_service.list_artifacts(session_id)
    channel = next((a.channel for a in artifacts if a.artifact_id == artifact_id), None)
    return {
        "artifact_id": artifact_id,
        "channel": channel,
        "time_s": time_s,
        "voltage_V": voltage_v,
    }


@router.get(
    "/{session_id}/artifacts/{artifact_id}/image",
    summary="Get artifact screenshot image",
    response_description="PNG screenshot bytes.",
)
async def get_artifact_image(
    session_id: str,
    artifact_id: str,
    request: Request,
    user: UserInfo = Depends(require_session_access),
) -> Response:
    """Return the PNG image for a stored screenshot artifact.

    Args:
        session_id: Path parameter; the control session UUID.
        artifact_id: Path parameter; the screenshot artifact identifier.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        Raw PNG bytes as an ``image/png`` response.

    Raises:
        SessionNotFoundError: If the session directory does not exist.
        ArtifactNotFoundError: If the artifact is not found or has no PNG.
        ForbiddenError: If the session belongs to another user.
    """
    png_bytes = get_buffer(request).get_screenshot_bytes(session_id, artifact_id)
    return Response(content=png_bytes, media_type="image/png")
