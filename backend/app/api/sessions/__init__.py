"""``/sessions`` routes, split into focused modules and merged into one ``router``.

=============== ==============================================================
Module          Routes
=============== ==============================================================
``listing``     ``GET /sessions`` (own sessions with counts)
``artifacts``   ``GET .../artifacts``, ``POST .../flag``, annotation, data, image
``commit``      ``POST .../commit``
``download``    ``GET .../download`` (ZIP), ``GET .../export.h5``
``access``      ``require_session_access`` dependency (owner / admin check)
=============== ==============================================================
"""

from fastapi import APIRouter

from app.api.sessions import artifacts, commit, download, listing

router = APIRouter()
for _module in (listing, artifacts, commit, download):
    router.include_router(_module.router)

__all__ = ["router"]
