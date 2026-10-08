"""``GET /sessions``: the caller's sessions with artifact counts ("Meine Messdaten")."""

import asyncio

from fastapi import APIRouter, Depends, Query, Request

from app.buffer.service import ArtifactInfo, SessionRecord
from app.core.dependencies import get_current_user
from app.core.exceptions import ForbiddenError
from app.openbis_client.client import UserInfo

router = APIRouter(prefix="/sessions", tags=["sessions"])


def count_captures(artifacts: list[ArtifactInfo], flag: str | None = None) -> int:
    """Count captures ("Aufnahmen") among traces, optionally filtered by a flag.

    All channel traces sharing an ``acquisition_id`` form one capture; legacy
    traces without one count individually. Screenshots are not counted here.

    Args:
        artifacts: Artifacts of one session.
        flag: ``None`` to count all captures, ``"persist"`` or ``"uploaded"`` to
            count captures where at least one trace has that attribute set.

    Returns:
        The number of captures.
    """
    keys: set[str] = set()
    for a in artifacts:
        if a.artifact_type != "trace":
            continue
        if flag is None or getattr(a, flag):
            keys.add(a.acquisition_id or a.artifact_id)
    return len(keys)


def summarize(record: SessionRecord, device_label: str, is_active: bool) -> dict | None:
    """Build the ``SessionSummary`` dict for one session.

    Args:
        record: The session and its artifacts.
        device_label: Human-readable device name.
        is_active: Whether the device lock currently belongs to this session.

    Returns:
        The summary dict, or ``None`` for an inactive session without artifacts
        (an empty lock/unlock cycle is not worth listing).
    """
    arts = record.artifacts
    if not arts and not is_active:
        return None
    shots = [a for a in arts if a.artifact_type == "screenshot"]
    created_at = record.info.created_at or min((a.created_at for a in arts), default="")
    last_activity = max((a.created_at for a in arts), default=created_at)
    return {
        "session_id": record.info.session_id,
        "device_id": record.info.device_id,
        "device_label": device_label,
        "owner_user": record.info.owner_user or "",
        "created_at": created_at,
        "last_activity": last_activity,
        "is_active": is_active,
        "counts": {
            "acquisitions": count_captures(arts),
            "screenshots": len(shots),
            "flagged": count_captures(arts, "persist")
            + sum(1 for a in shots if a.persist),
            "uploaded": count_captures(arts, "uploaded")
            + sum(1 for a in shots if a.uploaded),
        },
    }


@router.get(
    "",
    response_model=list[dict],
    summary="List sessions",
    response_description="Session summaries with artifact counts, newest activity first.",
)
async def list_sessions(
    request: Request,
    mine: bool = Query(
        default=True,
        description="Only the caller's sessions. mine=false (all users) is admin-only.",
    ),
    user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    """List control sessions still on disk, newest activity first.

    Each row has ``session_id``, ``device_id``, ``device_label``, ``owner_user``,
    ``created_at``, ``last_activity``, ``is_active`` (the device lock currently
    belongs to this session) and ``counts`` (``acquisitions``, ``screenshots``,
    ``flagged``, ``uploaded``; a multi-channel capture counts once). Sessions
    without artifacts are omitted unless they are active. Legacy sessions
    without a recorded owner appear only for admins with ``mine=false``.

    Raises:
        ForbiddenError: If a non-admin asks for ``mine=false``.
    """
    if not mine and not user.is_admin:
        raise ForbiddenError("Listing all sessions requires admin privileges")

    buffer_service = request.app.state.buffer_service
    manager = request.app.state.instrument_manager
    lock_service = request.app.state.lock_service

    records = await asyncio.to_thread(buffer_service.list_sessions)
    rows: list[dict] = []
    locks: dict[str, str | None] = {}
    for record in records:
        if mine and record.info.owner_user != user.user_id:
            continue
        device_id = record.info.device_id
        if device_id not in locks:
            lock = await lock_service.get_lock(device_id)
            locks[device_id] = lock.session_id if lock else None
        entry = manager.devices.get(device_id)
        row = summarize(
            record,
            entry.config.label if entry else device_id,
            locks[device_id] == record.info.session_id,
        )
        if row is not None:
            rows.append(row)
    rows.sort(key=lambda r: r["last_activity"], reverse=True)
    return rows
