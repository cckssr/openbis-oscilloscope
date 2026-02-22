from fastapi import APIRouter, Depends, Request
from fastapi import HTTPException

from app.core.dependencies import get_current_user
from app.core.exceptions import ArtifactNotFoundError, SessionNotFoundError
from app.openbis_client.client import UserInfo

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _get_buffer(request: Request):
    return request.app.state.buffer_service


@router.get("/{session_id}/artifacts", response_model=list[dict])
async def list_artifacts(
    session_id: str,
    request: Request,
    user: UserInfo = Depends(get_current_user),
) -> list[dict]:
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
