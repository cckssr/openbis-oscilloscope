"""Registry of in-flight acquisitions, used to cancel full-memory reads."""

import threading
from dataclasses import dataclass, field


@dataclass
class AcquireJob:
    """One acquire request that is queued or running on a device.

    Attributes:
        device_id: Device the acquisition runs on.
        session_id: Control session that started it.
        cancel_event: Set by :meth:`AcquireJobRegistry.cancel`; drivers poll it
            through :meth:`~app.instruments.base_driver.BaseOscilloscopeDriver.raise_if_cancelled`
            (thread-safe, so it works from the driver's worker thread).
    """

    device_id: str
    session_id: str
    cancel_event: threading.Event = field(default_factory=threading.Event)

    @property
    def cancelled(self) -> bool:
        """Whether cancellation was requested for this job."""
        return self.cancel_event.is_set()


class AcquireJobRegistry:
    """Tracks the acquisition currently in flight per device.

    The acquire endpoint registers a job *before* queueing the work on the
    device worker, so a cancel request that arrives while the job still waits
    in the queue is honoured as soon as the job starts reading. The cancel
    endpoint only touches this registry; it never goes through the device queue
    (which is busy executing the acquisition it wants to stop).
    """

    def __init__(self) -> None:
        """Create an empty registry."""
        self._jobs: dict[str, AcquireJob] = {}
        self._lock = threading.Lock()

    def start(self, device_id: str, session_id: str) -> AcquireJob:
        """Register a new job for a device, replacing any stale entry.

        Args:
            device_id: Device the acquisition targets.
            session_id: Control session that started it.

        Returns:
            The registered :class:`AcquireJob`.
        """
        job = AcquireJob(device_id=device_id, session_id=session_id)
        with self._lock:
            self._jobs[device_id] = job
        return job

    def finish(self, job: AcquireJob) -> None:
        """Remove a job once its request completed (successfully or not).

        Args:
            job: The job returned by :meth:`start`. Ignored if it has already
                been replaced by a newer job for the same device.
        """
        with self._lock:
            if self._jobs.get(job.device_id) is job:
                del self._jobs[job.device_id]

    def cancel(self, device_id: str, session_id: str) -> bool:
        """Request cancellation of the device's in-flight acquisition.

        Args:
            device_id: Device whose acquisition should stop.
            session_id: Caller's control session; only that session's job is cancelled.

        Returns:
            ``True`` if a matching job was running or queued, ``False`` if
            there was nothing to cancel.
        """
        with self._lock:
            job = self._jobs.get(device_id)
        if job is None or job.session_id != session_id:
            return False
        job.cancel_event.set()
        return True
