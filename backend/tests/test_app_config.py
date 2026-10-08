"""Tests for the public ``GET /config`` endpoint and the SSE route order."""

import asyncio

import pytest

from app.config import settings


@pytest.mark.asyncio
async def test_config_is_public_and_complete(async_client):
    resp = await async_client.get("/config")  # no Authorization header
    assert resp.status_code == 200
    data = resp.json()
    assert set(data) == {
        "debug",
        "version",
        "openbis_url",
        "lab_courses",
        "lock_ttl_seconds",
        "lock_soft_release_seconds",
        "eod_reset_time",
        "eod_timezone",
    }
    assert isinstance(data["version"], str) and data["version"]
    assert data["lock_ttl_seconds"] == settings.LOCK_TTL_SECONDS
    assert data["lock_soft_release_seconds"] == settings.LOCK_SOFT_RELEASE_SECONDS
    assert data["eod_reset_time"] == "23:59"
    assert data["eod_timezone"] == settings.EOD_RESET_TIMEZONE
    assert {"value": "GP1", "label": "GP1 – Grundpraktikum 1"} in data["lab_courses"]
    assert [c["value"] for c in data["lab_courses"]] == [
        "GP1",
        "GP2",
        "GP3",
        "Projektlabor",
    ]


def test_lab_courses_can_be_configured_from_json(monkeypatch):
    from app.config import Settings

    monkeypatch.setenv("LAB_COURSES", '[{"value":"X","label":"Kurs X"}]')
    assert Settings().LAB_COURSES == [{"value": "X", "label": "Kurs X"}]


def test_new_lock_defaults():
    from app.config import Settings

    fields = Settings.model_fields
    assert fields["LOCK_TTL_SECONDS"].default == 300
    assert fields["LOCK_SOFT_RELEASE_SECONDS"].default == 60


@pytest.mark.asyncio
async def test_devices_events_streams_instead_of_device_not_found(app):
    """GET /devices/events must not be swallowed by GET /devices/{device_id}."""
    sent: list[dict] = []
    disconnected = asyncio.Event()
    started = asyncio.Event()

    async def receive():
        await disconnected.wait()
        return {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)
        if message["type"] == "http.response.start":
            started.set()

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/devices/events",
        "raw_path": b"/devices/events",
        "query_string": b"",
        "headers": [(b"authorization", b"Bearer tok")],
        "server": ("test", 80),
        "client": ("test", 1234),
        "app": app,
    }
    task = asyncio.create_task(app(scope, receive, send))
    await asyncio.wait_for(started.wait(), timeout=5)
    start = next(m for m in sent if m["type"] == "http.response.start")
    headers = {k.decode(): v.decode() for k, v in start["headers"]}
    assert start["status"] == 200
    assert headers["content-type"].startswith("text/event-stream")

    # An event published on the bus reaches the stream; then the client leaves.
    app.state.event_bus.publish({"type": "lock", "device_id": "scope-01"})
    for _ in range(100):
        if any(m["type"] == "http.response.body" and m.get("body") for m in sent):
            break
        await asyncio.sleep(0.02)
    disconnected.set()
    await asyncio.wait_for(task, timeout=5)
    body = b"".join(
        m.get("body", b"") for m in sent if m["type"] == "http.response.body"
    )
    assert b'"device_id": "scope-01"' in body
