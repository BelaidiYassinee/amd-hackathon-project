"""Temporary stand-in for P4's backend/app/data.py (same function names and signatures).

Reads backend/data/ directly. As soon as backend/app/data.py exists, its loaders are used
instead (see the bottom of this file). Delete this file once P4's module is on main and
import `backend.app.data` directly.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path

from backend.app.models import MaintenanceRecord, ManualSection

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
_HEADING = re.compile(r"^## \[([A-Z0-9-]+)\]\s+(.+)$", re.M)


def _load_json(name: str):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@lru_cache
def _all_records() -> tuple[MaintenanceRecord, ...]:
    return tuple(MaintenanceRecord.model_validate(r) for r in _load_json("maintenance_log.json"))


def maintenance(machine_id: str) -> list[MaintenanceRecord]:
    """Records of one machine, newest first."""
    recs = [r for r in _all_records() if r.machine_id == machine_id]
    return sorted(recs, key=lambda r: r.date, reverse=True)


def corrective_last_12m(machine_id: str, now: datetime) -> int:
    cutoff = (now.date() - timedelta(days=365)).isoformat()
    return sum(1 for r in maintenance(machine_id) if r.type == "corrective" and r.date > cutoff)


@lru_cache
def _all_parts() -> tuple[dict, ...]:
    return tuple(_load_json("spare_parts.json"))


def parts(machine_id: str | None = None) -> list[dict]:
    return [dict(p) for p in _all_parts() if machine_id is None or machine_id in p["fits"]]


def part(part_no: str) -> dict | None:
    return next((dict(p) for p in _all_parts() if p["part_no"] == part_no), None)


@lru_cache
def manual_sections() -> dict[str, ManualSection]:
    text = (DATA_DIR / "manuals" / "pump_p101.md").read_text(encoding="utf-8")
    heads = list(_HEADING.finditer(text))
    sections = {}
    for i, m in enumerate(heads):
        end = heads[i + 1].start() if i + 1 < len(heads) else len(text)
        sections[m.group(1)] = ManualSection(id=m.group(1), title=m.group(2).strip(), text=text[m.end():end].strip())
    return sections


@lru_cache
def catalog() -> dict:
    return _load_json("catalog.json")


try:  # prefer P4's real loaders once they exist
    from backend.app.data import (  # noqa: F401,F811
        catalog,
        corrective_last_12m,
        maintenance,
        manual_sections,
        part,
        parts,
    )
except ImportError:
    pass
