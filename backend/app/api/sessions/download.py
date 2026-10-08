"""``GET /sessions/{id}/download`` and ``/export.h5``: server-built downloads."""

import asyncio
import re
from datetime import datetime, timezone
from pathlib import Path as FsPath

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from app.api.sessions.access import require_session_access
from app.api.sessions.artifacts import get_buffer
from app.buffer.service import ArtifactInfo
from app.core.exceptions import SessionNotFoundError, ValidationError
from app.openbis_client.client import UserInfo

router = APIRouter(prefix="/sessions", tags=["sessions"])

_ARTIFACT_IDS_QUERY = Query(
    default=None,
    description="Artifact IDs to include (repeatable). Omit for the whole session.",
)


def _download_name(device_id: str, extension: str) -> str:
    """Build ``messdaten_<device>_<yyyymmdd-hhmm>.<ext>`` (UTC time).

    Args:
        device_id: Device the session controlled.
        extension: File extension without the dot.

    Returns:
        The suggested download file name.
    """
    device = re.sub(r"[^\w\-]", "_", device_id)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M")
    return f"messdaten_{device}_{stamp}.{extension}"


def _select(
    request: Request, session_id: str, artifact_ids: list[str] | None
) -> tuple[list[ArtifactInfo], str]:
    """Resolve the artifacts and device of a download request.

    Args:
        request: The current HTTP request.
        session_id: Control session UUID.
        artifact_ids: Requested IDs, or ``None``/empty for the whole session.

    Returns:
        ``(artifacts, device_id)``.

    Raises:
        SessionNotFoundError: If the session does not exist.
        ArtifactNotFoundError: If a requested ID is unknown.
    """
    buffer_service = get_buffer(request)
    info = buffer_service.get_session_info(session_id)
    if info is None:
        raise SessionNotFoundError(session_id)
    if artifact_ids:
        arts = buffer_service.get_artifacts(
            session_id, list(dict.fromkeys(artifact_ids))
        )
    else:
        arts = buffer_service.list_artifacts(session_id)
    return arts, info.device_id


@router.get(
    "/{session_id}/download",
    summary="Download artifacts as ZIP",
    response_description="ZIP archive (same layout as an openBIS upload).",
)
async def download_zip(
    session_id: str,
    request: Request,
    artifact_ids: list[str] | None = _ARTIFACT_IDS_QUERY,
    user: UserInfo = Depends(require_session_access),
) -> FileResponse:
    """Build a ZIP of the selected artifacts on the server and send it.

    Uses the commit ZIP layout (channels of one acquisition merged into one CSV,
    annotation used as file name). Without ``artifact_ids`` the whole session is
    included. Nothing is marked as uploaded.

    Returns:
        ``application/zip`` attachment named ``messdaten_<device>_<yyyymmdd-hhmm>.zip``.

    Raises:
        ValidationError: If there is nothing to download.
        ArtifactNotFoundError: If a requested ID is unknown.
        ForbiddenError: If the session belongs to another user.
    """
    arts, device_id = _select(request, session_id, artifact_ids)
    if not arts:
        raise ValidationError("No artifacts to download")
    buffer_service = get_buffer(request)
    dest = buffer_service.new_temp_path(session_id, "download", ".zip")
    path = await asyncio.to_thread(
        buffer_service.create_commit_zip, session_id, arts, None, dest
    )
    return FileResponse(
        path,
        media_type="application/zip",
        filename=_download_name(device_id, "zip"),
        background=BackgroundTask(FsPath.unlink, path, True),
    )


@router.get(
    "/{session_id}/export.h5",
    summary="Export traces as HDF5",
    response_description="HDF5 file with one group per acquisition.",
)
async def export_hdf5(
    session_id: str,
    request: Request,
    artifact_ids: list[str] | None = _ARTIFACT_IDS_QUERY,
    user: UserInfo = Depends(require_session_access),
) -> FileResponse:
    """Export the selected trace artifacts as one HDF5 file.

    Only traces are exported (screenshots are skipped). Without ``artifact_ids``
    all traces of the session are included.

    Returns:
        ``application/x-hdf5`` attachment named
        ``messdaten_<device>_<yyyymmdd-hhmm>.h5``.

    Raises:
        ValidationError: If the selection contains no trace.
        ArtifactNotFoundError: If a requested ID is unknown.
        ForbiddenError: If the session belongs to another user.
    """
    arts, device_id = _select(request, session_id, artifact_ids)
    trace_ids = [a.artifact_id for a in arts if a.artifact_type == "trace"]
    if not trace_ids:
        raise ValidationError("No trace artifacts to export")
    buffer_service = get_buffer(request)
    dest = buffer_service.new_temp_path(session_id, "export", ".h5")
    path = await asyncio.to_thread(
        buffer_service.export_hdf5, session_id, trace_ids, dest
    )
    return FileResponse(
        path,
        media_type="application/x-hdf5",
        filename=_download_name(device_id, "h5"),
        background=BackgroundTask(FsPath.unlink, path, True),
    )
