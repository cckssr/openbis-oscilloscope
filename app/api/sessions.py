"""API endpoints for managing control sessions and their artifacts."""

from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response
from pydantic import BaseModel

from app.core.dependencies import get_current_user
from app.core.exceptions import SessionNotFoundError, ValidationError
from app.openbis_client.client import UserInfo

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_buffer(request: Request):
    """Extract the BufferService from the application state.

    Args:
        request: The current HTTP request.

    Returns:
        The :class:`~app.buffer.service.BufferService` instance from
        ``request.app.state``.
    """
    return request.app.state.buffer_service


@router.get("/{session_id}/artifacts", response_model=list[dict])
async def list_artifacts(
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    """Return all artifacts stored for a control session.

    Reads the session's ``index.json`` and returns every artifact entry
    including its type, channel, sequence number, persist flag, and file list.
    Returns an empty list if the session exists but has no artifacts, or if
    the session directory does not exist.

    Args:
        session_id: Path parameter; the UUID returned when the device lock was acquired.
        request: The current HTTP request.
        user: The authenticated user.

    Returns:
        A list of dicts with ``artifact_id``, ``artifact_type``, ``channel``,
        ``seq``, ``persist``, ``created_at``, and ``files``.
    """
    buffer_service = _get_buffer(request)
    artifacts = buffer_service.list_artifacts(session_id)
    return [
        {
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
        }
        for a in artifacts
    ]


@router.post("/{session_id}/artifacts/{artifact_id}/flag", response_model=dict)
async def flag_artifact(
    session_id: str,
    artifact_id: str,
    persist: bool,
    request: Request,
    user: UserInfo = Depends(get_current_user),
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
    """
    buffer_service = _get_buffer(request)
    buffer_service.set_flag(session_id, artifact_id, persist)
    return {"artifact_id": artifact_id, "persist": persist}


class _CommitRequest(BaseModel):
    experiment_id: str
    sample_id: str | None = None
    lab_course: str | None = None
    exp_title: str | None = None
    group_name: str | None = None
    semester: str | None = None
    exp_description: str | None = None
    device_under_test: str | None = None
    notes: str | None = None


@router.post("/{session_id}/commit", response_model=dict)
async def commit_session(
    session_id: str,
    body: _CommitRequest,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> dict:
    """Upload all flagged artifacts to OpenBIS as a new RAW_DATA dataset.

    Collects every artifact whose ``persist`` flag is ``true``, resolves their
    file paths, and calls :meth:`~app.openbis_client.client.OpenBISClient.create_dataset`
    to register them in OpenBIS.

    Args:
        session_id: Path parameter; the control session UUID.
        body: JSON body containing ``experiment_id`` (required) and optional
            metadata fields (``sample_id``, ``lab_course``, ``exp_title``,
            ``group_name``, ``semester``, ``exp_description``,
            ``device_under_test``, ``notes``).
        request: The current HTTP request.
        user: The authenticated user (their token is forwarded to OpenBIS).

    Returns:
        A dict with ``permId`` (the OpenBIS permanent dataset identifier) and
        ``artifact_count`` (number of flagged artifacts uploaded).

    Raises:
        SessionNotFoundError: If the session directory does not exist.
        ValidationError: If no artifacts in the session are flagged for commit.
        OpenBISError: If the pybis dataset creation call fails.
    """
    buffer_service = _get_buffer(request)
    openbis_client = request.app.state.openbis_client

    flagged = buffer_service.get_flagged_artifacts(session_id)
    if not flagged:
        if not buffer_service.list_artifacts(session_id):
            raise SessionNotFoundError(session_id)
        raise ValidationError("No artifacts are flagged for commit")

    all_files = []
    for art in flagged:
        paths = buffer_service.get_artifact_paths(session_id, art.artifact_id)
        all_files.extend(str(p) for p in paths if p.exists())

    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()

    properties: dict[str, str] = {
        "session_id": session_id,
        "artifact_count": str(len(flagged)),
    }
    if body.sample_id:
        properties["sample"] = body.sample_id
    for key, value in (
        ("lab_course", body.lab_course),
        ("exp_title", body.exp_title),
        ("group_name", body.group_name),
        ("semester", body.semester),
        ("exp_description", body.exp_description),
        ("device_under_test", body.device_under_test),
        ("notes", body.notes),
    ):
        if value:
            properties[key] = value

    perm_id = await openbis_client.create_dataset(
        token=token,
        experiment_id=body.experiment_id,
        files=all_files,
        properties=properties,
    )

    return {"permId": perm_id, "artifact_count": len(flagged)}


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
    user: UserInfo = Depends(get_current_user),
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
    """
    buffer_service = _get_buffer(request)
    buffer_service.set_annotation(session_id, acquisition_id, body.annotation)
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
    user: UserInfo = Depends(get_current_user),
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
    """
    buffer_service = _get_buffer(request)
    time_s, voltage_v = buffer_service.get_trace_data(session_id, artifact_id)
    # Resolve channel from the index
    artifacts = buffer_service.list_artifacts(session_id)
    channel = next(
        (a.channel for a in artifacts if a.artifact_id == artifact_id), None
    )
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
    user: UserInfo = Depends(get_current_user),
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
    """
    buffer_service = _get_buffer(request)
    png_bytes = buffer_service.get_screenshot_bytes(session_id, artifact_id)
    return Response(content=png_bytes, media_type="image/png")
