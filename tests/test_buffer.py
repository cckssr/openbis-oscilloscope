import json

import numpy as np
import pytest

from app.buffer.service import BufferService
from app.instruments.base_driver import WaveformData


@pytest.fixture
def svc(tmp_path):
    return BufferService(buffer_dir=str(tmp_path / "buffer"))


def _make_waveform(channel: int = 1, n: int = 100) -> WaveformData:
    t = np.linspace(0, 1e-3, n)
    v = np.sin(2 * np.pi * 1000 * t)
    return WaveformData(
        channel=channel,
        time_array=t,
        voltage_array=v,
        sample_rate=1e9,
        record_length=n,
    )


def test_store_waveform(svc, tmp_path):
    wf = _make_waveform()
    art_id = svc.store_waveform("scope-01", "sess-001", wf, meta={"foo": "bar"})
    assert art_id == "trace_0001_ch1"

    artifacts = svc.list_artifacts("sess-001")
    assert len(artifacts) == 1
    assert artifacts[0].artifact_id == art_id
    assert artifacts[0].artifact_type == "trace"
    assert artifacts[0].channel == 1
    assert artifacts[0].persist is False


def test_csv_format(svc, tmp_path):
    wf = _make_waveform(n=5)
    art_id = svc.store_waveform("scope-01", "sess-001", wf, meta={})

    paths = svc.get_artifact_paths("sess-001", art_id)
    csv_path = next(p for p in paths if p.suffix == ".csv")

    lines = csv_path.read_text().splitlines()
    # First two lines should be comments
    assert lines[0].startswith("# device:")
    assert lines[1].startswith("# sample_rate:")
    # Header row
    assert lines[2] == "time_s,voltage_V"
    # Data rows
    assert len(lines) == 8  # 2 comments + 1 header + 5 data rows


def test_store_screenshot(svc):
    png_bytes = b"\x89PNG fake"
    art_id = svc.store_screenshot("scope-01", "sess-001", png_bytes)
    assert art_id == "screenshot_0001"

    artifacts = svc.list_artifacts("sess-001")
    assert len(artifacts) == 1
    paths = svc.get_artifact_paths("sess-001", art_id)
    assert paths[0].read_bytes() == png_bytes


def test_sequential_seq_numbers(svc):
    wf1 = _make_waveform(channel=1)
    wf2 = _make_waveform(channel=2)
    id1 = svc.store_waveform("scope-01", "sess-001", wf1, meta={})
    id2 = svc.store_waveform("scope-01", "sess-001", wf2, meta={})
    assert id1 == "trace_0001_ch1"
    assert id2 == "trace_0002_ch2"


def test_flag_persist(svc):
    wf = _make_waveform()
    art_id = svc.store_waveform("scope-01", "sess-001", wf, meta={})

    svc.set_flag("sess-001", art_id, persist=True)

    flagged = svc.get_flagged_artifacts("sess-001")
    assert len(flagged) == 1
    assert flagged[0].artifact_id == art_id
    assert flagged[0].persist is True

    svc.set_flag("sess-001", art_id, persist=False)
    assert svc.get_flagged_artifacts("sess-001") == []


def test_flag_unknown_artifact(svc):
    wf = _make_waveform()
    svc.store_waveform("scope-01", "sess-001", wf, meta={})

    from app.core.exceptions import ArtifactNotFoundError

    with pytest.raises(ArtifactNotFoundError):
        svc.set_flag("sess-001", "nonexistent_0099_ch1", persist=True)


def test_list_artifacts_empty_session(svc):
    arts = svc.list_artifacts("no-such-session")
    assert arts == []


def test_metadata_json_written(svc):
    wf = _make_waveform()
    art_id = svc.store_waveform("scope-01", "sess-001", wf, meta={"idn": "TestScope"})
    paths = svc.get_artifact_paths("sess-001", art_id)
    meta_path = next(p for p in paths if p.suffix == ".json")
    meta = json.loads(meta_path.read_text())
    assert meta["instrument_settings"]["idn"] == "TestScope"
    assert meta["channel"] == 1
    assert meta["sample_rate"] == 1e9


def test_hdf5_export(svc):
    pytest.importorskip("h5py")
    wf = _make_waveform(n=50)
    art_id = svc.store_waveform("scope-01", "sess-001", wf, meta={})
    svc.set_flag("sess-001", art_id, persist=True)

    h5_path = svc.export_hdf5("sess-001", [art_id])
    assert h5_path.exists()

    import h5py

    with h5py.File(h5_path, "r") as h5f:
        assert art_id in h5f
        grp = h5f[art_id]
        assert "time_s" in grp
        assert "voltage_V" in grp
        assert len(grp["time_s"][:]) == 50
