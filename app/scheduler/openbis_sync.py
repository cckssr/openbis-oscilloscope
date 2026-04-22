"""End-of-day job: sync oscilloscope inventory from OpenBIS EQUIPMENT objects."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml
from pybis import Openbis

logger = logging.getLogger(__name__)


def _load_yaml(path: str) -> dict:
    p = Path(path)
    if not p.exists():
        logger.warning("YAML file not found: %s", path)
        return {}
    with p.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _ip_matches_filter(ip: str, pattern: str) -> bool:
    """Return True if *ip* matches *pattern*, supporting a trailing ``.*`` wildcard."""
    if pattern.endswith(".*"):
        return ip.startswith(pattern[:-1])  # "141.23.109." prefix check
    return ip == pattern


def _build_entry(
    barcode: str, ip: str, company: str, alt_name: str, driver: str, port: int
) -> dict[str, Any]:
    return {
        "id": barcode,
        "ip": ip,
        "port": port,
        "label": f"{company} {alt_name}".strip(),
        "driver": driver,
    }


def _save_oscilloscopes_yaml(path: str, data: dict) -> None:
    """Write atomically: write to .yaml.tmp then rename over destination."""
    p = Path(path)
    tmp = p.with_suffix(".yaml.tmp")
    with tmp.open("w", encoding="utf-8") as f:
        yaml.dump(
            data, f, default_flow_style=False, allow_unicode=True, sort_keys=False
        )
    tmp.replace(p)


async def sync_oscilloscopes_from_openbis(settings) -> None:
    """Query OpenBIS EQUIPMENT objects and update ``oscilloscopes.yaml``.

    Skips silently when ``OPENBIS_BOT_USER`` is not set (development mode).
    All exceptions are caught so a transient failure never silences future runs.
    Changes to the YAML take effect on the next service restart.
    """
    if not settings.OPENBIS_BOT_USER or not settings.OPENBIS_BOT_PASSWORD:
        logger.debug(
            "OpenBIS sync skipped: OPENBIS_BOT_USER / OPENBIS_BOT_PASSWORD not set"
        )
        return

    try:
        await _run_sync(settings)
    except Exception:
        logger.exception("OpenBIS oscilloscope sync failed")


async def _run_sync(settings) -> None:
    mapping_raw = _load_yaml(settings.DRIVER_MAPPING_CONFIG)
    driver_mapping: dict[str, dict] = mapping_raw.get("driver_mapping", {})
    if not driver_mapping:
        logger.warning(
            "Driver mapping is empty or missing (%s); skipping sync",
            settings.DRIVER_MAPPING_CONFIG,
        )
        return

    o = Openbis(settings.OPENBIS_URL, verify_certificates=True)
    try:
        o.login(settings.OPENBIS_BOT_USER, settings.OPENBIS_BOT_PASSWORD)
        logger.debug("OpenBIS sync: logged in as %s", settings.OPENBIS_BOT_USER)
    except Exception as exc:
        logger.error("OpenBIS sync: login failed: %s", exc)
        return

    try:
        try:
            result_df = o.get_objects(
                type="EQUIPMENT",
                where={
                    "EQUIPMENT.IP_ADDRESS": settings.OPENBIS_EQUIPMENT_IP_FILTER,
                    "EQUIPMENT.TYPE": 6210,
                },
                props=[
                    "$NAME",
                    "$BARCODE",
                    "EQUIPMENT.COMPANY",
                    "EQUIPMENT.ALTERNATIV_NAME",
                    "EQUIPMENT.IP_ADDRESS",
                ],
            ).df
        except Exception as exc:
            logger.error("OpenBIS sync: get_objects failed: %s", exc)
            return

        if result_df is None or result_df.empty:
            logger.info("OpenBIS sync: no EQUIPMENT objects returned")
            return

        logger.debug("OpenBIS sync: received %d equipment rows", len(result_df))

        oscillo_raw = _load_yaml(settings.OSCILLOSCOPES_CONFIG)
        existing_list: list[dict] = oscillo_raw.get("oscilloscopes", [])
        existing_by_id: dict[str, dict] = {e["id"]: e for e in existing_list}

        added: list[str] = []
        updated: list[str] = []

        for _, row in result_df.iterrows():
            barcode = str(row.get("$BARCODE") or "").strip()
            alt_name = str(row.get("EQUIPMENT.ALTERNATIV_NAME") or "").strip()
            ip = str(row.get("EQUIPMENT.IP_ADDRESS") or "").strip()
            company = str(row.get("EQUIPMENT.COMPANY") or "").strip()

            if not barcode:
                logger.debug("OpenBIS sync: skipping row with empty $BARCODE")
                continue

            if not _ip_matches_filter(ip, settings.OPENBIS_EQUIPMENT_IP_FILTER):
                logger.debug(
                    "OpenBIS sync: skipping %s — IP %s does not match filter %s",
                    barcode,
                    ip,
                    settings.OPENBIS_EQUIPMENT_IP_FILTER,
                )
                continue

            if alt_name not in driver_mapping:
                logger.debug(
                    "OpenBIS sync: skipping %s — no driver mapping for '%s'",
                    barcode,
                    alt_name,
                )
                continue

            mapping = driver_mapping[alt_name]
            driver = mapping["driver"]
            port = int(mapping["port"])
            label = f"{company} {alt_name}".strip()

            if barcode not in existing_by_id:
                new_entry = _build_entry(barcode, ip, company, alt_name, driver, port)
                existing_list.append(new_entry)
                existing_by_id[barcode] = new_entry
                added.append(barcode)
                logger.info("OpenBIS sync: added %s (%s) at %s", barcode, label, ip)
            else:
                entry = existing_by_id[barcode]
                field_changes: list[str] = []
                for field, new_val in [
                    ("ip", ip),
                    ("label", label),
                    ("driver", driver),
                    ("port", port),
                ]:
                    if entry.get(field) != new_val:
                        logger.info(
                            "OpenBIS sync: updated %s.%s: %r → %r",
                            barcode,
                            field,
                            entry.get(field),
                            new_val,
                        )
                        entry[field] = new_val
                        field_changes.append(field)
                if field_changes:
                    updated.append(barcode)

        if added or updated:
            oscillo_raw["oscilloscopes"] = existing_list
            _save_oscilloscopes_yaml(settings.OSCILLOSCOPES_CONFIG, oscillo_raw)
            logger.info(
                "OpenBIS sync complete: %d added, %d updated", len(added), len(updated)
            )
        else:
            logger.info("OpenBIS sync complete: no changes")

    finally:
        try:
            o.logout()
            logger.debug("OpenBIS sync: logged out")
        except Exception:
            logger.debug("OpenBIS sync: logout failed (session may have expired)")
