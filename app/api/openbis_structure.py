"""API endpoints for querying the OpenBIS space hierarchy (projects, collections, objects)."""

import logging
from typing import Any

import cachetools
from fastapi import APIRouter, Depends, Query, Request
from pybis import Openbis

from app.config import settings
from app.core.dependencies import get_current_user
from app.core.exceptions import OpenBISError
from app.openbis_client.client import UserInfo

router = APIRouter(prefix="/openbis/structure", tags=["openbis-structure"])

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# TTL cache: keyed by (token, space/project/collection) — 5-minute TTL
# ---------------------------------------------------------------------------

_projects_cache: cachetools.TTLCache = cachetools.TTLCache(maxsize=256, ttl=300)
_collections_cache: cachetools.TTLCache = cachetools.TTLCache(maxsize=512, ttl=300)
_objects_cache: cachetools.TTLCache = cachetools.TTLCache(maxsize=1024, ttl=300)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DAY_MAP = {
    "MO": "Montag",
    "DI": "Dienstag",
    "MI": "Mittwoch",
    "DO": "Donnerstag",
    "FR": "Freitag",
}


def _parse_project_display(code: str) -> str:
    """Convert a project code like ``DI_X_LOLOVIC`` to ``Dienstag — LOLOVIC``."""
    parts = code.split("_")
    if len(parts) >= 3:
        day = _DAY_MAP.get(parts[0], parts[0])
        surname = "_".join(parts[2:])
        return f"{day} — {surname}"
    return code


def _parse_semester(space_code: str) -> str:
    """Convert a space code like ``GP_2025_WISE`` to ``WiSe 2025``."""
    parts = space_code.split("_")
    if len(parts) >= 3:
        year = parts[1]
        kind = parts[2].upper()
        label = "WiSe" if kind == "WISE" else "SoSe"
        return f"{label} {year}"
    return space_code


def _get_openbis(token: str) -> Openbis:
    o = Openbis(settings.OPENBIS_URL, verify_certificates=True)
    o.set_token(token, save_token=False)
    return o


def _extract_token(request: Request, credentials_token: str | None) -> str:
    """Return the raw token string from the Authorization header or cookie."""
    if credentials_token:
        return credentials_token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth.removeprefix("Bearer ").strip()
    cookie = request.cookies.get("openbis", "")
    return cookie


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/projects", response_model=list[dict])
async def list_projects(
    request: Request,
    space: str = Query(default=None, description="Space code. Defaults to OPENBIS_SPACE setting."),
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Return all projects in the configured OpenBIS space.

    Response items: ``{code, display_name, semester}``.
    Results are cached per (token, space) for 5 minutes.
    """
    space_code = space or settings.OPENBIS_SPACE
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip() or request.cookies.get("openbis", "")
    cache_key = (token, space_code)

    if cache_key in _projects_cache:
        return _projects_cache[cache_key]

    if settings.DEBUG:
        result = [{"code": "DEBUG_PROJECT", "display_name": "Debug Project", "semester": "WiSe 2025"}]
        _projects_cache[cache_key] = result
        return result

    try:
        o = _get_openbis(token)
        sp = o.get_space(space_code)
        semester = _parse_semester(space_code)
        result = [
            {
                "code": p.code,
                "display_name": _parse_project_display(p.code),
                "semester": semester,
            }
            for p in sp.get_projects()
        ]
        _projects_cache[cache_key] = result
        return result
    except Exception as exc:
        logger.error("Failed to list OpenBIS projects for space %s: %s", space_code, exc)
        raise OpenBISError(f"Failed to list projects: {exc}") from exc


@router.get("/collections", response_model=list[dict])
async def list_collections(
    request: Request,
    project: str = Query(..., description="Project code, e.g. DI_X_LOLOVIC."),
    space: str = Query(default=None, description="Space code. Defaults to OPENBIS_SPACE setting."),
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Return all collections (experiments) within a project.

    Response items: ``{code, display_name}``.
    Results are cached per (token, space, project) for 5 minutes.
    """
    space_code = space or settings.OPENBIS_SPACE
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip() or request.cookies.get("openbis", "")
    cache_key = (token, space_code, project)

    if cache_key in _collections_cache:
        return _collections_cache[cache_key]

    if settings.DEBUG:
        result = [{"code": f"{project}_EXP_1", "display_name": "EXP 1"}]
        _collections_cache[cache_key] = result
        return result

    try:
        o = _get_openbis(token)
        sp = o.get_space(space_code)
        proj = None
        for p in sp.get_projects():
            if p.code == project:
                proj = p
                break
        if proj is None:
            return []

        prefix = f"{project}_"
        result = []
        for col in proj.get_collections():
            display = col.code.removeprefix(prefix) if col.code.startswith(prefix) else col.code
            display = display.replace("_", " ")
            result.append({"code": col.code, "display_name": display})

        _collections_cache[cache_key] = result
        return result
    except Exception as exc:
        logger.error("Failed to list collections for project %s: %s", project, exc)
        raise OpenBISError(f"Failed to list collections: {exc}") from exc


@router.get("/objects", response_model=list[dict])
async def list_objects(
    request: Request,
    collection: str = Query(..., description="Collection code, e.g. DI_X_LOLOVIC_EXP_10."),
    space: str = Query(default=None, description="Space code. Defaults to OPENBIS_SPACE setting."),
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """Return all objects (samples) within a collection.

    Response items: ``{code, type, identifier}`` where ``identifier`` is
    the full OpenBIS path suitable for use as ``sample_id`` in the commit form.
    Results are cached per (token, space, collection) for 5 minutes.
    """
    space_code = space or settings.OPENBIS_SPACE
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip() or request.cookies.get("openbis", "")
    cache_key = (token, space_code, collection)

    if cache_key in _objects_cache:
        return _objects_cache[cache_key]

    if settings.DEBUG:
        result = [{"code": "DEBUG_OBJ-001", "type": "GP_STANDARDVERSUCH", "identifier": f"/{space_code}/DEBUG_OBJ-001"}]
        _objects_cache[cache_key] = result
        return result

    try:
        o = _get_openbis(token)
        sp = o.get_space(space_code)
        target_col = None
        for proj in sp.get_projects():
            for col in proj.get_collections():
                if col.code == collection:
                    target_col = col
                    break
            if target_col:
                break

        if target_col is None:
            return []

        result = []
        for obj in target_col.get_objects():
            result.append({
                "code": obj.code,
                "type": obj.type,
                "identifier": obj.identifier,
            })

        _objects_cache[cache_key] = result
        return result
    except Exception as exc:
        logger.error("Failed to list objects for collection %s: %s", collection, exc)
        raise OpenBISError(f"Failed to list objects: {exc}") from exc
