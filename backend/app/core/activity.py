"""Tracks the most recent API activity timestamp for idle-aware health polling."""

import time


class ActivityTracker:
    """Records when the most recent non-health API request was seen.

    The HealthMonitor consults this to skip poll cycles when no users have
    interacted with the service recently, reducing unnecessary TCP probes
    during idle periods.
    """

    def __init__(self) -> None:
        self._last_activity: float = time.monotonic()

    def record(self) -> None:
        """Update the last-activity timestamp to now."""
        self._last_activity = time.monotonic()

    def is_active(self, idle_timeout_seconds: int) -> bool:
        """Return True if a request was seen within *idle_timeout_seconds*."""
        return (time.monotonic() - self._last_activity) < idle_timeout_seconds
