"""Loaders for the plant reference data in backend/data/.

Files are read once and cached. The public functions return fresh lists, so
callers can't change the cached data by accident.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

from backend.app.models import MaintenanceRecord, ManualSection, Person

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
MANUAL_FILE = DATA_DIR / "manuals" / "pump_p101.md"

_HEADING = re.compile(r"^## \[([A-Z0-9-]+)\]\s+(.+)$")


def _load_json(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


# ---------- roster ----------
@lru_cache
def _roster() -> tuple[Person, ...]:
    return tuple(Person.model_validate(p) for p in _load_json("roster.json"))


def roster() -> list[Person]:
    """Everyone on the roster. on_shift is always False here; routing computes it."""
    return [p.model_copy() for p in _roster()]


# ---------- maintenance history ----------
@lru_cache
def _maintenance() -> tuple[MaintenanceRecord, ...]:
    records = [MaintenanceRecord.model_validate(r) for r in _load_json("maintenance_log.json")]
    records.sort(key=lambda r: (r.date, r.id), reverse=True)
    return tuple(records)


def maintenance(machine_id: str) -> list[MaintenanceRecord]:
    """Records for one machine, newest first."""
    return [r.model_copy() for r in _maintenance() if r.machine_id == machine_id]


def corrective_last_12m(machine_id: str, now: datetime) -> int:
    """Number of corrective repairs in the 365 days before `now`."""
    cutoff = (now.date() - timedelta(days=365)).isoformat()
    return sum(1 for r in _maintenance()
               if r.machine_id == machine_id and r.type == "corrective" and r.date > cutoff)


# ---------- spare parts ----------
@lru_cache
def _parts() -> tuple[dict, ...]:
    return tuple(_load_json("spare_parts.json"))


def parts(machine_id: str | None = None) -> list[dict]:
    """Raw spare-part dicts, optionally only those that fit `machine_id`."""
    return [dict(p) for p in _parts() if machine_id is None or machine_id in p["fits"]]


def part(part_no: str) -> dict | None:
    for p in _parts():
        if p["part_no"] == part_no:
            return dict(p)
    return None


# ---------- manual ----------
@lru_cache
def _manual_sections() -> tuple[ManualSection, ...]:
    sections: list[ManualSection] = []
    current: tuple[str, str] | None = None
    body: list[str] = []

    def flush() -> None:
        if current:
            sections.append(ManualSection(id=current[0], title=current[1].strip(),
                                          text="\n".join(body).strip()))

    for line in MANUAL_FILE.read_text(encoding="utf-8").splitlines():
        m = _HEADING.match(line)
        if m:
            flush()
            current, body = (m.group(1), m.group(2)), []
        else:
            body.append(line)
    flush()
    return tuple(sections)


def manual_sections() -> dict[str, ManualSection]:
    """Manual sections by id, in file order."""
    return {s.id: s.model_copy() for s in _manual_sections()}


# ---------- catalog ----------
@lru_cache
def _catalog() -> str:
    return (DATA_DIR / "catalog.json").read_text(encoding="utf-8")


def catalog() -> dict:
    """Repair-vs-replace inputs (a fresh copy on every call)."""
    return json.loads(_catalog())
