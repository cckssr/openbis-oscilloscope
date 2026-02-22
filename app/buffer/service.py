import csv
import json
import logging
import shutil
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

from app.config import settings
from app.instruments.base_driver import WaveformData

logger = logging.getLogger(__name__)


@dataclass
class ArtifactInfo:
    artifact_id: str
    artifact_type: str  # "trace" | "screenshot"
    channel: int | None
    seq: int
    persist: bool
    created_at: str
    files: list[str]


class BufferService:
    def __init__(self, buffer_dir: str | None = None) -> None:
        self._root = Path(buffer_dir or settings.BUFFER_DIR)

    def _session_dir(self, device_id: str, session_id: str) -> Path:
        d = self._root / device_id / session_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _index_path(self, device_id: str, session_id: str) -> Path:
        return self._session_dir(device_id, session_id) / "index.json"

    def _load_index(self, device_id: str, session_id: str) -> dict:
        p = self._index_path(device_id, session_id)
        if p.exists():
            return json.loads(p.read_text())
        return {"artifacts": []}

    def _save_index(self, device_id: str, session_id: str, index: dict) -> None:
        p = self._index_path(device_id, session_id)
        p.write_text(json.dumps(index, indent=2))

    def _next_seq(self, index: dict) -> int:
        if not index["artifacts"]:
            return 1
        return max(a["seq"] for a in index["artifacts"]) + 1

    def _find_session_dir(self, session_id: str) -> tuple[Path, str] | None:
        """Search all device directories for a session."""
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
        """Write CSV + JSON metadata files; returns artifact_id."""
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
        """Write PNG bytes; returns artifact_id."""
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
        for device_dir in self._root.iterdir():
            if not device_dir.is_dir():
                continue
            if (device_dir / session_id).is_dir():
                return device_dir.name
        return None

    def list_artifacts(self, session_id: str) -> list[ArtifactInfo]:
        result = self._find_session_dir(session_id)
        if result is None:
            return []
        _, device_id = result
        index = self._load_index(device_id, session_id)
        return [ArtifactInfo(**a) for a in index["artifacts"]]

    def set_flag(self, session_id: str, artifact_id: str, persist: bool) -> None:
        result = self._find_session_dir(session_id)
        if result is None:
            from app.core.exceptions import SessionNotFoundError

            raise SessionNotFoundError(session_id)
        _, device_id = result
        index = self._load_index(device_id, session_id)
        for artifact in index["artifacts"]:
            if artifact["artifact_id"] == artifact_id:
                artifact["persist"] = persist
                self._save_index(device_id, session_id, index)
                return
        from app.core.exceptions import ArtifactNotFoundError

        raise ArtifactNotFoundError(artifact_id)

    def get_flagged_artifacts(self, session_id: str) -> list[ArtifactInfo]:
        return [a for a in self.list_artifacts(session_id) if a.persist]

    def get_artifact_paths(self, session_id: str, artifact_id: str) -> list[Path]:
        result = self._find_session_dir(session_id)
        if result is None:
            from app.core.exceptions import SessionNotFoundError

            raise SessionNotFoundError(session_id)
        session_dir, device_id = result
        index = self._load_index(device_id, session_id)
        for artifact in index["artifacts"]:
            if artifact["artifact_id"] == artifact_id:
                return [session_dir / f for f in artifact["files"]]
        from app.core.exceptions import ArtifactNotFoundError

        raise ArtifactNotFoundError(artifact_id)

    def export_hdf5(self, session_id: str, artifact_ids: list[str]) -> Path:
        """Bundle selected artifacts into a single HDF5 file."""
        import h5py

        result = self._find_session_dir(session_id)
        if result is None:
            from app.core.exceptions import SessionNotFoundError

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
                if art is None or art["artifact_type"] != "trace":
                    continue

                csv_file = next(
                    (session_dir / f for f in art["files"] if f.endswith(".csv")), None
                )
                meta_file = next(
                    (session_dir / f for f in art["files"] if f.endswith(".json")), None
                )
                if csv_file is None:
                    continue

                # Read CSV, skip comment lines
                times, volts = [], []
                with csv_file.open() as f:
                    for line in f:
                        if line.startswith("#"):
                            continue
                        parts = line.strip().split(",")
                        if len(parts) == 2:
                            try:
                                times.append(float(parts[0]))
                                volts.append(float(parts[1]))
                            except ValueError:
                                pass  # header row

                grp = h5f.create_group(art_id)
                grp.create_dataset("time_s", data=np.array(times))
                grp.create_dataset("voltage_V", data=np.array(volts))

                if meta_file and meta_file.exists():
                    meta = json.loads(meta_file.read_text())
                    for k, v in meta.items():
                        if isinstance(v, (str, int, float, bool)):
                            grp.attrs[k] = v

        # Copy the unpack script alongside the HDF5 file
        unpack_src = Path(__file__).parent.parent.parent / "scripts" / "unpack_hdf5.py"
        if unpack_src.exists():
            shutil.copy(unpack_src, session_dir / "unpack_hdf5.py")

        return h5_path


buffer_service = BufferService()
