"""Tests for validate.py, fallback.py and the diagnose() loop (scripted LLM, no network).
Run: python -m pytest backend/tests/test_validate.py -q
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from backend.app.agent import diagnose as dg
from backend.app.agent import fallback, llm, validate
from backend.app.models import Contribution, Diagnosis, LlmCall
from backend.tests.fake_engine import FakeEngine, fake_event


@pytest.fixture(scope="module")
def engine():
    return FakeEngine()


def good_dict(**over) -> dict:
    d = {
        "fault": "bearing_wear", "fault_label": "Drive-end bearing wear", "confidence": 0.82,
        "summary": "HF vibration is rising. It matches bearing wear.",
        "alternatives": [{"fault": "misalignment", "why_less_likely": "RMS is flat."}],
        "evidence": [
            {"kind": "sensor", "ref": "vibration_hf", "detail": "3.9 sigma above baseline."},
            {"kind": "manual", "ref": "P101-TS-01", "detail": "Early bearing wear signature."},
            {"kind": "history", "ref": "PM-2026-0702", "detail": "Re-greasing skipped."},
            {"kind": "parts", "ref": "BRG-6309-C3", "detail": "Bearing in stock."},
        ],
        "severity": "medium", "est_time_to_failure_h": 46, "action": "consider_replacement",
        "category": "mechanical", "fix_steps": ["Lockout/tagout (P101-SAF-01)."],
        "parts": [{"part_no": "BRG-6309-C3", "name": "made-up name", "qty": 1, "in_stock": 99}],
        "safety": ["Wear gloves."],
    }
    d.update(over)
    return d


SEEN = {"vibration_hf", "P101-TS-01", "PM-2026-0702", "BRG-6309-C3"}


# ---------- validate ----------
def test_valid_diagnosis_and_stock_overwrite(engine):
    d = Diagnosis.model_validate(good_dict())
    assert validate.finalize(d, engine, "P-101", SEEN) == []
    assert d.verified and d.validation_errors == []
    assert d.parts[0].in_stock == 2 and d.parts[0].lead_time_days == 3  # from spare_parts.json, not the model
    assert d.parts[0].name.startswith("Deep groove ball bearing 6309")


def test_refs_are_normalized_and_canonicalized(engine):
    ev = good_dict()["evidence"]
    ev[1]["ref"] = " p101-ts-01 "
    ev[2]["ref"] = "pm-2026-0702"
    d = Diagnosis.model_validate(good_dict(evidence=ev))
    assert validate.finalize(d, engine, "P-101", SEEN) == []
    assert [e.ref for e in d.evidence][1:3] == ["P101-TS-01", "PM-2026-0702"]


@pytest.mark.parametrize("kind,ref,needle", [
    ("sensor", "load_pct", "not a sensor"),
    ("sensor", "oil_temp", "not a signal of P-101"),
    ("history", "WO-2099-0001", "not a maintenance record"),
    ("history", "WO-2025-0871", "not in any tool result"),      # real record, but never shown
    ("manual", "P101-TS-99", "no such manual section"),
    ("manual", "P101-TS-03", "did not retrieve"),               # real section, but never retrieved
    ("parts", "XYZ-1", "no such part"),
    ("parts", "FLT-AIR-C201", "does not fit P-101"),
])
def test_bad_refs_reported(engine, kind, ref, needle):
    ev = good_dict()["evidence"] + [{"kind": kind, "ref": ref, "detail": "x"}]
    errors = validate.check(Diagnosis.model_validate(good_dict(evidence=ev)), engine, "P-101", SEEN)
    assert len(errors) == 1 and needle in errors[0]


def test_evidence_minimums(engine):
    ev = [{"kind": "history", "ref": "PM-2026-0702", "detail": "x"}]
    errors = validate.check(Diagnosis.model_validate(good_dict(evidence=ev)), engine, "P-101", SEEN)
    assert any("at least 3" in e for e in errors)
    assert any("sensor" in e for e in errors) and any("manual" in e for e in errors)


def test_bad_part_line(engine):
    d = Diagnosis.model_validate(good_dict(parts=[{"part_no": "OIL-SEP-C201", "name": "x"}]))
    errors = validate.finalize(d, engine, "P-101", SEEN)
    assert errors and not d.verified and d.validation_errors == errors
    assert d.parts[0].in_stock == 1  # stock is still the real one, never the model's


# ---------- parsing ----------
def test_parse_strips_fences_and_think():
    text = "<think>hmm</think>Here:\n```json\n" + json.dumps(good_dict(verified=True)) + "\n```"
    d, errors = dg.parse_diagnosis(text)
    assert errors == [] and d.fault == "bearing_wear" and d.verified is False  # verified is backend-owned


def test_parse_errors_are_readable():
    assert dg.parse_diagnosis("")[1] == ["empty answer; reply with only the JSON object"]
    assert "no JSON object" in dg.parse_diagnosis("I think it is bearing wear")[1][0]
    assert "invalid JSON" in dg.parse_diagnosis("{fault: bearing}")[1][0]
    _, errors = dg.parse_diagnosis(json.dumps(good_dict(fault="bearing wear", confidence=3)))
    assert any(e.startswith("fault:") for e in errors) and any(e.startswith("confidence:") for e in errors)


def test_parse_ignores_text_after_the_json():
    text = "Answer: " + json.dumps(good_dict()) + "\nNote: {see manual} for details."
    d, errors = dg.parse_diagnosis(text)
    assert errors == [] and d.fault == "bearing_wear"


def test_parse_fills_missing_part_name():
    parts = [{"part_no": "BRG-6309-C3", "qty": 1}]
    d, errors = dg.parse_diagnosis(json.dumps(good_dict(parts=parts)))
    assert errors == [] and d.parts[0].name == ""


# ---------- fallback ----------
def _c(signal, score, direction="up"):
    return Contribution(signal=signal, score=score, z=score * 2, slope_per_h=0.1, direction=direction)


@pytest.mark.parametrize("contribs,expected", [
    ([_c("vibration_hf", 2), _c("vibration_rms", 1)], "bearing_wear"),
    ([_c("vibration_rms", 2), _c("flow", 1.5, "down")], "cavitation"),
    ([_c("motor_temp", 2), _c("motor_current", 1), _c("vibration_rms", 0.2)], "motor_overheat"),
    ([_c("motor_temp", 2), _c("vibration_rms", 1.0)], "misalignment"),   # rms too high for overheat
    ([_c("bearing_temp", 2), _c("vibration_rms", 1.8)], "misalignment"),
    ([_c("bearing_temp", 2), _c("motor_current", 1)], "other"),
])
def test_fallback_rules(contribs, expected):
    assert fallback.classify(contribs, 1.5) == expected


def test_fallback_diagnosis(engine):
    d = fallback.rule_based(engine, fake_event())
    assert d.fault == "bearing_wear" and d.fault_label.endswith("(rule-based fallback)")
    assert d.confidence == 0.5 and d.severity == "medium"
    assert d.action == "consider_replacement"  # 3 corrective repairs in 12 months
    assert [e.ref for e in d.evidence] == ["vibration_hf", "vibration_rms", "P101-TS-01", "WO-2026-0418"]
    assert [p.part_no for p in d.parts] == ["BRG-6309-C3", "GREASE-EP2"] and d.parts[1].in_stock == 12
    assert d.verified and d.fix_steps


# ---------- diagnose loop (scripted LLM) ----------
def _call(i: int) -> LlmCall:
    return LlmCall(id=f"llm-{i:04d}", at=datetime.now(timezone.utc), purpose="diagnosis", model="m",
                   endpoint="e", latency_ms=100, prompt_tokens=50, completion_tokens=10, tokens_per_s=100, ok=True)


def tool_turn(*calls):
    tcs = [{"id": f"c{i}", "name": n, "arguments": a} for i, (n, a) in enumerate(calls)]
    raw = {"role": "assistant", "content": "", "tool_calls": [
        {"id": t["id"], "type": "function", "function": {"name": t["name"], "arguments": json.dumps(t["arguments"])}}
        for t in tcs]}
    return lambda i: llm.ChatResult(content=None, tool_calls=tcs, raw_message=raw, call=_call(i))


def answer_turn(text):
    return lambda i: llm.ChatResult(content=text, tool_calls=[], raw_message={"role": "assistant", "content": text},
                                    call=_call(i))


INVESTIGATE = tool_turn(
    ("get_sensor_summary", {"machine_id": "P-101", "signal": "vibration_hf"}),
    ("get_maintenance_history", {"machine_id": "P-101"}),
    ("search_manual", {"query": "bearing wear"}),
    ("check_spare_parts", {"machine_id": "P-101", "keyword": "bearing"}),
)


@pytest.fixture
def script(monkeypatch):
    """Queue of scripted turns; records the kwargs of every chat() call."""
    turns, requests = [], []

    def fake_chat(messages, **kw):
        requests.append({"messages": [dict(m) for m in messages], **kw})
        if not turns:
            raise AssertionError("unexpected extra LLM call")
        item = turns.pop(0)
        if isinstance(item, Exception):
            raise item
        return item(len(requests))

    monkeypatch.setattr(llm, "is_mock", lambda: False)
    monkeypatch.setattr(llm, "chat", fake_chat)
    monkeypatch.setenv("AGENT_MODE", "tools")
    return turns, requests


def test_tools_mode_happy_path(engine, script):
    turns, requests = script
    turns += [INVESTIGATE, answer_turn(json.dumps(good_dict()))]
    steps = []
    res = dg.diagnose(engine, fake_event(), on_step=steps.append)
    assert not res.used_fallback and res.error is None
    assert res.diagnosis.verified and res.diagnosis.parts[0].in_stock == 2
    assert [s.kind for s in res.trace] == ["llm", "tool", "tool", "tool", "tool", "llm", "validation"]
    assert steps == res.trace and [s.i for s in res.trace] == list(range(1, 8))
    assert res.trace[0].output.startswith("tool_calls: get_sensor_summary(vibration_hf)")
    assert len(res.calls) == 2
    second = requests[1]["messages"]
    assert [m["role"] for m in second] == ["system", "user", "assistant", "tool", "tool", "tool", "tool"]
    assert "0.75" in second[0]["content"]  # half_limit filled in
    assert "vibration_hf: score 1.62, z 3.9, slope +0.048 g/h, up, deviating since 08:55" in second[1]["content"]


def test_invalid_answer_is_retried_once(engine, script):
    turns, requests = script
    bad = good_dict(evidence=good_dict()["evidence"] + [{"kind": "manual", "ref": "P101-TS-99", "detail": "x"}])
    turns += [INVESTIGATE, answer_turn(json.dumps(bad)), answer_turn(json.dumps(good_dict()))]
    res = dg.diagnose(engine, fake_event())
    assert res.diagnosis.verified and len(res.calls) == 3
    fix = requests[2]["messages"][-1]
    assert fix["role"] == "user" and "P101-TS-99" in fix["content"]


def test_invalid_twice_keeps_unverified(engine, script):
    turns, _ = script
    bad = good_dict(evidence=[{"kind": "sensor", "ref": "vibration_hf", "detail": "x"}])
    turns += [INVESTIGATE, answer_turn(json.dumps(bad)), answer_turn(json.dumps(bad))]
    res = dg.diagnose(engine, fake_event())
    assert not res.used_fallback and not res.diagnosis.verified and res.diagnosis.validation_errors


def test_unparseable_twice_uses_fallback(engine, script):
    turns, requests = script
    turns += [answer_turn("I am not sure."), answer_turn("Still not sure.")]
    res = dg.diagnose(engine, fake_event())
    assert res.used_fallback and "Agent error" in res.error and res.trace[-1].name == "fallback"
    assert requests[1]["tools"] is None and requests[1]["json_mode"] is True  # forced JSON-only retry


def test_prose_answer_then_forced_json_succeeds(engine, script):
    turns, requests = script
    turns += [INVESTIGATE, answer_turn("Let me think about the manual..."), answer_turn(json.dumps(good_dict()))]
    res = dg.diagnose(engine, fake_event())
    assert not res.used_fallback and res.diagnosis.verified
    assert requests[1]["tools"] is not None and requests[2]["json_mode"] is True


def test_turn_limit_forces_final_answer(engine, script):
    turns, requests = script
    turns += [INVESTIGATE] * dg.MAX_TURNS + [answer_turn(json.dumps(good_dict()))]
    res = dg.diagnose(engine, fake_event())
    assert res.diagnosis.verified and len(res.calls) == dg.MAX_TURNS + 1
    assert requests[-1]["tools"] is None and "Stop calling tools" in requests[-1]["messages"][-1]["content"]


def test_api_error_falls_back_and_keeps_trace(engine, script):
    turns, _ = script
    turns += [INVESTIGATE, llm.LlmError("APITimeoutError: timed out")]
    res = dg.diagnose(engine, fake_event())
    assert res.used_fallback and res.error.startswith("AMD API unavailable: APITimeoutError")
    assert res.trace[-1].kind == "validation" and res.trace[-1].name == "fallback"
    assert res.diagnosis.fault == "bearing_wear" and res.diagnosis.verified


def test_mock_mode_is_instant_fallback(engine, monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "1")
    res = dg.diagnose(engine, fake_event())
    assert res.used_fallback and res.error.startswith("Mock mode") and res.calls == []
    assert len(res.trace) == 1 and res.trace[0].name == "fallback"


def test_prefetch_mode(engine, script, monkeypatch):
    turns, requests = script
    monkeypatch.setenv("AGENT_MODE", "prefetch")
    turns += [answer_turn(json.dumps(good_dict(evidence=good_dict()["evidence"][:2] + [
        {"kind": "sensor", "ref": "vibration_rms", "detail": "x"}])))]
    res = dg.diagnose(engine, fake_event())
    assert res.diagnosis.verified and len(res.calls) == 1
    assert [s.kind for s in res.trace] == ["tool"] * 8 + ["llm", "validation"]
    assert [s.name for s in res.trace].count("search_manual") == 2  # symptoms + safety/procedures
    assert requests[0]["json_mode"] is True and requests[0]["tools"] is None
    assert "Tool results:" in requests[0]["messages"][1]["content"]


def test_prefetch_retrieves_lockout_section(engine, script, monkeypatch):
    """The prompt asks for lockout/tagout: citing P101-SAF-01 must pass on the first answer."""
    turns, requests = script
    monkeypatch.setenv("AGENT_MODE", "prefetch")
    ev = good_dict()["evidence"][:2] + [{"kind": "manual", "ref": "P101-SAF-01", "detail": "Lock out first."}]
    turns += [answer_turn(json.dumps(good_dict(evidence=ev)))]
    res = dg.diagnose(engine, fake_event())
    assert res.diagnosis.verified and len(res.calls) == 1


def test_prefetch_fix_prompt_offers_no_tools(engine, script, monkeypatch):
    turns, requests = script
    monkeypatch.setenv("AGENT_MODE", "prefetch")
    turns += [answer_turn(json.dumps(good_dict(parts=[{"part_no": "XXX-1", "qty": 1}]))),
              answer_turn(json.dumps(good_dict()))]
    res = dg.diagnose(engine, fake_event())
    assert res.diagnosis.verified and len(res.calls) == 2
    assert requests[1]["messages"][-1]["content"].startswith(dg.prompts.PREFETCH_FIX_PROMPT)


def test_truncated_answer_gets_a_shorter_retry(engine, script):
    turns, requests = script
    cut = json.dumps(good_dict())[:200]
    turns += [INVESTIGATE,
              lambda i: llm.ChatResult(content=cut, tool_calls=[], raw_message={"role": "assistant", "content": cut},
                                       call=_call(i), truncated=True),
              answer_turn(json.dumps(good_dict()))]
    res = dg.diagnose(engine, fake_event())
    assert res.diagnosis.verified and not res.used_fallback
    assert dg.prompts.TRUNCATED_HINT in requests[2]["messages"][-1]["content"]
    assert any(s.output == f"answer cut at max_tokens ({dg.MAX_TOKENS})" for s in res.trace)
    assert requests[0]["max_tokens"] == dg.MAX_TOKENS
