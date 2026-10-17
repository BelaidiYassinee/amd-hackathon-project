from __future__ import annotations

from datetime import datetime, timezone

import pytest

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


TS_SUBHEADINGS = ["**Symptoms**", "**Typical progression**", "**Likely causes**", "**What to do**",
                  "**Parts**", "**Category**", "**Do not confuse with**"]
PUMP_SIGNALS = ["vibration_rms", "vibration_hf", "bearing_temp", "motor_temp", "motor_current",
                "discharge_pressure", "flow"]

# 04 brief, Task 1c: the six key P-101 records, field by field
KEY_DETAILS = {
    "WO-2025-0871": (["BRG-6309-C3", "GREASE-EP2"], 1850, 7, "tech-a1"),
    "WO-2025-1104": (["CPL-ELEM-80"], 620, 3, "tech-b1"),
    "WO-2026-0153": (["SEAL-M80"], 1240, 6, "tech-a1"),
    "WO-2026-0418": (["SHIM-KIT-80"], 780, 4, "tech-c1"),
    "PM-2026-0702": ([], 0, 0, None),
    "WO-2026-0901": ([], 120, 0, "tech-a1"),
}


def test_manual_format():
    raw = data.MANUAL_FILE.read_text(encoding="utf-8")
    assert raw.count("## [") == 13
    for s in data.manual_sections().values():
        words = len(s.text.split())
        assert 120 <= words <= 300, f"{s.id} has {words} words"
        assert "TODO" not in s.text


def test_troubleshooting_sections_use_the_same_subheadings():
    for sid, s in data.manual_sections().items():
        if "-TS-" in sid:
            positions = [s.text.find(h) for h in TS_SUBHEADINGS]
            assert -1 not in positions, f"{sid} misses a sub-heading"
            assert positions == sorted(positions), f"{sid} sub-headings out of order"


def test_manual_refs_and_parts_exist():
    import re
    sections = data.manual_sections()
    known_parts = {p["part_no"] for p in data.parts()}
    raw = data.MANUAL_FILE.read_text(encoding="utf-8")
    assert set(re.findall(r"\bP101-[A-Z]+-\d\d\b", raw)) <= set(sections)
    for code in re.findall(r"`([A-Z][A-Z0-9]*-[A-Z0-9-]+)`", raw):
        assert code in known_parts, code
    for signal in PUMP_SIGNALS:
        assert f"`{signal}`" in sections["P101-OV-01"].text


@pytest.mark.parametrize("query, expected", [
    ("bearing wear", "P101-TS-01"), ("cavitation", "P101-TS-02"), ("misalignment", "P101-TS-03"),
    ("motor_overheat", "P101-TS-04"), ("impeller imbalance", "P101-TS-05"), ("seal leak", "P101-TS-06"),
])
def test_fault_name_finds_its_troubleshooting_section(query, expected):
    from backend.app.agent import tools
    assert tools.search_manual(None, query)[0]["section_id"] == expected


def test_prefetch_gets_every_troubleshooting_section_in_full():
    """Prefetch mode passes get_manual_sections(kinds=["TS"]) to the LLM: every fault's section, uncut."""
    from backend.app.agent import tools
    sections = {s["section_id"]: s for s in tools.get_manual_sections(None, ["TS"])}
    assert list(sections) == [sid for sid in MANUAL_IDS if "-TS-" in sid]
    for sid in ("P101-TS-01", "P101-TS-02", "P101-TS-03", "P101-TS-04"):   # the four simulated faults
        assert sections[sid]["text"] == data.manual_sections()[sid].text
    for sid in ("P101-TS-01", "P101-TS-03", "P101-TS-04"):
        assert "**Key rule:**" in sections[sid]["text"]


def test_key_rules_survive_the_search_cut():
    """Tools mode still uses search_manual, which sends only the first 1200 characters of a section."""
    for sid in ("P101-TS-01", "P101-TS-03", "P101-TS-04"):
        text = data.manual_sections()[sid].text
        start = text.find("**Key rule:**")
        assert 0 <= start and text.find("\n", start) <= 1200, sid


def test_key_records_match_the_brief():
    by_id = {r.id: r for r in data.maintenance("P-101")}
    for rid, (parts, cost, downtime, tech) in KEY_DETAILS.items():
        r = by_id[rid]
        assert (r.parts, r.cost_eur, r.downtime_h, r.technician_id) == (parts, cost, downtime, tech), rid


def test_history_ids_people_and_parts_are_valid():
    import re
    records = [r for m in ("P-101", "P-102", "C-201", "M-301") for r in data.maintenance(m)]
    ids = [r.id for r in records]
    assert len(ids) == len(set(ids)) == len(data._maintenance())
    assert all(re.fullmatch(r"(WO|PM)-\d{4}-\d{4}", i) for i in ids)
    assert not any("WO-2026-0412" <= i <= "WO-2026-0417" for i in ids)  # kept free for live work orders
    people = {p.id for p in data.roster()}
    known_parts = {p["part_no"] for p in data.parts()}
    for r in records:
        assert r.technician_id is None or r.technician_id in people, r.id
        assert set(r.parts) <= known_parts, r.id
        assert r.date <= "2026-10-15", r.id
    for m in ("P-102", "C-201", "M-301"):
        assert 3 <= len(data.maintenance(m)) <= 5, m


def test_results_are_copies():
    data.maintenance("P-101")[0].title = "changed"
    data.parts()[0]["in_stock"] = 999
    data.catalog()["assumptions"]["energy_eur_per_kwh"] = 9
    assert data.maintenance("P-101")[0].title != "changed"
    assert data.parts()[0]["in_stock"] != 999
    assert data.catalog()["assumptions"]["energy_eur_per_kwh"] == 0.18
