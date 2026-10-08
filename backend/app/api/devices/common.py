"""Helpers shared by the ``/devices`` route modules."""

import logging

from fastapi import APIRouter, Request

from app.core.exceptions import (
    DeviceNotFoundError,
    DeviceOfflineError,
    LockRequiredError,
)
from app.instruments.base_driver import BaseOscilloscopeDriver
from app.instruments.manager import DeviceEntry, DeviceState, InstrumentManager
from app.locks.service import LockInfo, LockService

logger = logging.getLogger(__name__)


def make_router() -> APIRouter:
    """Create a router mounted under ``/devices`` with the ``devices`` tag.

    Returns:
        A fresh :class:`~fastapi.APIRouter`; every route module builds its own
        and :mod:`app.api.devices` merges them.
    """
    return APIRouter(prefix="/devices", tags=["devices"])


def get_services(request: Request) -> tuple[InstrumentManager, LockService]:
    """Extract the InstrumentManager and LockService from the application state.

    Args:
        request: The current HTTP request.

    Returns:
        A ``(instrument_manager, lock_service)`` tuple sourced from
        ``request.app.state``.
    """
    return request.app.state.instrument_manager, request.app.state.lock_service


def get_entry(manager: InstrumentManager, device_id: str) -> DeviceEntry:
    """Return a device entry or raise the API-level not-found error.

    Args:
        manager: The instrument manager.
        device_id: Device identifier from the URL.

    Returns:
        The :class:`~app.instruments.manager.DeviceEntry`.

    Raises:
        DeviceNotFoundError: If ``device_id`` is unknown.
    """
    try:
        return manager.get_device(device_id)
    except KeyError as e:
        raise DeviceNotFoundError(device_id) from e


def verify_lock_ownership(
    lock: LockInfo | None, user_id: str, session_id: str, device_id: str
) -> None:
    """Assert that the given user and session currently own the device lock.

    Args:
        lock: The current lock, or ``None`` if the device is unlocked.
        user_id: Authenticated user's ID to verify against ``lock.owner_user``.
        session_id: Control session UUID to verify against ``lock.session_id``.
        device_id: Device identifier included in the error message if the check fails.

    Raises:
        LockRequiredError: If ``lock`` is ``None``, the session ID does not match,
            or the user ID does not match.
    """
    if lock is None or lock.session_id != session_id or lock.owner_user != user_id:
        raise LockRequiredError(device_id)


async def get_locked_online_driver(
    request: Request,
    device_id: str,
    user_id: str,
    session_id: str,
) -> tuple[InstrumentManager, BaseOscilloscopeDriver]:
    """Return manager and driver after device, lock, and online-state validation.

    Args:
        request: The current HTTP request.
        device_id: Device identifier from the URL.
        user_id: Authenticated user's ID.
        session_id: Control session UUID supplied by the caller.

    Returns:
        The ``(manager, driver)`` pair.

    Raises:
        DeviceNotFoundError: If ``device_id`` is unknown.
        LockRequiredError: If lock ownership does not match ``user_id`` and
            ``session_id``.
        DeviceOfflineError: If no active driver is connected.
    """
    manager, lock_service = get_services(request)
    entry = get_entry(manager, device_id)

    lock = await lock_service.get_lock(device_id)
    verify_lock_ownership(lock, user_id, session_id, device_id)

    if entry.driver is None:
        raise DeviceOfflineError(device_id)

    return manager, entry.driver


def lock_info_dict(lock: LockInfo | None, user_id: str) -> dict | None:
    """Serialise a lock for API responses.

    ``session_id`` is only included for the lock owner, so they can reclaim
    control after a reload or re-login without leaking it to others.

    Args:
        lock: The current lock, or ``None``.
        user_id: The authenticated user's ID.

    Returns:
        ``None`` for an unlocked device, else a dict with ``owner_user``,
        ``acquired_at``, ``is_mine`` and (owner only) ``session_id``.
    """
    if lock is None:
        return None
    is_mine = lock.owner_user == user_id
    return {
        "owner_user": lock.owner_user,
        "acquired_at": lock.acquired_at,
        "is_mine": is_mine,
        **({"session_id": lock.session_id} if is_mine else {}),
    }


def publish_lock_event(
    request: Request,
    device_id: str,
    owner_user: str | None,
    session_id: str | None,
) -> None:
    """Publish a ``lock`` SSE event if an event bus is attached.

    Args:
        request: The current HTTP request (gives access to ``app.state``).
        device_id: Device whose lock changed.
        owner_user: New lock owner, or ``None`` when released.
        session_id: New control session, or ``None`` when released.
    """
    event_bus = getattr(request.app.state, "event_bus", None)
    if event_bus:
        event_bus.publish(
            {
                "type": "lock",
                "device_id": device_id,
                "owner_user": owner_user,
                "session_id": session_id,
            }
        )


def reconcile_expired_lock(
    request: Request,
    manager: InstrumentManager,
    device_id: str,
    state: DeviceState,
    lock: LockInfo | None,
) -> DeviceState:
    """Move a device from ``LOCKED`` to ``ONLINE`` when its lock key has expired.

    A lock that is never released (crashed client, or a soft release nobody
    reclaimed) simply expires in Redis; nothing else updates the in-memory
    device state. Every read of device state calls this so the device does not
    stay ``LOCKED`` forever.

    Args:
        request: The current HTTP request.
        manager: The instrument manager.
        device_id: Device being read.
        state: The device's current in-memory state.
        lock: The lock currently stored in Redis, or ``None``.

    Returns:
        The (possibly corrected) device state.
    """
    if state == DeviceState.LOCKED and lock is None:
        logger.info("Lock of %s expired; device is ONLINE again", device_id)
        manager.update_state(device_id, DeviceState.ONLINE)
        publish_lock_event(request, device_id, None, None)
        return DeviceState.ONLINE
    return state
