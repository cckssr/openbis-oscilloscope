"""API endpoints for managing control sessions and their artifacts."""

from fastapi import APIRouter, Depends, Request
from fastapi import HTTPException

from app.core.dependencies import get_current_user
from app.core.exceptions import SessionNotFoundError
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


@router.post("/{session_id}/commit", response_model=dict)
async def commit_session(
    session_id: str,
    experiment_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
    sample_id: str | None = None,
) -> dict:
    """Upload all flagged artifacts to OpenBIS as a new RAW_DATA dataset.

    Collects every artifact whose ``persist`` flag is ``true``, resolves their
    file paths, and calls :meth:`~app.openbis_client.client.OpenBISClient.create_dataset`
    to register them in OpenBIS. Custom properties ``session_id`` and
    ``artifact_count`` are always attached; ``sample`` is included when
    ``sample_id`` is provided.

    Args:
        session_id: Path parameter; the control session UUID.
        experiment_id: Query parameter; the OpenBIS experiment identifier in the
            form ``"/SPACE/PROJECT/EXPERIMENT"``.
        request: The current HTTP request.
        user: The authenticated user (their token is forwarded to OpenBIS).
        sample_id: Optional query parameter; an OpenBIS sample identifier to
            link the dataset to a specific sample.

    Returns:
        A dict with ``permId`` (the OpenBIS permanent dataset identifier) and
        ``artifact_count`` (number of flagged artifacts uploaded).

    Raises:
        SessionNotFoundError: If the session directory does not exist.
        HTTPException (400): If no artifacts in the session are flagged for commit.
        OpenBISError: If the pybis dataset creation call fails.
    """
    buffer_service = _get_buffer(request)
    openbis_client = request.app.state.openbis_client

    flagged = buffer_service.get_flagged_artifacts(session_id)
    if not flagged:
        if not buffer_service.list_artifacts(session_id):
            raise SessionNotFoundError(session_id)
        raise HTTPException(
            status_code=400, detail="No artifacts are flagged for commit"
        )

    # Collect all file paths for flagged artifacts
    all_files = []
    for art in flagged:
        paths = buffer_service.get_artifact_paths(session_id, art.artifact_id)
        all_files.extend(str(p) for p in paths if p.exists())

    # Get token from request headers
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()

    properties = {
        "session_id": session_id,
        "artifact_count": str(len(flagged)),
    }
    if sample_id:
        properties["sample"] = sample_id

    perm_id = await openbis_client.create_dataset(
        token=token,
        experiment_id=experiment_id,
        files=[p for p in all_files],
        properties=properties,
    )

    return {"permId": perm_id, "artifact_count": len(flagged)}
