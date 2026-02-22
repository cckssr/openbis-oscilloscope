"""Service layer for managing on-disk storage of waveform traces, screenshots, and HDF5 exports."""

import csv
import json
import logging
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import h5py
import numpy as np

from app.config import settings
from app.instruments.base_driver import WaveformData
from app.core.exceptions import ArtifactNotFoundError, SessionNotFoundError

logger = logging.getLogger(__name__)


@dataclass
class ArtifactInfo:
    """Metadata record for a single stored artifact.

    Attributes:
        artifact_id: Unique identifier string for this artifact
            (e.g. ``"trace_0001_ch1"`` or ``"screenshot_0002"``).
        artifact_type: Kind of artifact: ``"trace"`` for waveform CSV files,
            ``"screenshot"`` for PNG images.
        channel: 1-based channel number for traces, or ``None`` for screenshots.
        seq: Monotonically increasing sequence number within the session,
            used to determine the most recent artifact per channel.
        persist: When ``True`` the artifact is included in the next OpenBIS commit.
        created_at: ISO-8601 UTC timestamp string of when the artifact was stored.
        files: List of filenames (relative to the session directory) that belong
            to this artifact (e.g. ``["trace_0001_ch1.csv", "trace_0001_meta.json"]``).
    """

    artifact_id: str
    artifact_type: str  # "trace" | "screenshot"
    channel: int | None
    seq: int
    persist: bool
    created_at: str
    files: list[str]


class BufferService:
    """On-disk storage service for waveform traces, screenshots, and HDF5 exports.

    Artifacts are organized under a configurable root directory in the layout::

        {buffer_dir}/
        └── {device_id}/
            └── {session_id}/
                ├── trace_0001_ch1.csv
                ├── trace_0001_meta.json
                ├── screenshot_0002.png
                └── index.json

    ``index.json`` acts as the per-session registry of all artifacts and their
    persist flags. It is the authoritative source of truth for artifact metadata.
    """

    def __init__(self, buffer_dir: str | None = None) -> None:
        """Initialize the BufferService.

        Args:
            buffer_dir: Path to the root storage directory. If ``None``,
                :attr:`~app.config.Settings.BUFFER_DIR` is used.
        """
        self._root = Path(buffer_dir or settings.BUFFER_DIR)

    def _session_dir(self, device_id: str, session_id: str) -> Path:
        """Return (and create) the directory for a device/session pair.

        Args:
            device_id: Device identifier.
            session_id: Control session UUID.

        Returns:
            A :class:`~pathlib.Path` to ``{root}/{device_id}/{session_id}/``.
        """
        d = self._root / device_id / session_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _index_path(self, device_id: str, session_id: str) -> Path:
        """Return the path to the session's ``index.json`` file.

        Args:
            device_id: Device identifier.
            session_id: Control session UUID.

        Returns:
            A :class:`~pathlib.Path` pointing to ``index.json`` inside the
            session directory.
        """
        return self._session_dir(device_id, session_id) / "index.json"

    def _load_index(self, device_id: str, session_id: str) -> dict:
        """Load the artifact index for a session from disk.

        Args:
            device_id: Device identifier.
            session_id: Control session UUID.

        Returns:
            The parsed ``index.json`` dict, or ``{"artifacts": []}`` if the
            file does not yet exist.
        """
        p = self._index_path(device_id, session_id)
        if p.exists():
            return json.loads(p.read_text())
        return {"artifacts": []}

    def _save_index(self, device_id: str, session_id: str, index: dict) -> None:
        """Write the artifact index for a session to disk.

        Args:
            device_id: Device identifier.
            session_id: Control session UUID.
            index: The index dict to serialise to ``index.json``.
        """
        p = self._index_path(device_id, session_id)
        p.write_text(json.dumps(index, indent=2))

    def _next_seq(self, index: dict) -> int:
        """Compute the next sequence number for a new artifact in a session.

        Args:
            index: The current index dict containing an ``"artifacts"`` list.

        Returns:
            ``1`` if no artifacts exist yet, or one more than the current maximum
            sequence number.
        """
        if not index["artifacts"]:
            return 1
        return max(a["seq"] for a in index["artifacts"]) + 1

    def _find_session_dir(self, session_id: str) -> tuple[Path, str] | None:
        """Search all device directories for a session directory.

        Args:
            session_id: Control session UUID to search for.

        Returns:
            A ``(session_dir_path, device_id)`` tuple if found, or ``None``
            if the session does not exist in any device directory.
        """
        if not self._root.exists():
            return None
        for device_dir in self._root.iterdir():
            if not device_dir.is_dir():
                continue
            session_dir = device_dir / session_id
            if session_dir.is_dir():
                return session_dir, device_dir.name
        return None

    def store_waveform(
        self,
        device_id: str,
        session_id: str,
        waveform: WaveformData,
        meta: dict,
    ) -> str:
        """Persist a waveform acquisition as a CSV file plus a JSON metadata sidecar.

        The CSV has two comment lines (prefixed with ``#``) containing the device,
        channel, acquisition timestamp, and sampling parameters, followed by a
        header row and then the numeric data. The JSON sidecar stores the full
        instrument settings snapshot alongside the artifact metadata.

        Args:
            device_id: Identifier of the device that produced the waveform.
            session_id: Control session UUID under which to store the artifact.
            waveform: The :class:`~app.instruments.base_driver.WaveformData` to store.
            meta: Full instrument settings dict from
                :meth:`~app.instruments.base_driver.BaseOscilloscopeDriver.get_all_settings`.

        Returns:
            The ``artifact_id`` string for the new artifact
            (e.g. ``"trace_0001_ch1"``).
        """
        d = self._session_dir(device_id, session_id)
        index = self._load_index(device_id, session_id)
        seq = self._next_seq(index)

        csv_name = f"trace_{seq:04d}_ch{waveform.channel}.csv"
        meta_name = f"trace_{seq:04d}_meta.json"
        artifact_id = f"trace_{seq:04d}_ch{waveform.channel}"
        now_iso = datetime.now(timezone.utc).isoformat()

        # Write CSV
        csv_path = d / csv_name
        with csv_path.open("w", newline="") as f:
            f.write(
                f"# device: {device_id}  channel: {waveform.channel}  acquired: {now_iso}\n"
            )
            f.write(
                f"# sample_rate: {waveform.sample_rate:.3e}  "
                f"record_length: {waveform.record_length}  "
                f"unit_x: {waveform.unit_x}  unit_y: {waveform.unit_y}\n"
            )
            writer = csv.writer(f)
            writer.writerow(["time_s", "voltage_V"])
            for t_val, v_val in zip(waveform.time_array, waveform.voltage_array):
                writer.writerow([f"{t_val:.6e}", f"{v_val:.6e}"])

        # Write metadata JSON
        meta_payload = {
            "artifact_id": artifact_id,
            "device_id": device_id,
            "session_id": session_id,
            "channel": waveform.channel,
            "acquired_at": now_iso,
            "sample_rate": waveform.sample_rate,
            "record_length": waveform.record_length,
            "unit_x": waveform.unit_x,
            "unit_y": waveform.unit_y,
            "instrument_settings": meta,
        }
        (d / meta_name).write_text(json.dumps(meta_payload, indent=2))

        # Update index
        index["artifacts"].append(
            {
                "artifact_id": artifact_id,
                "artifact_type": "trace",
                "channel": waveform.channel,
                "seq": seq,
                "persist": False,
                "created_at": now_iso,
                "files": [csv_name, meta_name],
            }
        )
        self._save_index(device_id, session_id, index)

        logger.debug("Stored waveform artifact %s", artifact_id)
        return artifact_id

    def store_screenshot(
        self,
        device_id: str,
        session_id: str,
        png_bytes: bytes,
    ) -> str:
        """Persist a screenshot PNG file and register it in the session index.

        Args:
            device_id: Identifier of the device that produced the screenshot.
            session_id: Control session UUID under which to store the artifact.
            png_bytes: Raw PNG image data as returned by
                :meth:`~app.instruments.base_driver.BaseOscilloscopeDriver.get_screenshot`.

        Returns:
            The ``artifact_id`` string for the new artifact
            (e.g. ``"screenshot_0002"``).
        """
        d = self._session_dir(device_id, session_id)
        index = self._load_index(device_id, session_id)
        seq = self._next_seq(index)

        png_name = f"screenshot_{seq:04d}.png"
        artifact_id = f"screenshot_{seq:04d}"
        now_iso = datetime.now(timezone.utc).isoformat()

        (d / png_name).write_bytes(png_bytes)

        index["artifacts"].append(
            {
                "artifact_id": artifact_id,
                "artifact_type": "screenshot",
                "channel": None,
                "seq": seq,
                "persist": False,
                "created_at": now_iso,
                "files": [png_name],
            }
        )
        self._save_index(device_id, session_id, index)

        logger.debug("Stored screenshot artifact %s", artifact_id)
        return artifact_id

    def _get_device_id_for_session(self, session_id: str) -> str | None:
        """Look up the device ID associated with a session directory.

        Args:
            session_id: Control session UUID to search for.

        Returns:
            The device ID string if the session directory exists, or ``None``.
        """
        for device_dir in self._root.iterdir():
            if not device_dir.is_dir():
                continue
            if (device_dir / session_id).is_dir():
                return device_dir.name
        return None

    def list_artifacts(self, session_id: str) -> list[ArtifactInfo]:
        """Return all artifacts registered for a session.

        Args:
            session_id: Control session UUID to query.

        Returns:
            A list of :class:`ArtifactInfo` instances in the order they were
            stored. Returns an empty list if the session does not exist.
        """
        result = self._find_session_dir(session_id)
        if result is None:
            return []
        _, device_id = result
        index = self._load_index(device_id, session_id)
        return [ArtifactInfo(**a) for a in index["artifacts"]]

    def set_flag(self, session_id: str, artifact_id: str, persist: bool) -> None:
        """Set or clear the persist flag on an artifact.

        When ``persist=True`` the artifact will be included in the next call to
        :meth:`get_flagged_artifacts` and subsequently uploaded to OpenBIS by the
        commit endpoint.

        Args:
            session_id: Control session UUID containing the artifact.
            artifact_id: Unique artifact identifier to update.
            persist: New value for the persist flag.

        Raises:
            SessionNotFoundError: If the session directory does not exist.
            ArtifactNotFoundError: If ``artifact_id`` is not in the session index.
        """
        result = self._find_session_dir(session_id)
        if result is None:
            raise SessionNotFoundError(session_id)
        _, device_id = result
        index = self._load_index(device_id, session_id)
        for artifact in index["artifacts"]:
            if artifact["artifact_id"] == artifact_id:
                artifact["persist"] = persist
                self._save_index(device_id, session_id, index)
                return

        raise ArtifactNotFoundError(artifact_id)

    def get_flagged_artifacts(self, session_id: str) -> list[ArtifactInfo]:
        """Return all artifacts in a session that are flagged for OpenBIS commit.

        Args:
            session_id: Control session UUID to query.

        Returns:
            A list of :class:`ArtifactInfo` instances where ``persist=True``.
        """
        return [a for a in self.list_artifacts(session_id) if a.persist]

    def get_artifact_paths(self, session_id: str, artifact_id: str) -> list[Path]:
        """Return the absolute file paths for all files belonging to an artifact.

        Args:
            session_id: Control session UUID containing the artifact.
            artifact_id: Unique artifact identifier to look up.

        Returns:
            A list of :class:`~pathlib.Path` objects for the artifact's files
            (e.g. ``[Path(".../trace_0001_ch1.csv"), Path(".../trace_0001_meta.json")]``).

        Raises:
            SessionNotFoundError: If the session directory does not exist.
            ArtifactNotFoundError: If ``artifact_id`` is not in the session index.
        """
        result = self._find_session_dir(session_id)
        if result is None:
            raise SessionNotFoundError(session_id)
        session_dir, device_id = result
        index = self._load_index(device_id, session_id)
        for artifact in index["artifacts"]:
            if artifact["artifact_id"] == artifact_id:
                return [session_dir / f for f in artifact["files"]]

        raise ArtifactNotFoundError(artifact_id)

    def _resolve_trace_files(
        self,
        session_dir: Path,
        artifact: dict,
    ) -> tuple[Path, Path | None] | None:
        """Resolve CSV and metadata paths for a trace artifact.

        Args:
            session_dir: Absolute path to the session directory.
            artifact: Artifact entry from ``index.json``.

        Returns:
            A tuple ``(csv_file, meta_file)`` when the artifact is a trace and
            a CSV file is present. Returns ``None`` for non-trace artifacts or
            if no CSV file is associated.
        """
        if artifact.get("artifact_type") != "trace":
            return None

        csv_file = next(
            (
                session_dir / file_name
                for file_name in artifact["files"]
                if file_name.endswith(".csv")
            ),
            None,
        )
        if csv_file is None:
            return None

        meta_file = next(
            (
                session_dir / file_name
                for file_name in artifact["files"]
                if file_name.endswith(".json")
            ),
            None,
        )
        return csv_file, meta_file

    def _read_trace_csv(self, csv_file: Path) -> tuple[list[float], list[float]]:
        """Read waveform arrays from a trace CSV file.

        Comment lines (prefixed by ``#``), header lines, and malformed rows are
        ignored.

        Args:
            csv_file: Path to the waveform CSV file.

        Returns:
            Two aligned lists: ``(time_values, voltage_values)``.
        """
        time_values: list[float] = []
        voltage_values: list[float] = []

        with csv_file.open(newline="") as handle:
            reader = csv.reader(handle)
            for row in reader:
                if not row or row[0].startswith("#") or len(row) != 2:
                    continue
                try:
                    time_values.append(float(row[0]))
                    voltage_values.append(float(row[1]))
                except ValueError:
                    continue

        return time_values, voltage_values

    def _attach_scalar_metadata(
        self, group: h5py.Group, meta_file: Path | None
    ) -> None:
        """Attach JSON scalar metadata to an HDF5 group.

        Args:
            group: Target HDF5 group for artifact attributes.
            meta_file: Optional JSON metadata sidecar path.
        """
        if meta_file is None or not meta_file.exists():
            return

        metadata = json.loads(meta_file.read_text())
        for key, value in metadata.items():
            if isinstance(value, (str, int, float, bool)):
                group.attrs[key] = value

    def export_hdf5(self, session_id: str, artifact_ids: list[str]) -> Path:
        """Bundle selected trace artifacts into a single HDF5 file.

        Each selected artifact is stored as an HDF5 group containing
        ``time_s`` and ``voltage_V`` datasets, with scalar metadata attributes
        copied from the JSON sidecar. A copy of ``scripts/unpack_hdf5.py`` is
        placed alongside the HDF5 file so recipients can extract the data
        without needing the full service.

        Args:
            session_id: Control session UUID whose artifacts should be exported.
            artifact_ids: List of artifact IDs to include. Only ``"trace"``-type
                artifacts are processed; screenshots and unknown IDs are silently
                skipped.

        Returns:
            The :class:`~pathlib.Path` to the created ``.h5`` file.

        Raises:
            SessionNotFoundError: If the session directory does not exist.
        """
        result = self._find_session_dir(session_id)
        if result is None:
            raise SessionNotFoundError(session_id)
        session_dir, device_id = result
        index = self._load_index(device_id, session_id)
        artifacts = {a["artifact_id"]: a for a in index["artifacts"]}

        h5_path = session_dir / f"export_{session_id}.h5"

        with h5py.File(h5_path, "w") as h5f:
            h5f.attrs["session_id"] = session_id
            h5f.attrs["device_id"] = device_id

            for art_id in artifact_ids:
                art = artifacts.get(art_id)
                if art is None:
                    continue

                trace_files = self._resolve_trace_files(session_dir, art)
                if trace_files is None:
                    continue
                csv_file, meta_file = trace_files

                times, volts = self._read_trace_csv(csv_file)

                grp = h5f.create_group(art_id)
                grp.create_dataset("time_s", data=np.array(times))
                grp.create_dataset("voltage_V", data=np.array(volts))
                self._attach_scalar_metadata(grp, meta_file)

        # Copy the unpack script alongside the HDF5 file
        unpack_src = Path(__file__).parent.parent.parent / "scripts" / "unpack_hdf5.py"
        if unpack_src.exists():
            shutil.copy(unpack_src, session_dir / "unpack_hdf5.py")

        return h5_path


buffer_service = BufferService()
