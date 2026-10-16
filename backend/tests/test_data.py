from __future__ import annotations

from datetime import datetime, timezone

from backend.app import data
from backend.app.models import MaintenanceRecord, ManualSection, Person

MANUAL_IDS = [
    "P101-OV-01", "P101-TS-01", "P101-TS-02", "P101-TS-03", "P101-TS-04", "P101-TS-05", "P101-TS-06",
    "P101-PR-01", "P101-PR-02", "P101-PR-03", "P101-PR-04", "P101-PR-05", "P101-SAF-01",
]
KEY_RECORDS = ["WO-2025-0871", "WO-2025-1104", "WO-2026-0153", "WO-2026-0418", "PM-2026-0702", "WO-2026-0901"]


def test_roster():
    people = data.roster()
    assert len(people) == 12
    assert all(isinstance(p, Person) and not p.on_shift for p in people)
    assert people[0].id == "tech-a1" and people[0].name == "Sara Benali"


def test_maintenance_validates_and_is_newest_first():
    records = data.maintenance("P-101")
    assert all(isinstance(r, MaintenanceRecord) for r in records)
    assert set(KEY_RECORDS) <= {r.id for r in records}
    dates = [r.date for r in records]
    assert dates == sorted(dates, reverse=True)
    assert data.maintenance("X-999") == []


def test_corrective_last_12m():
    assert data.corrective_last_12m("P-101", datetime(2026, 10, 15, tzinfo=timezone.utc)) == 3


def test_parts_and_part():
    assert len(data.parts()) == 12
    assert {p["part_no"] for p in data.parts("C-201")} == {"FLT-AIR-C201", "OIL-SEP-C201"}
    assert all("P-101" in p["fits"] for p in data.parts("P-101"))
    assert data.part("BRG-6309-C3")["in_stock"] == 2
    assert data.part("NOPE") is None


def test_manual_sections():
    sections = data.manual_sections()
    assert list(sections) == MANUAL_IDS
    assert all(isinstance(s, ManualSection) and s.text for s in sections.values())
    assert sections["P101-TS-01"].title == "Troubleshooting: bearing wear"
    assert not sections["P101-TS-01"].text.startswith("## [")


def test_catalog():
    cat = data.catalog()
    assert set(cat) == {"assumptions", "repair_estimates", "candidates"}
    assert [c["id"] for c in cat["candidates"]] == ["AF-CP80-G2", "HX-NB100", "VT-ECO75"]


def test_results_are_copies():
    data.maintenance("P-101")[0].title = "changed"
    data.parts()[0]["in_stock"] = 999
    data.catalog()["assumptions"]["energy_eur_per_kwh"] = 9
    assert data.maintenance("P-101")[0].title != "changed"
    assert data.parts()[0]["in_stock"] != 999
    assert data.catalog()["assumptions"]["energy_eur_per_kwh"] == 0.18
