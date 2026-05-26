"""Server-Sent Events endpoint and fan-out event bus for device/lock state changes."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from app.core.dependencies import get_current_user
from app.openbis_client.client import UserInfo

router = APIRouter(prefix="/devices", tags=["events"])
logger = logging.getLogger(__name__)

_PING_INTERVAL = 20  # seconds between SSE keepalive pings


class EventBus:
    """Simple in-process fan-out bus for device and lock state change events.

    Route handlers and the instrument manager publish JSON-serialisable dicts
    via :meth:`publish`. Each active SSE connection receives every event via
    its own :class:`asyncio.Queue`.
    """

    def __init__(self) -> None:
        self._subscribers: list[asyncio.Queue] = []

    def subscribe(self) -> asyncio.Queue:
        """Register a new subscriber and return its queue."""
        q: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._subscribers.append(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        """Remove a subscriber queue."""
        try:
            self._subscribers.remove(q)
        except ValueError:
            pass

    def publish(self, event: dict) -> None:
        """Fan-out *event* to all current subscribers.

        Subscribers whose queues are full are skipped (they are lagging clients
        that will be disconnected on their next read timeout).
        """
        for q in list(self._subscribers):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                logger.debug("EventBus: dropping event for lagging subscriber")


@router.get(
    "/events",
    summary="Device state event stream",
    response_description="Server-Sent Events stream of device and lock state changes.",
)
async def device_events(
    request: Request,
    _user: UserInfo = Depends(get_current_user),
) -> StreamingResponse:
    """Subscribe to a real-time stream of device and lock state changes.

    Each event is a JSON object with a ``type`` field:

    - ``device_state``: ``{type, device_id, state, last_error}``
    - ``lock``: ``{type, device_id, owner_user, session_id}``

    A ``: ping`` comment is sent every 20 seconds as a keepalive.
    The stream closes when the client disconnects.
    """
    event_bus: EventBus = request.app.state.event_bus
    q = event_bus.subscribe()

    async def _generate():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=_PING_INTERVAL)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            event_bus.unsubscribe(q)

    return StreamingResponse(_generate(), media_type="text/event-stream")
