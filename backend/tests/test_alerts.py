from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.app import state
from backend.app.agent import llm
from backend.app.agent.diagnose import DiagnosisResult
from backend.app.alerts import notify, service
from backend.app.main import app
from backend.app.models import AckRequest, Diagnosis, PartLine, ResolveRequest, TraceStep
from backend.tests.fake_engine import NOW, FakeEngine, fake_event

UTC = timezone.utc


@pytest.fixture(autouse=True)
def no_network(monkeypatch, tmp_path):
    """No AMD calls in tests (a local .env may hold a real key), and logs go to a temp dir."""
    monkeypatch.setattr(llm, "is_mock", lambda: True)
    monkeypatch.setenv("LOG_DIR", str(tmp_path))


# ---------- unit tests: fake engine + the 00 §14.3 diagnosis ----------
def diagnosis_14_3() -> Diagnosis:
    return Diagnosis(
        fault="bearing_wear", fault_label="Drive-end bearing wear (early stage)", confidence=0.82,
        summary="HF vibration rising since 08:55.", evidence=[], severity="medium", est_time_to_failure_h=46,
        action="consider_replacement", category="mechanical",
        fix_steps=["Confirm the reading with the handheld vibration analyser (P101-TS-01).",
                   "Re-grease both bearings now per P101-PR-03 to slow the damage."],
        parts=[PartLine(part_no="BRG-6309-C3", name="Deep groove ball bearing 6309 C3 (drive end)",
                        in_stock=2, lead_time_days=3)],
        verified=True)


def stub_diagnose(engine, event, *, on_step=None, **_):
    trace = [TraceStep(i=1, kind="llm", name="chat.completions"), TraceStep(i=2, kind="tool", name="search_manual")]
    for step in trace:
        on_step(step)
    return DiagnosisResult(diagnosis=diagnosis_14_3(), trace=trace, calls=[], used_fallback=False, error=None)


class RecordingEngine(FakeEngine):
    """FakeEngine that remembers the write calls the alert service makes."""

    def __init__(self):
        super().__init__()
        self.calls = []

    def set_active_alert(self, machine_id, alert_id):
        self.calls.append(("set_active_alert", machine_id, alert_id))

    def suppress(self, machine_id, hours):
        self.calls.append(("suppress", machine_id, hours))

    def clear_fault(self, machine_id):
        self.calls.append(("clear_fault", machine_id))


@pytest.fixture
def eng(monkeypatch):
    monkeypatch.setattr(service, "diagnose", stub_diagnose)
    e = RecordingEngine()
    service.attach(e)
    return e


def open_alert(eng):
    service.on_anomaly(fake_event())          # no event loop here, so the pipeline runs inline
    return service.get_alert("ALT-0001")


def test_anomaly_creates_a_routed_and_notified_alert(eng):
    a = open_alert(eng)
    assert a.state == "open" and a.machine_name == "Coolant pump P-101" and a.created_at == NOW
    assert a.diagnosis.verified and [s.name for s in a.trace] == ["chat.completions", "search_manual"]
    assert a.assignee.id == "tech-a1" and a.assignee.on_shift
    assert [(n.person_id, n.reason, n.channel, n.delivered) for n in a.notifications] == [
        ("tech-a1", "primary", "in_app", True), ("sup-a1", "cc", "in_app", True)]
    assert a.notifications[0].message == (
        "P-101 Coolant pump P-101: Drive-end bearing wear (early stage) (medium, ~46 h to failure). "
        "First step: Confirm the reading with the handheld vibration analyser (P101-TS-01). "
        "Open the dashboard to acknowledge.")
    assert a.notifications[1].message.endswith("Assigned to Sara Benali. Repair-vs-replace review suggested.")
    assert ("set_active_alert", "P-101", "ALT-0001") in eng.calls


def test_ack_accepted_creates_work_order(eng):
    open_alert(eng)
    a = service.ack("ALT-0001", AckRequest(person_id="tech-a1", decision="accepted"))
    assert a.state == "acknowledged" and a.ack.at == NOW
    wo = a.work_order
    assert (wo.id, wo.priority, wo.assignee_id, wo.status) == ("WO-2026-0412", "P2", "tech-a1", "open")
    assert wo.title == "Drive-end bearing wear (early stage) - Coolant pump P-101"
    assert wo.steps == diagnosis_14_3().fix_steps and wo.parts[0].part_no == "BRG-6309-C3"
    assert eng.markers("P-101")[-1].label == "Acknowledged by Sara Benali"
    with pytest.raises(service.InvalidState):
        service.ack("ALT-0001", AckRequest(person_id="tech-a1", decision="accepted"))


def test_ack_rejected_suppresses_the_machine(eng):
    open_alert(eng)
    a = service.ack("ALT-0001", AckRequest(person_id="tech-a1", decision="rejected", note="sensor knocked"))
    assert a.state == "rejected" and a.work_order is None and a.ack.note == "sensor knocked"
    assert ("suppress", "P-101", 12) in eng.calls and ("set_active_alert", "P-101", None) in eng.calls
    assert eng.markers("P-101")[-1].label == "Rejected as false alarm by Sara Benali"
    with pytest.raises(service.InvalidState):
        service.resolve("ALT-0001", ResolveRequest(actual_fault="bearing_wear"))


def test_ack_errors(eng, monkeypatch):
    with pytest.raises(service.NotFound):
        service.ack("ALT-0099", AckRequest(person_id="tech-a1", decision="accepted"))
    monkeypatch.setattr(service, "_pipeline", lambda *a: None)     # leave the alert in "diagnosing"
    service.on_anomaly(fake_event())
    with pytest.raises(service.InvalidState):
        service.ack("ALT-0001", AckRequest(person_id="tech-a1", decision="accepted"))
    with pytest.raises(service.NotFound):
        service.ack("ALT-0001", AckRequest(person_id="nobody", decision="accepted"))


def test_resolve_clears_the_fault_and_logs_feedback(eng, tmp_path):
    open_alert(eng)
    service.ack("ALT-0001", AckRequest(person_id="tech-a1", decision="accepted"))
    a = service.resolve("ALT-0001", ResolveRequest(actual_fault="bearing_wear"))
    assert a.state == "resolved" and a.resolution.diagnosis_correct and a.work_order.status == "done"
    assert ("clear_fault", "P-101") in eng.calls and ("set_active_alert", "P-101", None) in eng.calls
    assert eng.markers("P-101")[-1].kind == "resolved"
    row = json.loads((tmp_path / "feedback.jsonl").read_text(encoding="utf-8").splitlines()[-1])
    assert row == {"alert_id": "ALT-0001", "machine_id": "P-101", "predicted": "bearing_wear",
                   "actual": "bearing_wear", "correct": True, "at": "2026-10-15T09:40:00+00:00"}


def test_resolve_with_a_different_fault_is_recorded_as_wrong(eng):
    open_alert(eng)
    a = service.resolve("ALT-0001", ResolveRequest(actual_fault="misalignment"))
    assert a.state == "resolved" and not a.resolution.diagnosis_correct


def test_threshold_fills_lead_time(eng):
    open_alert(eng)
    service.on_threshold("P-101", datetime(2026, 10, 17, 2, 20, tzinfo=UTC), "vibration_rms")
    a = service.get_alert("ALT-0001")
    assert (a.threshold_signal, a.lead_time_h) == ("vibration_rms", 40.7)       # 00 §14.3


def test_escalation_after_120_sim_minutes(eng):
    open_alert(eng)
    service.on_tick(NOW + timedelta(minutes=119))
    assert service.get_alert("ALT-0001").state == "open"
    service.on_tick(NOW + timedelta(minutes=120))
    a = service.get_alert("ALT-0001")
    assert a.state == "escalated"
    last = a.notifications[-1]
    assert (last.person_id, last.reason) == ("sup-a1", "escalation")
    assert last.message == ("ESCALATION P-101: Drive-end bearing wear (early stage) not acknowledged "
                            "for 120 min by Sara Benali. Please take over.")
    service.on_tick(NOW + timedelta(minutes=125))
    assert len(service.get_alert("ALT-0001").notifications) == 3                  # notified once only
    assert service.ack("ALT-0001", AckRequest(person_id="sup-a1", decision="accepted")).state == "acknowledged"


def test_reset_stops_old_pipelines_from_writing(eng, monkeypatch):
    real_pipeline = service._pipeline
    monkeypatch.setattr(service, "_pipeline", lambda *a: None)    # alerts wait in "diagnosing"
    service.on_anomaly(fake_event())
    old_gen = service._generation
    service.attach(RecordingEngine())           # a demo reset happens while the AI is still working
    service.on_anomaly(fake_event())            # the new store has its own ALT-0001
    real_pipeline("ALT-0001", old_gen)          # the old worker thread finishes now
    assert service.get_alert("ALT-0001").state == "diagnosing"   # untouched by the stale thread


def test_getters_return_copies(eng):
    open_alert(eng)
    service.get_alert("ALT-0001").state = "resolved"
    assert service.get_alert("ALT-0001").state == "open"


# ---------- notification messages ----------
def test_compose_uses_the_llm_and_truncates(eng, monkeypatch):
    a = open_alert(eng)
    seen = {}

    def fake_chat(messages, **kw):
        seen.update(kw, prompt=messages[0]["content"])
        return llm.ChatResult(content="x" * 400 + "\n", tool_calls=[], raw_message={}, call=None)

    monkeypatch.setattr(llm, "is_mock", lambda: False)
    monkeypatch.setattr(llm, "chat", fake_chat)
    msg = notify.compose(a.assignee, a, "primary", NOW)
    assert msg == "x" * 300
    assert seen["purpose"] == "alert_message" and seen["max_tokens"] == 150
    assert "Sara Benali" in seen["prompt"] and "Drive-end bearing wear" in seen["prompt"]


def test_compose_falls_back_to_the_template_on_llm_error(eng, monkeypatch):
    a = open_alert(eng)

    def boom(*args, **kw):
        raise llm.LlmError("timeout")

    monkeypatch.setattr(llm, "is_mock", lambda: False)
    monkeypatch.setattr(llm, "chat", boom)
    assert notify.compose(a.assignee, a, "primary", NOW) == a.notifications[0].message


# ---------- end to end: P1's real engine, P2's rule-based diagnosis, the HTTP API ----------
client = TestClient(app)          # no "with": the background clock does not run, we step by hand


def step_until(eng, done, max_steps=1500):
    for _ in range(max_steps):
        if done():
            return
        eng.step(1)
    raise AssertionError("condition not reached")


def inject_and_detect():
    eng = state.reset(7)
    assert client.post("/api/demo/inject", json={"machine_id": "P-101", "fault": "bearing_wear"}).status_code == 200
    step_until(eng, lambda: client.get("/api/alerts").json())
    return eng


def test_full_loop_inject_ack_lead_time_resolve():
    eng = inject_and_detect()
    a = client.get("/api/alerts").json()[0]
    assert a["id"] == "ALT-0001" and a["state"] == "open" and a["diagnosis"]["fault"] == "bearing_wear"
    assert a["assignee"]["id"] == "tech-a1" and a["notifications"][0]["person_id"] == "tech-a1"
    assert a["created_at"].endswith("Z") and eng.paused

    r = client.post("/api/alerts/ALT-0001/ack", json={"person_id": "tech-a1", "decision": "accepted"})
    assert r.status_code == 200 and r.json()["work_order"]["id"] == "WO-2026-0412"
    assert client.post("/api/alerts/ALT-0001/ack", json={"person_id": "tech-a1", "decision": "accepted"}).status_code == 409

    client.post("/api/demo/control", json={"paused": False, "speed": 30})
    step_until(eng, lambda: client.get("/api/alerts/ALT-0001").json()["lead_time_h"] is not None)
    assert client.get("/api/alerts/ALT-0001").json()["lead_time_h"] > 0

    r = client.post("/api/alerts/ALT-0001/resolve", json={"actual_fault": "bearing_wear"})
    assert r.status_code == 200 and r.json()["resolution"]["diagnosis_correct"]
    eng.step(1)                   # the status is computed from the newest sample (live: next 100 ms tick)
    p101 = client.get("/api/plant").json()["machines"][0]
    assert p101["id"] == "P-101" and p101["status"] == "ok" and p101["active_alert_id"] is None


def test_escalation_when_nobody_acknowledges():
    eng = inject_and_detect()
    client.post("/api/demo/control", json={"paused": False})
    step_until(eng, lambda: client.get("/api/alerts/ALT-0001").json()["state"] == "escalated", max_steps=30)
    a = client.get("/api/alerts/ALT-0001").json()
    assert a["notifications"][-1]["reason"] == "escalation" and a["notifications"][-1]["person_id"] == "sup-a1"


def test_reference_endpoints():
    state.reset(7)
    assert client.get("/api/alerts").json() == []
    assert client.get("/api/alerts/ALT-0001").status_code == 404
    assert client.post("/api/alerts/ALT-0001/resolve", json={"actual_fault": "other"}).status_code == 404
    people = client.get("/api/people").json()
    assert len(people) == 12 and {p["id"] for p in people if p["on_shift"]} == {"tech-a1", "tech-a2", "eng-a1", "sup-a1", "tech-a3"}
    assert client.get("/api/manual/P101-TS-01").json()["title"] == "Troubleshooting: bearing wear"
    assert client.get("/api/manual/NOPE").status_code == 404
    records = client.get("/api/maintenance/P-101").json()
    assert records[0]["id"] == "WO-2026-0901"
    assert client.get("/api/maintenance/C-201").json() and client.get("/api/maintenance/X-999").status_code == 404
    stats = client.get("/api/amd/stats").json()
    assert stats["provider"] == "AMD Radeon API" and "recent" in stats
