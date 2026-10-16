"""Tests for eval/diagnosis_eval.py on the fake engine (stubbed diagnose, then mock mode end-to-end).
Run: python -m pytest backend/tests/test_diagnosis_eval.py -q
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import pytest

from backend.app.agent.diagnose import DiagnosisResult
from backend.app.models import Contribution, Diagnosis, LlmCall, TraceStep
from eval import diagnosis_eval as de
from backend.tests.fake_engine import FakeEngine, fake_event


@dataclass
class Scenario:  # the fields of P1's Scenario that the eval reads
    id: str
    fault: str | None


@dataclass
class ScenarioRun:
    scenario: Scenario
    event: object
    engine_at_event: object


def _c(signal, score, direction="up"):
    return Contribution(signal=signal, score=score, z=score * 2, slope_per_h=0.1 if direction == "up" else -0.1,
                        direction=direction)


EVENTS = {  # contribution patterns that match each fault's signature
    "bearing_wear": fake_event().contributions,
    "cavitation": [_c("discharge_pressure", 2.0, "down"), _c("flow", 1.8, "down"), _c("vibration_rms", 0.9)],
    "misalignment": [_c("vibration_rms", 2.0), _c("bearing_temp", 1.2), _c("motor_current", 0.8)],
    "motor_overheat": [_c("motor_temp", 2.0), _c("motor_current", 1.4), _c("vibration_rms", 0.2)],
}


def make_run(sid, fault, pattern=None, with_event=True):
    ev = fake_event().model_copy(update={"contributions": EVENTS[pattern or fault]}) if with_event else None
    return ScenarioRun(Scenario(sid, fault), ev, FakeEngine())


def stub_result(fault, verified=True, fallback=False, latencies=(1000, 2000)):
    d = Diagnosis(fault=fault, fault_label=fault, confidence=0.8, summary=f"looks like {fault}", evidence=[],
                  severity="medium", action="schedule_repair", category="mechanical", fix_steps=[],
                  verified=verified)
    calls = [LlmCall(id=f"llm-{i}", at=datetime.now(timezone.utc), purpose="eval", model="m", endpoint="e",
                     latency_ms=ms, prompt_tokens=1000, completion_tokens=100, tokens_per_s=50.0, ok=True)
             for i, ms in enumerate(latencies)]
    trace = [TraceStep(i=i + 1, kind="llm", name="chat.completions", latency_ms=ms) for i, ms in enumerate(latencies)]
    return DiagnosisResult(diagnosis=d, trace=trace, calls=calls, used_fallback=fallback, error=None)


def test_metrics(monkeypatch):
    predictions = {"b1": "bearing_wear", "b2": "misalignment", "c1": "cavitation", "m1": "other"}
    monkeypatch.setattr(de, "diagnose", lambda engine, event, purpose: (
        stub_result(predictions[event.id], verified=event.id != "b2", fallback=event.id == "m1")))
    runs = []
    for sid, fault in [("b1", "bearing_wear"), ("b2", "bearing_wear"), ("c1", "cavitation"), ("m1", "misalignment")]:
        r = make_run(sid, fault)
        r.event = r.event.model_copy(update={"id": sid})
        runs.append(r)
    runs += [make_run("healthy-01", None, pattern="bearing_wear"),           # false alarm: not scored here
             make_run("motor-01", "motor_overheat", with_event=False)]       # missed detection
    res = de.evaluate(runs, workers=2)

    assert res["n"] == 4 and res["skipped_no_event"] == 1
    assert res["accuracy"] == 0.5 and res["verified_rate"] == 0.75 and res["fallback_count"] == 1
    assert res["per_fault"]["bearing_wear"] == {"n": 2, "correct": 1, "accuracy": 0.5}
    assert res["per_fault"]["motor_overheat"]["accuracy"] is None
    assert res["confusion"]["bearing_wear"]["misalignment"] == 1 and res["confusion"]["misalignment"]["other"] == 1
    assert res["avg_latency_ms"] == 3000 and res["median_latency_ms"] == 3000
    assert res["avg_llm_calls"] == 2 and res["avg_prompt_tokens"] == 2000 and res["avg_tokens_per_s"] == 50
    assert {m["id"] for m in res["misdiagnosed"]} == {"b2", "m1"}
    assert res["misdiagnosed"][0]["summary"].startswith("looks like")


def test_diagnose_crash_is_recorded(monkeypatch):
    def boom(engine, event, purpose):
        raise RuntimeError("bug")
    monkeypatch.setattr(de, "diagnose", boom)
    res = de.evaluate([make_run("b1", "bearing_wear")], workers=1)
    assert res["accuracy"] == 0.0 and res["runs"][0]["error"] == "RuntimeError: bug"


def test_mock_mode_end_to_end(monkeypatch):
    """No network: every diagnosis is the rule-based fallback, which matches each signature."""
    monkeypatch.setenv("LLM_MOCK", "1")
    runs = [make_run(f"{f}-{i:02d}", f) for f in de.FAULTS for i in range(2)]
    res = de.evaluate(runs, workers=4)
    assert res["n"] == 8 and res["accuracy"] == 1.0 and res["fallback_count"] == 8
    assert res["verified_rate"] == 1.0 and res["avg_llm_calls"] == 0
    assert res["settings"]["mock"] is True
    assert all(res["confusion"][f][f] == 2 for f in de.FAULTS)


def test_markdown(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "1")
    md = de.markdown(de.evaluate([make_run("c1", "cavitation"), make_run("m1", "misalignment", "bearing_wear")]))
    assert "| Top-1 accuracy | 50% |" in md and "MOCK" in md
    assert "| cavitation | 0 | 1 | 0 | 0 | 0 | 100% |" in md
    assert "| motor_overheat | 0 | 0 | 0 | 0 | 0 | n/a |" in md
    assert "- `m1`: predicted `bearing_wear`" in md
