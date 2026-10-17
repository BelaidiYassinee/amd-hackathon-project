"""Tests for decide/replace.py and api/decide.py. Oracle: 00 §14.4 (±1 €).
Run: python -m pytest backend/tests/test_replace.py -q
"""
from __future__ import annotations

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.app.agent import llm
from backend.app.api import decide as api
from backend.app.decide import replace
from backend.app.models import LlmCall
from backend.tests.fake_engine import FakeEngine

ORACLE = {  # option_id: (capex, energy_5y, maint_5y, downtime_5y, tco_5y, score, rank)
    "AF-CP80-G2": (16300, 100159, 4500, 21600, 142559, 100.0, 1),
    "HX-NB100": (15400, 108997, 5500, 36000, 165897, 85.9, 2),
    "repair": (1400, 123529, 13125, 63600, 201654, 70.7, 3),
    "VT-ECO75": (9900, 121504, 6000, 21600, 159004, 0.0, 4),
}
EXAMPLE_TEXT = (  # the 00 §14.4 justification
    "Replacing P-101 with the AquaFlow CP-80 Gen2 has the lowest 5-year cost at €142,559, against €201,654 "
    "for repairing the current pump. Most of the gap is energy (74% vs 60% efficiency) and downtime, since the "
    "current pump needed 3 corrective repairs in the last 12 months. The extra upfront cost pays back in about "
    "15 months; the Vortan Eco-75 is cheaper to buy but cannot deliver 120 m3/h at 42 m."
)


@pytest.fixture(scope="module")
def engine():
    return FakeEngine()


@pytest.fixture
def analysis(engine):
    return replace.compute(engine, "P-101")


@pytest.fixture(autouse=True)
def clear_cache():
    replace._cache.clear()


def test_oracle(analysis):
    assert [o.option_id for o in analysis.options] == list(ORACLE)  # sorted by rank
    for o in analysis.options:
        capex, energy, maint, down, tco, score, rank = ORACLE[o.option_id]
        for got, want in [(o.capex_eur, capex), (o.energy_eur_5y, energy), (o.maintenance_eur_5y, maint),
                          (o.downtime_eur_5y, down), (o.tco_5y_eur, tco)]:
            assert abs(got - want) <= 1, (o.option_id, got, want)
        assert (o.score, o.rank) == (score, rank)
    assert analysis.payback_months == 15.0
    assert analysis.recommendation == "AF-CP80-G2"


def test_assumptions_duty_and_notes(analysis):
    assert analysis.fault == "bearing_wear"  # default
    assert analysis.duty == {"flow_m3h": 120, "head_m": 42, "hours_per_year": 6000}
    assert analysis.assumptions["corrective_repairs_last_12m"] == 3 and analysis.assumptions["age_years"] == 9.6
    assert analysis.assumptions["energy_eur_per_kwh"] == 0.18 and len(analysis.assumptions) == 10
    notes = {o.option_id: o.fit_notes for o in analysis.options}
    assert notes["AF-CP80-G2"] == "Meets 120 m3/h at 42 m (rated 130 m3/h at 44 m); same footprint."
    assert notes["VT-ECO75"] == "Rated 110 m3/h at 38 m: below the 120 m3/h at 42 m duty."
    assert notes["repair"] == "Keeps the 9-year-old pump; 3 corrective repairs in the last 12 months."
    assert analysis.options[2].label == "Repair current pump (bearing replacement)"


def test_other_fault_changes_repair_only(engine):
    an = replace.compute(engine, "P-101", "cavitation")
    repair = next(o for o in an.options if o.kind == "repair")
    assert repair.capex_eur == 440 and repair.label == "Repair current pump (suction-side fix)"


def test_errors(engine):
    with pytest.raises(replace.UnknownMachine):
        replace.compute(engine, "P-999")
    no_duty = FakeEngine()
    no_duty._cfg = {k: v for k, v in no_duty._cfg.items() if k != "duty"}
    with pytest.raises(replace.NoDuty):
        replace.compute(no_duty, "P-101")


# ---------- number check ----------
def test_example_justification_passes(analysis):
    assert replace.bad_numbers(EXAMPLE_TEXT, analysis) == []


@pytest.mark.parametrize("text,bad", [
    ("Replacing saves €59,095 over 5 years.", []),            # pairwise tco difference
    ("It costs €142.6k over 5 years.", []),                    # thousands
    ("The 9-year-old pump failed 3 times.", []),
    ("Replacing saves about 30% of the cost.", ["30"]),        # invented percentage
    ("It pays back in 11 months.", ["11"]),
    ("The total is €150,000.", ["150,000"]),
])
def test_bad_numbers(analysis, text, bad):
    assert replace.bad_numbers(text, analysis) == bad


def test_template_is_verified_in_mock(engine, monkeypatch):
    monkeypatch.setattr(llm, "is_mock", lambda: True)
    an = replace.analyze(engine, "P-101")
    assert an.justification_verified
    assert an.justification.startswith("AquaFlow CP-80 Gen2 (IE4 motor) has the lowest 5-year cost at €142,559")
    assert "about 15 months" in an.justification and "Vortan Eco-75 is cheaper to buy" in an.justification
    assert replace.bad_numbers(an.justification, an) == []


def test_template_when_repair_wins(analysis):
    an = analysis.model_copy(deep=True)
    an.options.sort(key=lambda o: o.kind != "repair")
    an.payback_months = None
    text = replace.template_justification(an)
    assert text.startswith("Repairing is the cheapest option over 5 years at €201,654; the best replacement, "
                           "AquaFlow CP-80 Gen2 (IE4 motor), would cost €142,559.")


# ---------- LLM path (scripted) ----------
def _result(text):
    call = LlmCall(id="llm-0001", at=datetime.now(timezone.utc), purpose="replace_justification", model="m",
                   endpoint="e", latency_ms=10, prompt_tokens=5, completion_tokens=5, tokens_per_s=500, ok=True)
    return llm.ChatResult(content=text, tool_calls=[], raw_message={"role": "assistant", "content": text}, call=call)


@pytest.fixture
def scripted(monkeypatch):
    answers, requests = [], []

    def fake_chat(messages, **kw):
        requests.append({"messages": list(messages), **kw})
        item = answers.pop(0)
        if isinstance(item, Exception):
            raise item
        return _result(item)

    monkeypatch.setattr(llm, "is_mock", lambda: False)
    monkeypatch.setattr(llm, "chat", fake_chat)
    return answers, requests


def test_llm_text_kept_when_numbers_check(engine, scripted):
    answers, requests = scripted
    answers.append(EXAMPLE_TEXT)
    an = replace.analyze(engine, "P-101")
    assert an.justification == EXAMPLE_TEXT and an.justification_verified
    assert requests[0]["purpose"] == "replace_justification" and requests[0]["max_tokens"] == 300
    replace.analyze(engine, "P-101")  # same numbers -> cached, no second call
    assert len(requests) == 1


def test_llm_retried_once_then_template(engine, scripted):
    answers, requests = scripted
    answers += ["It saves 30% and pays back in 11 months.", "It saves 31% per year."]
    an = replace.analyze(engine, "P-101")
    assert an.justification == replace.template_justification(an) and an.justification_verified
    assert len(requests) == 2 and "30, 11" in requests[1]["messages"][-1]["content"]


def test_llm_error_uses_template_without_caching(engine, scripted):
    answers, requests = scripted
    answers += [llm.LlmError("timeout"), EXAMPLE_TEXT]
    assert replace.analyze(engine, "P-101").justification == replace.template_justification(
        replace.compute(engine, "P-101"))
    assert replace.analyze(engine, "P-101").justification == EXAMPLE_TEXT  # tried AMD again


# ---------- endpoint ----------
@pytest.fixture
def client(engine, monkeypatch):
    monkeypatch.setattr(llm, "is_mock", lambda: True)
    app = FastAPI()
    app.include_router(api.router, prefix="/api")
    app.dependency_overrides[api.get_engine] = lambda: engine
    return TestClient(app)


def test_endpoint_ok(client):
    r = client.post("/api/machines/P-101/replace-analysis", json={})
    assert r.status_code == 200
    body = r.json()
    assert body["recommendation"] == "AF-CP80-G2" and body["payback_months"] == 15.0
    assert body["options"][0]["tco_5y_eur"] == 142559 and body["justification_verified"] is True
    assert client.post("/api/machines/P-101/replace-analysis").status_code == 200  # no body at all
    assert client.post("/api/machines/P-101/replace-analysis",
                       json={"fault": "misalignment"}).json()["fault"] == "misalignment"


def test_endpoint_errors(client, engine):
    assert client.post("/api/machines/P-999/replace-analysis", json={}).status_code == 404
    assert client.post("/api/machines/P-101/replace-analysis", json={"fault": "rust"}).status_code == 422
    no_duty = FakeEngine()
    no_duty._cfg = {k: v for k, v in no_duty._cfg.items() if k != "duty"}
    client.app.dependency_overrides[api.get_engine] = lambda: no_duty
    assert client.post("/api/machines/P-101/replace-analysis", json={}).status_code == 400


def test_installed_as_yaml_date():
    from datetime import date

    class YamlDateEngine(FakeEngine):
        def machine_cfg(self, machine_id):
            return dict(super().machine_cfg(machine_id), installed=date(2017, 3, 14))

    an = replace.compute(YamlDateEngine(), "P-101")
    assert an.recommendation == "AF-CP80-G2" and an.assumptions["age_years"] == 9.6
