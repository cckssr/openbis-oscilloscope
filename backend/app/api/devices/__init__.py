"""``/devices`` routes, split into focused modules and merged into one ``router``.

=============== ==============================================================
Module          Routes
=============== ==============================================================
``listing``     ``GET /devices``, ``GET /devices/{id}``
``lock``        ``POST /devices/{id}/lock|unlock|heartbeat``
``commands``    ``run``, ``stop``, ``single``, ``force-trigger``, ``autoscale``
``acquire``     ``preview``, ``acquire``, ``acquire/cancel``, ``channels/{ch}/data``
``settings``    ``settings``, ``memory-depth``, channel / timebase / trigger setters
``screenshot``  ``GET|POST screenshot``
``probe``       ``GET probe``
=============== ==============================================================

Note: ``GET /devices/events`` (SSE) is defined in :mod:`app.api.events` and must
be included *before* this router, otherwise ``/devices/{device_id}`` swallows it.
"""

from fastapi import APIRouter

from app.api.devices import (
    acquire,
    commands,
    listing,
    lock,
    probe,
    screenshot,
    settings,
)

router = APIRouter()
for _module in (listing, lock, commands, acquire, settings, screenshot, probe):
    router.include_router(_module.router)

__all__ = ["router"]
