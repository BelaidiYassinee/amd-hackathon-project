"""Tests for agent/tools.py on the fake engine.
Run: python -m pytest backend/tests/test_tools.py -q
"""
from __future__ import annotations

import json
from datetime import timedelta

import pytest

from backend.app.agent import data_shim as data
from backend.app.agent import tools
from backend.tests.fake_engine import CONTRIBUTIONS, FakeEngine, Sample

MANUAL_IS_PLACEHOLDER = all("TODO (P4)" in s.text for s in data.manual_sections().values())


@pytest.fixture(scope="module")
def engine():
    return FakeEngine()


def test_tool_names_match_executor():
    assert [t["function"]["name"] for t in tools.TOOLS] == list(tools._FUNCS)


# ---------- get_sensor_summary ----------
def test_unknown_signal_lists_valid_names(engine):
    r = tools.get_sensor_summary(engine, "P-101", "vibration")
    assert "error" in r and "vibration_hf" in r["valid_signals"] and len(r["valid_signals"]) == 7


def test_load_pct_is_not_a_sensor(engine):
    r = tools.get_sensor_summary(engine, "P-101", "load_pct")
    assert "error" in r and "load_pct" not in r["valid_signals"]


def test_unknown_machine(engine):
    r = tools.get_sensor_summary(engine, "P-999", "flow")
    assert r["valid_machines"] == ["P-101"]


def test_sensor_summary_shape(engine):
    r = tools.get_sensor_summary(engine, "p-101 ", "vibration_hf", hours=24)  # ids are normalized
    assert r["machine_id"] == "P-101" and r["unit"] == "g"
    assert r["baseline_typical"] == 0.3 and r["slope_per_h"] == 0.048 and r["z_latest"] == 3.9
    assert r["deviating_since"] == "2026-10-15T08:55:00Z"
    assert r["projected_hours_to_alarm"] is None  # vibration_hf has no legacy alarm
    assert 24 <= len(r["hourly_means"]) <= 25
    assert r["hourly_means"][-1]["v"] > r["hourly_means"][0]["v"]  # the rise is visible
    assert r["min"] <= r["mean"] <= r["max"]


def test_hours_clamped(engine):
    assert len(tools.get_sensor_summary(engine, "P-101", "flow", hours=500)["hourly_means"]) <= 49
    assert len(tools.get_sensor_summary(engine, "P-101", "flow", hours=0)["hourly_means"]) <= 2
    assert "error" not in tools.get_sensor_summary(engine, "P-101", "flow", hours="abc")


def _rising_engine(signal: str, latest: float, slope: float) -> FakeEngine:
    """Fake engine whose last 3 h of `signal` rise linearly to `latest` at `slope` per hour."""
    e = FakeEngine()
    tail = e._samples[-37:]
    for i, s in enumerate(tail):
        hours_before_end = (len(tail) - 1 - i) / 12
        s.values[signal] = latest - slope * hours_before_end
    contribs = [c.model_copy(update={"slope_per_h": slope} if c.signal == signal else {}) for c in CONTRIBUTIONS]
    e.contributions = lambda machine_id: contribs
    return e


@pytest.mark.parametrize("signal,latest,slope,expected", [
    ("vibration_rms", 5.1, 0.5, 4.0),        # (7.1 - 5.1) / 0.5
    ("flow", 110.0, -2.0, 5.0),              # (110 - 100) / 2, low limit
    ("vibration_rms", 7.5, 0.5, 0.0),        # already beyond the limit
    ("vibration_rms", 5.1, -0.5, None),      # falling away from a high limit
])
def test_projected_hours_to_alarm(signal, latest, slope, expected):
    r = tools.get_sensor_summary(_rising_engine(signal, latest, slope), "P-101", signal, hours=3)
    assert r["latest"] == latest
    assert r["projected_hours_to_alarm"] == expected


# ---------- get_maintenance_history ----------
def test_maintenance_history(engine):
    r = tools.get_maintenance_history(engine, "P-101", limit=4)
    assert r["machine"]["model"] == "AquaFlow CP-80" and r["machine"]["age_years"] == 9.6
    assert r["machine"]["installed"] == "2017-03-14" and r["machine"]["design_life_years"] == 15
    assert r["corrective_last_12m"] == 3
    dates = [x["date"] for x in r["records"]]
    assert len(dates) == 4 and dates == sorted(dates, reverse=True)


# ---------- search_manual ----------
def test_search_manual_shape():
    r = tools.search_manual(None, "bearing replacement procedure", k=99)
    assert len(r) == 5 and {"section_id", "title", "text", "score"} <= set(r[0])
    assert r[0]["score"] >= r[-1]["score"]
    assert "error" in tools.search_manual(None, "  ?? ")


def test_tokenizer_splits_signal_names():
    assert tools.tokenize("Rising vibration_hf (g)!") == ["rising", "vibration_hf", "vibration", "hf", "g"]


@pytest.mark.skipif(MANUAL_IS_PLACEHOLDER, reason="needs P4's real manual text")
@pytest.mark.parametrize("query,first", [
    ("high frequency vibration rising bearing temperature", "P101-TS-01"),
    ("discharge pressure dropping flow falling noise", "P101-TS-02"),
    ("motor temperature current rising vibration normal", "P101-TS-04"),
])
def test_search_manual_ranking(query, first):
    assert tools.search_manual(None, query)[0]["section_id"] == first


# ---------- check_spare_parts ----------
def test_spare_parts_keyword(engine):
    r = tools.check_spare_parts(engine, "P-101", keyword="bearing")
    assert {p["part_no"] for p in r} == {"BRG-6309-C3", "BRG-6308-C3", "GREASE-EP2"}
    assert set(r[0]) == {"part_no", "name", "in_stock", "location", "lead_time_days", "unit_cost_eur"}


def test_spare_parts_no_match_returns_all(engine):
    r = tools.check_spare_parts(engine, "P-101", keyword="turbocharger")
    assert "note" in r and len(r["parts"]) == 9
    assert all("C-201" not in p["part_no"] for p in r["parts"])  # only parts that fit P-101


# ---------- run_tool ----------
def test_run_tool_fills_seen(engine):
    seen: set[str] = set()
    tools.run_tool(engine, "get_sensor_summary", {"machine_id": "P-101", "signal": "vibration_hf"}, seen)
    tools.run_tool(engine, "get_maintenance_history", {"machine_id": "P-101"}, seen)
    tools.run_tool(engine, "search_manual", {"query": "bearing", "k": 2}, seen)
    tools.run_tool(engine, "check_spare_parts", {"machine_id": "P-101", "keyword": "coupling"}, seen)
    assert {"vibration_hf", "WO-2025-0871", "PM-2026-0702", "CPL-ELEM-80"} <= seen
    assert len([s for s in seen if s.startswith("P101-")]) == 2
    assert "BRG-6309-C3" not in seen  # not shown by the coupling search


def test_run_tool_never_raises(engine):
    seen: set[str] = set()
    assert "valid_tools" in tools.run_tool(engine, "delete_plant", {}, seen)
    assert "needs argument" in tools.run_tool(engine, "get_sensor_summary", {"machine_id": "P-101"}, seen)["error"]
    ok = tools.run_tool(engine, "check_spare_parts", {"machine_id": "P-101", "color": "red"}, seen)
    assert isinstance(ok, list)  # unknown extra args are dropped

    class Broken(FakeEngine):
        def samples(self, machine_id, hours=None):
            raise RuntimeError("storage gone")
    r = tools.run_tool(Broken(), "get_sensor_summary", {"machine_id": "P-101", "signal": "flow"}, seen)
    assert "storage gone" in r["error"]


def test_tool_message_truncated():
    text = tools.tool_message_content({"x": "y" * 5000})
    assert len(text) <= tools.MAX_RESULT_CHARS + len("...(truncated)") and text.endswith("(truncated)")
    small = tools.tool_message_content({"a": 1})
    assert json.loads(small) == {"a": 1}


def test_seen_only_counts_what_survives_truncation(engine, monkeypatch):
    monkeypatch.setattr(tools, "MAX_RESULT_CHARS", 400)
    seen: set[str] = set()
    tools.run_tool(engine, "get_maintenance_history", {"machine_id": "P-101"}, seen)
    assert "WO-2026-0901" in seen and "WO-2025-0871" not in seen  # oldest record was cut off
