#!/usr/bin/env python3
"""
Hardware smoke test: exercises every API endpoint against a single device and
prints a PASS / FAIL summary. Useful when integrating a new driver class.

Usage:
    python scripts/smoke_test_hardware.py \\
        --base-url http://127.0.0.1:8000 \\
        --token $OPENBIS_TOKEN \\
        --device scope-01
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import httpx


@dataclass
class Result:
    label: str
    passed: bool
    detail: str = ""


class SmokeTester:
    def __init__(self, base_url: str, token: str, device_id: str) -> None:
        self.base = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {token}"}
        self.device_id = device_id
        self.results: list[Result] = []
        self.session_id: str | None = None
        self.artifact_ids: list[str] = []
        self.acquisition_id: str | None = None

    # ------------------------------------------------------------------
    def _check(
        self,
        label: str,
        method: str,
        path: str,
        *,
        expected_status: int = 200,
        params: dict | None = None,
        json_body: Any = None,
        timeout: float = 120.0,
    ) -> dict | bytes | None:
        url = f"{self.base}{path}"
        try:
            resp = httpx.request(
                method,
                url,
                headers=self.headers,
                params=params,
                json=json_body,
                timeout=timeout,
            )
            if resp.status_code == expected_status:
                self.results.append(Result(label, True))
                ct = resp.headers.get("content-type", "")
                if "application/json" in ct:
                    return resp.json()
                return resp.content
            else:
                self.results.append(
                    Result(label, False, f"HTTP {resp.status_code}: {resp.text[:120]}")
                )
        except Exception as exc:
            self.results.append(Result(label, False, str(exc)))
        return None

    # ------------------------------------------------------------------
    def run(self) -> None:
        dev = self.device_id

        print(f"\nSmoke testing {self.base} — device: {dev}\n{'─' * 60}")

        # Health
        self._check("GET /health", "GET", "/health")

        # Auth
        self._check("GET /auth/me", "GET", "/auth/me")

        # Devices
        self._check("GET /devices", "GET", "/devices")
        self._check("GET /devices/{id}", "GET", f"/devices/{dev}")
        self._check(
            "GET /devices/{id}/probe", "GET", f"/devices/{dev}/probe", timeout=30.0
        )
        self._check("GET /devices/{id}/settings", "GET", f"/devices/{dev}/settings")

        # Lock
        lock_data = self._check(
            "POST /devices/{id}/lock", "POST", f"/devices/{dev}/lock"
        )
        if lock_data and isinstance(lock_data, dict):
            self.session_id = lock_data.get("control_session_id")
        if not self.session_id:
            print("\n[FATAL] Could not acquire lock — aborting device command tests.")
            self._print_summary()
            sys.exit(1)

        sid_params = {"session_id": self.session_id}

        # Heartbeat
        self._check(
            "POST /devices/{id}/heartbeat",
            "POST",
            f"/devices/{dev}/heartbeat",
            params=sid_params,
        )

        # Channel config
        self._check(
            "PUT /devices/{id}/channels/1/config",
            "PUT",
            f"/devices/{dev}/channels/1/config",
            params=sid_params,
            json_body={
                "enabled": True,
                "scale_v_div": 1.0,
                "offset_v": 0.0,
                "coupling": "DC",
                "probe_attenuation": 10.0,
            },
        )

        # Timebase
        self._check(
            "PUT /devices/{id}/timebase",
            "PUT",
            f"/devices/{dev}/timebase",
            params=sid_params,
            json_body={"scale_s_div": 1e-3, "offset_s": 0.0},
        )

        # Trigger
        self._check(
            "PUT /devices/{id}/trigger",
            "PUT",
            f"/devices/{dev}/trigger",
            params=sid_params,
            json_body={
                "source": "CH1",
                "level_v": 0.5,
                "slope": "RISING",
                "mode": "EDGE",
            },
        )

        # Run / stop
        self._check(
            "POST /devices/{id}/run", "POST", f"/devices/{dev}/run", params=sid_params
        )
        time.sleep(0.5)
        self._check(
            "POST /devices/{id}/stop", "POST", f"/devices/{dev}/stop", params=sid_params
        )

        # Acquire
        acq_data = self._check(
            "POST /devices/{id}/acquire",
            "POST",
            f"/devices/{dev}/acquire",
            params=sid_params,
            json_body={"max_samples": False},
            timeout=120.0,
        )
        if acq_data and isinstance(acq_data, dict):
            self.artifact_ids = acq_data.get("artifact_ids", [])
            self.acquisition_id = acq_data.get("acquisition_id")

        # Channel data
        self._check(
            "GET /devices/{id}/channels/1/data",
            "GET",
            f"/devices/{dev}/channels/1/data",
            params=sid_params,
            timeout=30.0,
        )

        # Screenshot (GET)
        self._check(
            "GET /devices/{id}/screenshot",
            "GET",
            f"/devices/{dev}/screenshot",
            params=sid_params,
            timeout=30.0,
        )

        # Screenshot (POST — save)
        ss_data = self._check(
            "POST /devices/{id}/screenshot",
            "POST",
            f"/devices/{dev}/screenshot",
            params=sid_params,
            timeout=30.0,
        )
        if ss_data and isinstance(ss_data, dict):
            self.artifact_ids.append(ss_data.get("artifact_id", ""))

        # Unlock
        self._check(
            "POST /devices/{id}/unlock",
            "POST",
            f"/devices/{dev}/unlock",
            params={"session_id": self.session_id},
        )
        self.session_id = None

        # Session / artifact endpoints (use acquired session)
        if self.artifact_ids:
            # Re-derive session_id from artifact path: buffer/<device>/<session>/...
            # We can get it from GET /devices listing instead
            pass

        # Admin endpoints
        self._check(
            "POST /admin/locks/reset",
            "POST",
            "/admin/locks/reset",
        )
        self._check(
            "POST /admin/devices/{id}/force-unlock",
            "POST",
            f"/admin/devices/{dev}/force-unlock",
        )
        self._check(
            "POST /admin/devices/{id}/keyboard-lock (lock)",
            "POST",
            f"/admin/devices/{dev}/keyboard-lock",
            params={"locked": "true"},
        )
        self._check(
            "POST /admin/devices/{id}/keyboard-lock (unlock)",
            "POST",
            f"/admin/devices/{dev}/keyboard-lock",
            params={"locked": "false"},
        )

        self._print_summary()

    def _print_summary(self) -> None:
        passed = sum(1 for r in self.results if r.passed)
        failed = sum(1 for r in self.results if not r.passed)
        print()
        for r in self.results:
            icon = "✓" if r.passed else "✗"
            detail = f"  — {r.detail}" if r.detail else ""
            print(f"  {icon}  {r.label}{detail}")
        print(f"\n{'─' * 60}")
        print(f"  {passed} passed, {failed} failed out of {len(self.results)} checks")
        if failed:
            print("\nSome checks FAILED. Fix the issues above before deploying.")
            sys.exit(1)
        else:
            print("\nAll checks passed.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Hardware smoke test for openbis-oscilloscope"
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:8000",
        help="FastAPI base URL (default: http://127.0.0.1:8000)",
    )
    parser.add_argument(
        "--token",
        required=True,
        help="OpenBIS session token (or debug-token in DEBUG mode)",
    )
    parser.add_argument(
        "--device",
        default="scope-01",
        help="Device ID to test (must be registered in oscilloscopes.yaml)",
    )
    args = parser.parse_args()
    SmokeTester(args.base_url, args.token, args.device).run()


if __name__ == "__main__":
    main()
