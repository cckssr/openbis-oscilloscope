"""Concurrent load test against the running API and real oscilloscope hardware.

Exercises N devices at once with full-memory-depth ("MAX") waveform
acquisitions to stress the network/VISA link and the FastAPI service, and
optionally simulates multiple browser tabs racing to lock the same device.

This talks to a *running* service instance (DEBUG=False, real Redis, real
drivers) over HTTP — it is not a pytest suite and does not spin up the app
itself. It never touches devices that aren't named on the command line or
listed by `GET /devices`, and it always releases any lock it acquires.

All status/progress output goes to stderr; the report itself (text, json, or
csv — see --format) is the only thing written to stdout, so it pipelines
cleanly:

    python scripts/load_test.py --token <bearer> --format json > report.json
    python scripts/load_test.py --token <bearer> --format csv --output run1.csv

Usage:
    python scripts/load_test.py --base-url http://localhost:8000 --token <bearer>
    python scripts/load_test.py --devices scope-01,scope-02 --rounds 3
    python scripts/load_test.py --dry-run                     # cheap /probe only
    python scripts/load_test.py --contention 3                # racing UI tabs
    python scripts/load_test.py --contention 3 --token2 <bearer-of-second-user>

Token, base URL, and second token may also come from OSC_TOKEN, OSC_BASE_URL,
OSC_TOKEN2 env vars. See scripts/README.md for a full option reference.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import io
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx


@dataclass
class Timing:
    device_id: str
    phase: str
    round: int
    ok: bool
    seconds: float
    detail: str = ""
    samples: int | None = None
    payload_bytes: int | None = None


@dataclass
class DeviceResult:
    device_id: str
    timings: list[Timing] = field(default_factory=list)


RESULTS: dict[str, DeviceResult] = {}
ARGS: argparse.Namespace | None = None
MODE = "unknown"
START_TIME = 0.0


def log(*a: object) -> None:
    print(*a, file=sys.stderr)


def _record(
    device_id: str,
    phase: str,
    round_no: int,
    ok: bool,
    seconds: float,
    detail: str = "",
    samples: int | None = None,
    payload_bytes: int | None = None,
) -> None:
    RESULTS.setdefault(device_id, DeviceResult(device_id)).timings.append(
        Timing(device_id, phase, round_no, ok, seconds, detail, samples, payload_bytes)
    )


def _error_detail(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        return f"{body.get('error', resp.status_code)}: {body.get('detail', '')}"
    except ValueError:
        return f"HTTP {resp.status_code}"


async def run_device(
    client: httpx.AsyncClient,
    base_url: str,
    device_id: str,
    args: argparse.Namespace,
) -> None:
    params_common = {}
    if args.channels:
        params_common["channels"] = args.channels

    for round_no in range(1, args.rounds + 1):
        session_id: str | None = None
        try:
            t0 = time.monotonic()
            resp = await client.post(f"{base_url}/devices/{device_id}/lock")
            dt = time.monotonic() - t0
            if resp.status_code != 200:
                _record(device_id, "lock", round_no, False, dt, _error_detail(resp))
                continue
            session_id = resp.json()["control_session_id"]
            _record(device_id, "lock", round_no, True, dt)

            t0 = time.monotonic()
            acquire_params = {
                "session_id": session_id,
                "max_samples": str(args.max_samples).lower(),
                **params_common,
            }
            resp = await client.post(
                f"{base_url}/devices/{device_id}/acquire",
                params=acquire_params,
                timeout=args.timeout,
            )
            dt = time.monotonic() - t0
            if resp.status_code != 200:
                _record(device_id, "acquire", round_no, False, dt, _error_detail(resp))
                continue
            body = resp.json()
            n_channels = len(body["channels"])
            _record(
                device_id,
                "acquire",
                round_no,
                True,
                dt,
                f"{n_channels} channel(s)",
                payload_bytes=len(resp.content),
            )

            if args.fetch_data:
                for ch in body["channels"]:
                    t0 = time.monotonic()
                    resp = await client.get(
                        f"{base_url}/devices/{device_id}/channels/{ch['channel']}/data",
                        params={"session_id": session_id},
                        timeout=args.timeout,
                    )
                    dt = time.monotonic() - t0
                    if resp.status_code != 200:
                        _record(
                            device_id,
                            "fetch_data",
                            round_no,
                            False,
                            dt,
                            _error_detail(resp),
                        )
                        continue
                    n_samples = len(resp.json().get("voltage_V", []))
                    _record(
                        device_id,
                        "fetch_data",
                        round_no,
                        True,
                        dt,
                        f"ch{ch['channel']}",
                        samples=n_samples,
                        payload_bytes=len(resp.content),
                    )
        finally:
            if session_id:
                t0 = time.monotonic()
                resp = await client.post(
                    f"{base_url}/devices/{device_id}/unlock",
                    params={"session_id": session_id},
                )
                dt = time.monotonic() - t0
                _record(device_id, "unlock", round_no, resp.status_code == 200, dt)

        if args.stagger:
            await asyncio.sleep(args.stagger)


async def run_probe(client: httpx.AsyncClient, base_url: str, device_id: str) -> None:
    t0 = time.monotonic()
    resp = await client.get(f"{base_url}/devices/{device_id}/probe")
    dt = time.monotonic() - t0
    if resp.status_code != 200:
        _record(device_id, "probe", 1, False, dt, _error_detail(resp))
        return
    body = resp.json()
    ok = bool(body.get("tcp_reachable")) and bool(body.get("driver_connect"))
    detail = f"tcp={body.get('tcp_reachable')} driver_connect={body.get('driver_connect')} identify={body.get('identify_result')}"
    _record(device_id, "probe", 1, ok, dt, detail)


async def run_contention(
    client_a: httpx.AsyncClient,
    client_b: httpx.AsyncClient | None,
    base_url: str,
    device_id: str,
    n: int,
) -> None:
    clients = (
        [client_a] * n if client_b is None else [client_a, client_b] * ((n + 1) // 2)
    )
    clients = clients[:n]

    async def _attempt(client: httpx.AsyncClient) -> httpx.Response:
        return await client.post(f"{base_url}/devices/{device_id}/lock")

    t0 = time.monotonic()
    responses = await asyncio.gather(
        *(_attempt(c) for c in clients), return_exceptions=True
    )
    dt = time.monotonic() - t0

    winners = []
    for client, resp in zip(clients, responses):
        if isinstance(resp, Exception):
            continue
        if resp.status_code == 200:
            winners.append((client, resp.json()["control_session_id"]))

    ok = len(winners) == 1
    detail = (
        f"{len(winners)}/{n} attempts won the lock in {dt:.3f}s (expected exactly 1)"
    )
    _record(device_id, "contention", 1, ok, dt, detail)

    for client, session_id in winners:
        await client.post(
            f"{base_url}/devices/{device_id}/unlock", params={"session_id": session_id}
        )


async def list_devices(client: httpx.AsyncClient, base_url: str) -> list[dict]:
    resp = await client.get(f"{base_url}/devices")
    resp.raise_for_status()
    return resp.json()


def _pctile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, int(len(s) * p))
    return s[idx]


def _stats(values: list[float]) -> dict:
    if not values:
        return {}
    return {
        "n": len(values),
        "mean": round(statistics.mean(values), 4),
        "median": round(statistics.median(values), 4),
        "stdev": round(statistics.stdev(values), 4) if len(values) > 1 else 0.0,
        "min": round(min(values), 4),
        "max": round(max(values), 4),
        "p50": round(_pctile(values, 0.50), 4),
        "p90": round(_pctile(values, 0.90), 4),
        "p95": round(_pctile(values, 0.95), 4),
        "p99": round(_pctile(values, 0.99), 4),
    }


def _throughput(timings: list[Timing]) -> dict | None:
    ok_with_samples = [
        t for t in timings if t.ok and t.samples is not None and t.seconds > 0
    ]
    if not ok_with_samples:
        return None
    total_samples = sum(t.samples for t in ok_with_samples)
    total_bytes = sum(t.payload_bytes or 0 for t in ok_with_samples)
    total_secs = sum(t.seconds for t in ok_with_samples)
    per_request = [t.samples / t.seconds for t in ok_with_samples]
    return {
        "total_samples": total_samples,
        "total_bytes": total_bytes,
        "samples_per_sec_mean": round(statistics.mean(per_request), 1),
        "aggregate_samples_per_sec": round(total_samples / total_secs, 1)
        if total_secs
        else 0.0,
        "aggregate_kb_per_sec": round(total_bytes / 1024 / total_secs, 2)
        if total_secs
        else 0.0,
    }


def build_report(
    args: argparse.Namespace | None, base_url: str, mode: str, wall_dt: float
) -> dict:
    devices_report = {}
    total_ok = 0
    total_fail = 0
    for device_id, result in RESULTS.items():
        by_phase: dict[str, list[Timing]] = {}
        for t in result.timings:
            by_phase.setdefault(t.phase, []).append(t)
        phases = {}
        for phase, timings in by_phase.items():
            ok = [t for t in timings if t.ok]
            fail = [t for t in timings if not t.ok]
            total_ok += len(ok)
            total_fail += len(fail)
            entry = {
                "n": len(timings),
                "ok": len(ok),
                "fail": len(fail),
                "seconds": _stats([t.seconds for t in timings]),
                "failures": [{"round": t.round, "detail": t.detail} for t in fail],
            }
            throughput = _throughput(timings)
            if throughput:
                entry["throughput"] = throughput
            phases[phase] = entry
        devices_report[device_id] = {
            "phases": phases,
            "raw": [
                {
                    "round": t.round,
                    "phase": t.phase,
                    "ok": t.ok,
                    "seconds": round(t.seconds, 4),
                    "samples": t.samples,
                    "bytes": t.payload_bytes,
                    "detail": t.detail,
                }
                for t in result.timings
            ],
        }
    return {
        "target": base_url,
        "mode": mode,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "wall_clock_seconds": round(wall_dt, 3),
        "args": {
            "devices": list(RESULTS.keys()),
            "rounds": getattr(args, "rounds", None),
            "max_samples": getattr(args, "max_samples", None),
            "channels": getattr(args, "channels", None),
            "fetch_data": getattr(args, "fetch_data", None),
            "contention": getattr(args, "contention", None),
            "dry_run": getattr(args, "dry_run", None),
        }
        if args
        else {},
        "summary": {"total_ok": total_ok, "total_fail": total_fail},
        "devices": devices_report,
    }


def render_text(report: dict) -> str:
    lines = [
        f"=== Load test report: {report['target']} ({report['mode']}) ===",
        f"generated_at={report['generated_at']}  wall_clock={report['wall_clock_seconds']}s",
    ]
    for device_id, dev in report["devices"].items():
        lines.append(f"\n{device_id}")
        for phase, entry in dev["phases"].items():
            s = entry["seconds"]
            lines.append(
                f"  {phase:<10} n={entry['n']:<3} ok={entry['ok']:<3} fail={entry['fail']:<3} "
                f"mean={s.get('mean', 0):.3f}s median={s.get('median', 0):.3f}s stdev={s.get('stdev', 0):.3f}s "
                f"p90={s.get('p90', 0):.3f}s p95={s.get('p95', 0):.3f}s p99={s.get('p99', 0):.3f}s max={s.get('max', 0):.3f}s"
            )
            if "throughput" in entry:
                tp = entry["throughput"]
                lines.append(
                    f"    throughput: {tp['total_samples']} samples / {tp['total_bytes']} bytes total, "
                    f"{tp['samples_per_sec_mean']:.1f} samples/s (mean per request), "
                    f"{tp['aggregate_samples_per_sec']:.1f} samples/s (aggregate), "
                    f"{tp['aggregate_kb_per_sec']:.2f} KB/s (aggregate)"
                )
            for f in entry["failures"]:
                lines.append(f"    FAIL round={f['round']} {f['detail']}")
    lines.append(
        f"\nTotal: {report['summary']['total_ok']} ok, {report['summary']['total_fail']} failed"
    )
    return "\n".join(lines)


def render_json(report: dict) -> str:
    return json.dumps(report, indent=2)


def render_csv(report: dict) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        ["device_id", "phase", "round", "ok", "seconds", "samples", "bytes", "detail"]
    )
    for device_id, dev in report["devices"].items():
        for row in dev["raw"]:
            writer.writerow(
                [
                    device_id,
                    row["phase"],
                    row["round"],
                    row["ok"],
                    row["seconds"],
                    row["samples"] if row["samples"] is not None else "",
                    row["bytes"] if row["bytes"] is not None else "",
                    row["detail"],
                ]
            )
    return buf.getvalue()


FORMATTERS = {"text": render_text, "json": render_json, "csv": render_csv}


def emit_report(report: dict, args: argparse.Namespace | None) -> None:
    fmt = getattr(args, "format", "text") if args else "text"
    rendered = FORMATTERS[fmt](report)
    print(rendered)
    out_path = getattr(args, "output", None) if args else None
    if out_path:
        with open(out_path, "w") as f:
            f.write(rendered)
            if not rendered.endswith("\n"):
                f.write("\n")
        log(f"Report also written to {out_path}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--base-url", default=os.environ.get("OSC_BASE_URL", "http://localhost:8000")
    )
    parser.add_argument("--token", default=os.environ.get("OSC_TOKEN"))
    parser.add_argument(
        "--token2",
        default=os.environ.get("OSC_TOKEN2"),
        help="second identity for --contention",
    )
    parser.add_argument(
        "--devices", help="comma-separated device IDs (default: all from GET /devices)"
    )
    parser.add_argument(
        "--rounds", type=int, default=1, help="acquire cycles per device"
    )
    parser.add_argument(
        "--channels", type=int, nargs="+", help="restrict to these channel numbers"
    )
    parser.add_argument(
        "--no-max-samples", dest="max_samples", action="store_false", default=True
    )
    parser.add_argument(
        "--fetch-data",
        action="store_true",
        help="also GET channel JSON data after each acquire",
    )
    parser.add_argument(
        "--stagger", type=float, default=0.0, help="seconds between a device's rounds"
    )
    parser.add_argument(
        "--contention",
        type=int,
        default=0,
        help="simulate N racing lock attempts per device instead of the acquire load test",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="only run /probe on each device; no locking or acquisition",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=150.0,
        help="per-request HTTP timeout in seconds",
    )
    parser.add_argument(
        "--format",
        choices=["text", "json", "csv"],
        default="text",
        help="stdout report format (default: text)",
    )
    parser.add_argument("--output", help="also write the rendered report to this file")
    parser.add_argument(
        "-y", "--yes", action="store_true", help="skip the confirmation prompt"
    )
    return parser.parse_args()


async def main() -> int:
    global ARGS, MODE, START_TIME
    args = parse_args()
    ARGS = args
    if not args.token:
        print("error: --token or OSC_TOKEN is required", file=sys.stderr)
        return 2

    headers_a = {"Authorization": f"Bearer {args.token}"}
    async with httpx.AsyncClient(headers=headers_a, timeout=args.timeout) as client_a:
        if args.devices:
            device_ids = [d.strip() for d in args.devices.split(",") if d.strip()]
        else:
            devices = await list_devices(client_a, args.base_url)
            device_ids = [d["id"] for d in devices]

        if not device_ids:
            print("error: no devices to test", file=sys.stderr)
            return 2

        MODE = (
            "dry-run probe"
            if args.dry_run
            else ("lock contention" if args.contention else "full acquire load test")
        )
        log(f"Target: {args.base_url}")
        log(f"Devices ({len(device_ids)}): {', '.join(device_ids)}")
        log(f"Mode: {MODE}")
        if not args.dry_run and not args.contention:
            log(
                f"Rounds: {args.rounds}  max_samples: {args.max_samples}  fetch_data: {args.fetch_data}"
            )
            log(
                "This will lock and acquire from REAL hardware. Up to ~120s per acquire call."
            )
        if not args.dry_run and args.contention:
            log(f"Racing lock attempts per device: {args.contention}")

        if not args.yes:
            if not sys.stdin.isatty():
                print(
                    "error: refusing to run against real hardware without --yes in a non-interactive shell",
                    file=sys.stderr,
                )
                return 2
            sys.stderr.write("Proceed? [y/N] ")
            sys.stderr.flush()
            reply = input().strip().lower()
            if reply != "y":
                log("Aborted.")
                return 1

        client_b = None
        if args.contention and args.token2:
            client_b = httpx.AsyncClient(
                headers={"Authorization": f"Bearer {args.token2}"}, timeout=args.timeout
            )

        START_TIME = time.monotonic()
        try:
            if args.dry_run:
                tasks = [run_probe(client_a, args.base_url, d) for d in device_ids]
            elif args.contention:
                tasks = [
                    run_contention(
                        client_a, client_b, args.base_url, d, args.contention
                    )
                    for d in device_ids
                ]
            else:
                tasks = [
                    run_device(client_a, args.base_url, d, args) for d in device_ids
                ]

            await asyncio.gather(*tasks)
        finally:
            if client_b:
                await client_b.aclose()

        wall_dt = time.monotonic() - START_TIME
        log(f"Wall clock: {wall_dt:.2f}s")
        report = build_report(args, args.base_url, MODE, wall_dt)
        emit_report(report, args)
        return 1 if report["summary"]["total_fail"] else 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        wall_dt = time.monotonic() - START_TIME if START_TIME else 0.0
        log(
            "\nInterrupted — any locks this script held have been released by its finally blocks."
        )
        report = build_report(
            ARGS, ARGS.base_url if ARGS else "?", f"{MODE} (interrupted)", wall_dt
        )
        emit_report(report, ARGS)
        sys.exit(130)
