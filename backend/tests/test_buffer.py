import csv
import io
import json
import zipfile

import numpy as np
import pytest

from app.buffer.service import BufferService, _slugify, _unique_name
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


# ---------------------------------------------------------------------------
# _slugify / _unique_name helpers
# ---------------------------------------------------------------------------


def test_slugify_basic():
    assert _slugify("decay capacitor a") == "decay_capacitor_a"


def test_slugify_special_chars():
    assert _slugify("test (run #3)!") == "test_run_3"


def test_slugify_empty_returns_unnamed():
    assert _slugify("!!!") == "unnamed"
    assert _slugify("   ") == "unnamed"


def test_unique_name_no_collision():
    used: set[str] = set()
    assert _unique_name("foo", ".csv", used) == "foo.csv"
    assert "foo.csv" in used


def test_unique_name_collision():
    used: set[str] = {"foo.csv"}
    assert _unique_name("foo", ".csv", used) == "foo_2.csv"
    assert _unique_name("foo", ".csv", used) == "foo_3.csv"


# ---------------------------------------------------------------------------
# create_commit_zip — single channel, no annotation
# ---------------------------------------------------------------------------


def test_zip_single_channel(svc):
    art_id = svc.store_waveform(
        "scope-01", "sess-zip1", _make_waveform(channel=1, n=10), meta={}
    )
    svc.set_flag("sess-zip1", art_id, persist=True)
    flagged = svc.get_flagged_artifacts("sess-zip1")

    zip_path = svc.create_commit_zip("sess-zip1", flagged)
    assert zip_path.exists()

    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    assert "trace_0001_ch1.csv" in names


def test_zip_single_channel_annotation(svc):
    """Annotation becomes the filename."""
    acq_id = "acq-ann-1"
    art_id = svc.store_waveform(
        "scope-01",
        "sess-zip2",
        _make_waveform(channel=1, n=5),
        meta={},
        acquisition_id=acq_id,
    )
    svc.set_flag("sess-zip2", art_id, persist=True)
    svc.set_annotation("sess-zip2", acq_id, "RC filter step response")
    flagged = svc.get_flagged_artifacts("sess-zip2")

    zip_path = svc.create_commit_zip("sess-zip2", flagged)
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    assert "RC_filter_step_response.csv" in names


# ---------------------------------------------------------------------------
# create_commit_zip — multi-channel merging
# ---------------------------------------------------------------------------


def test_zip_multichannel_merged(svc):
    """Two channels in the same acquisition → single CSV with two voltage columns."""
    acq_id = "acq-mc-1"
    id1 = svc.store_waveform(
        "scope-01",
        "sess-mc",
        _make_waveform(channel=1, n=20),
        meta={},
        acquisition_id=acq_id,
    )
    id2 = svc.store_waveform(
        "scope-01",
        "sess-mc",
        _make_waveform(channel=2, n=20),
        meta={},
        acquisition_id=acq_id,
    )
    svc.set_flag("sess-mc", id1, persist=True)
    svc.set_flag("sess-mc", id2, persist=True)
    flagged = svc.get_flagged_artifacts("sess-mc")

    zip_path = svc.create_commit_zip("sess-mc", flagged)
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        # Only ONE csv for both channels
        csvs = [n for n in names if n.endswith(".csv")]
        assert len(csvs) == 1
        content = zf.read(csvs[0]).decode()

    reader = csv.reader(io.StringIO(content))
    header = next(reader)
    assert header == ["time_s", "ch1_voltage_V", "ch2_voltage_V"]
    rows = list(reader)
    assert len(rows) == 20


def test_zip_multichannel_annotation(svc):
    """Annotation used as filename for merged multi-channel CSV."""
    acq_id = "acq-mc-ann"
    for ch in (1, 2):
        art_id = svc.store_waveform(
            "scope-01",
            "sess-mc-ann",
            _make_waveform(channel=ch, n=5),
            meta={},
            acquisition_id=acq_id,
        )
        svc.set_flag("sess-mc-ann", art_id, persist=True)
    svc.set_annotation("sess-mc-ann", acq_id, "capacitor discharge")
    flagged = svc.get_flagged_artifacts("sess-mc-ann")

    zip_path = svc.create_commit_zip("sess-mc-ann", flagged)
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    assert "capacitor_discharge.csv" in names


# ---------------------------------------------------------------------------
# create_commit_zip — annotation uniqueness
# ---------------------------------------------------------------------------


def test_zip_duplicate_annotations_disambiguated(svc):
    """Same annotation on two separate acquisitions → _2 suffix on the second."""
    for i, sess_acq in enumerate(("acq-dup-1", "acq-dup-2")):
        art_id = svc.store_waveform(
            "scope-01",
            "sess-dup",
            _make_waveform(channel=1, n=5),
            meta={},
            acquisition_id=sess_acq,
        )
        svc.set_flag("sess-dup", art_id, persist=True)
        svc.set_annotation("sess-dup", sess_acq, "same label")

    flagged = svc.get_flagged_artifacts("sess-dup")
    zip_path = svc.create_commit_zip("sess-dup", flagged)

    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
    assert "same_label.csv" in names
    assert "same_label_2.csv" in names


# ---------------------------------------------------------------------------
# create_commit_zip — extra_content injection
# ---------------------------------------------------------------------------


def test_zip_extra_content(svc):
    art_id = svc.store_waveform("scope-01", "sess-extra", _make_waveform(n=5), meta={})
    svc.set_flag("sess-extra", art_id, persist=True)
    flagged = svc.get_flagged_artifacts("sess-extra")

    zip_path = svc.create_commit_zip(
        "sess-extra",
        flagged,
        extra_content={"meta.json": '{"experiment_id": "/S/P/E"}'},
    )
    with zipfile.ZipFile(zip_path) as zf:
        assert "meta.json" in zf.namelist()
        assert json.loads(zf.read("meta.json"))["experiment_id"] == "/S/P/E"


# ---------------------------------------------------------------------------
# create_commit_zip — screenshot
# ---------------------------------------------------------------------------


def test_zip_screenshot(svc):
    art_id = svc.store_screenshot("scope-01", "sess-png", b"\x89PNG fake")
    svc.set_flag("sess-png", art_id, persist=True)
    flagged = svc.get_flagged_artifacts("sess-png")

    zip_path = svc.create_commit_zip("sess-png", flagged)
    with zipfile.ZipFile(zip_path) as zf:
        pngs = [n for n in zf.namelist() if n.endswith(".png")]
    assert len(pngs) == 1
    assert pngs[0] == "screenshot_0001.png"
