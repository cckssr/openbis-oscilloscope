"""``POST /sessions/{id}/commit``: upload artifacts to openBIS (or the dropbox)."""

import asyncio
import json
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from app.api.sessions.access import require_session_access
from app.api.sessions.artifacts import get_buffer
from app.buffer.service import ArtifactInfo, BufferService
from app.config import settings
from app.core.exceptions import SessionNotFoundError, ValidationError
from app.openbis_client.client import UserInfo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


class _CommitRequest(BaseModel):
    experiment_id: str
    object_id: str | None = None
    artifact_ids: list[str] | None = None
    lab_course: str | None = None
    exp_title: str | None = None
    group_name: str | None = None
    semester: str | None = None
    exp_description: str | None = None
    device_under_test: str | None = None
    measurement_purpose: str | None = None
    keywords: str | None = None
    data_quality: str | None = None
    external_parameters: str | None = None
    notes: str | None = None


def openbis_dataset_url(perm_id: str | None) -> str | None:
    """Build the ELN deep link to a dataset.

    Args:
        perm_id: OpenBIS permId of the dataset, or ``None`` (dropbox commits).

    Returns:
        The URL, or ``None`` if the permId or ``OPENBIS_URL`` is unknown.
    """
    if not perm_id or not settings.OPENBIS_URL:
        return None
    # OPENBIS_URL may or may not already end in the "/openbis" context path.
    base = settings.OPENBIS_URL.rstrip("/").removesuffix("/openbis")
    return (
        f"{base}/openbis/webapp/eln-lims/"
        f"?menuUniqueId=null&viewName=showViewDataSetPageFromPermId&viewData={perm_id}"
    )


def _select_artifacts(
    buffer_service: BufferService, session_id: str, artifact_ids: list[str] | None
) -> list[ArtifactInfo]:
    """Pick the artifacts a commit should upload.

    Args:
        buffer_service: The buffer service.
        session_id: Control session UUID.
        artifact_ids: Explicit selection, or ``None``/empty for all flagged artifacts.

    Returns:
        The artifacts to upload.

    Raises:
        SessionNotFoundError: If the session has no artifacts at all.
        ValidationError: If nothing is selected / flagged.
        ArtifactNotFoundError: If an explicit ID is unknown.
    """
    if artifact_ids:
        return buffer_service.get_artifacts(
            session_id, list(dict.fromkeys(artifact_ids))
        )
    flagged = buffer_service.get_flagged_artifacts(session_id)
    if not flagged:
        if not buffer_service.list_artifacts(session_id):
            raise SessionNotFoundError(session_id)
        raise ValidationError("No artifacts are flagged for commit")
    return flagged


def _dataset_properties(selected: list[ArtifactInfo], body: _CommitRequest) -> dict:
    """Compute the OpenBIS dataset properties for a commit.

    Args:
        selected: Artifacts being uploaded.
        body: The request body with the user-entered metadata.

    Returns:
        ``dataset.*`` property dict (derived values plus provided metadata).
    """
    acq_ids = {a.acquisition_id for a in selected if a.acquisition_id}
    num_acquisitions = (
        len(acq_ids)
        if acq_ids
        else sum(1 for a in selected if a.artifact_type == "trace")
    )
    num_channels_used = len({a.channel for a in selected if a.channel is not None})
    timestamps = [datetime.fromisoformat(a.created_at) for a in selected]
    ts_start = min(timestamps)
    ts_end = max(timestamps)

    properties: dict = {
        "dataset.dso_num_acquisitions": num_acquisitions,
        "dataset.dso_timestamp_start": ts_start.strftime("%Y-%m-%d %H:%M:%S"),
        "dataset.dso_timestamp_end": ts_end.strftime("%Y-%m-%d %H:%M:%S"),
        "dataset.dso_duration_s": round((ts_end - ts_start).total_seconds(), 6),
        "dataset.dso_has_screenshots": any(
            a.artifact_type == "screenshot" for a in selected
        ),
        "dataset.dso_has_csv_export": any(a.artifact_type == "trace" for a in selected),
    }
    if num_channels_used > 0:
        properties["dataset.dso_num_channels_used"] = num_channels_used

    for key, value in (
        ("dataset.lab_course", body.lab_course),
        ("dataset.dso_experiment", body.exp_title),
        ("dataset.dso_lab_group", body.group_name),
        ("dataset.dso_semester", body.semester),
        ("dataset.dso_description", body.exp_description),
        ("dataset.dso_dut_description", body.device_under_test),
        ("dataset.dso_measurement_purpose", body.measurement_purpose),
        ("dataset.dso_keywords", body.keywords),
        ("dataset.dso_notes", body.notes),
        ("dataset.dso_data_quality", body.data_quality),
        ("dataset.dso_external_parameters", body.external_parameters),
    ):
        if value is not None:
            properties[key] = value
    return properties


@router.post("/{session_id}/commit", response_model=dict)
async def commit_session(
    session_id: str,
    body: _CommitRequest,
    request: Request,
    user: UserInfo = Depends(require_session_access),
) -> dict:
    """Upload artifacts to OpenBIS as a new dataset and mark them as uploaded.

    Uploads exactly ``body.artifact_ids`` when given, otherwise every artifact
    whose ``persist`` flag is ``true``. Files are compressed into a ZIP
    (channels of one acquisition merged into one CSV) and registered with
    :meth:`~app.openbis_client.client.OpenBISClient.create_dataset`; in dropbox
    mode (``OPENBIS_USE_DROPBOX``) the ZIP is copied to the dropbox instead and
    ``permId`` is ``null``. After success the artifacts get ``uploaded=true``,
    ``uploaded_at`` and ``perm_id`` and their ``persist`` flag is cleared.

    Args:
        session_id: Path parameter; the control session UUID.
        body: JSON body containing ``experiment_id`` (required), optional
            ``artifact_ids`` and optional metadata fields.
        request: The current HTTP request.
        user: The authenticated user (their token is forwarded to OpenBIS).

    Returns:
        ``permId``, ``artifact_count``, ``artifact_ids``, ``openbis_url`` (ELN
        deep link or ``null``) and, in dropbox mode, ``dropbox_file``.

    Raises:
        SessionNotFoundError: If the session directory does not exist.
        ValidationError: If nothing is flagged for commit.
        ArtifactNotFoundError: If an ID in ``artifact_ids`` is unknown.
        OpenBISError: If the pybis dataset creation call fails.
        ForbiddenError: If the session belongs to another user.
    """
    buffer_service = get_buffer(request)
    openbis_client = request.app.state.openbis_client

    selected = _select_artifacts(buffer_service, session_id, body.artifact_ids)
    properties = _dataset_properties(selected, body)
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()

    if settings.OPENBIS_USE_DROPBOX:
        result = await _commit_via_dropbox(
            token=token,
            session_id=session_id,
            selected=selected,
            body=body,
            properties=properties,
            buffer_service=buffer_service,
            openbis_client=openbis_client,
        )
    else:
        zip_path = buffer_service.create_commit_zip(session_id, selected)
        perm_id = await openbis_client.create_dataset(
            token=token,
            experiment_id=body.experiment_id,
            files=[str(zip_path)],
            properties=properties,
            dataset_type=settings.OPENBIS_DATASET_TYPE,
            object_id=body.object_id or None,
        )
        result = {"permId": perm_id}

    artifact_ids = [a.artifact_id for a in selected]
    await asyncio.to_thread(
        buffer_service.mark_uploaded, session_id, artifact_ids, result["permId"]
    )
    return {
        "permId": result["permId"],
        "artifact_count": len(selected),
        "artifact_ids": artifact_ids,
        "openbis_url": openbis_dataset_url(result["permId"]),
        **(
            {"dropbox_file": result["dropbox_file"]} if "dropbox_file" in result else {}
        ),
    }


async def _commit_via_dropbox(
    token: str,
    session_id: str,
    selected: list[ArtifactInfo],
    body: _CommitRequest,
    properties: dict,
    buffer_service: BufferService,
    openbis_client,
) -> dict:
    """Validate the token, compress artifacts and drop the ZIP into the dropbox.

    Args:
        token: The caller's OpenBIS session token.
        session_id: Control session UUID.
        selected: Artifacts to upload.
        body: The commit request (target experiment / object).
        properties: Dataset properties to embed in ``dataset_metadata.json``.
        buffer_service: The buffer service.
        openbis_client: The OpenBIS client (used for token validation only).

    Returns:
        ``{"permId": None, "dropbox_file": <destination path>}``.
    """
    await openbis_client.validate_token(token)

    metadata = {
        "experiment_id": body.experiment_id,
        "object_id": body.object_id,
        "dataset_type": settings.OPENBIS_DATASET_TYPE,
        "properties": properties,
    }
    zip_path = buffer_service.create_commit_zip(
        session_id,
        selected,
        extra_content={"dataset_metadata.json": json.dumps(metadata, indent=2)},
    )

    dropbox_dir = Path(settings.OPENBIS_DROPBOX_PATH)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    dest = dropbox_dir / f"{ts}_{session_id}.zip"

    def _copy_to_dropbox() -> None:
        dropbox_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(zip_path, dest)

    await asyncio.to_thread(_copy_to_dropbox)

    logger.info("Dropbox commit: copied %s → %s", zip_path.name, dest)
    return {"permId": None, "dropbox_file": str(dest)}
