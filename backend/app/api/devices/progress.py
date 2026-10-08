"""Thread-safe publisher of ``progress`` SSE events for long acquisitions."""

import asyncio
import time

from app.api.events import EventBus


class ProgressPublisher:
    """Publishes throttled ``progress`` events from a worker thread.

    The driver reads in a thread pool while the :class:`~app.api.events.EventBus`
    lives on the event loop, so events are handed over with
    ``loop.call_soon_threadsafe``. At most one event per ``min_interval`` seconds
    is sent, except the first and the final one (``done >= 1``), which always go
    out so clients see 0 % and 100 %.

    Attributes:
        min_interval: Minimum seconds between two events (default 0.2 = 5 per second).
    """

    def __init__(
        self,
        event_bus: EventBus | None,
        loop: asyncio.AbstractEventLoop,
        device_id: str,
        session_id: str,
        min_interval: float = 0.2,
    ) -> None:
        """Create a publisher bound to one acquire request.

        Args:
            event_bus: The application's event bus, or ``None`` to disable publishing.
            loop: The running event loop (captured in the request handler).
            device_id: Device the acquisition runs on.
            session_id: Control session that started it.
            min_interval: Minimum seconds between events.
        """
        self._bus = event_bus
        self._loop = loop
        self._device_id = device_id
        self._session_id = session_id
        self.min_interval = min_interval
        self._last_sent: float | None = None

    def __call__(self, done: float, detail: str) -> None:
        """Publish a progress event (called from the worker thread).

        Args:
            done: Overall fraction 0..1 across all channels.
            detail: Human-readable step, e.g. ``"CH2: 1,2 / 6 MPkt"``.
        """
        if self._bus is None:
            return
        now = time.monotonic()
        final = done >= 1.0
        if (
            not final
            and self._last_sent is not None
            and now - self._last_sent < self.min_interval
        ):
            return
        self._last_sent = now
        event = {
            "type": "progress",
            "device_id": self._device_id,
            "session_id": self._session_id,
            "job": "acquire",
            "done": round(min(done, 1.0), 4),
            "detail": detail,
        }
        self._loop.call_soon_threadsafe(self._bus.publish, event)
