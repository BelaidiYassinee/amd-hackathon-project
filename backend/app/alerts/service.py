"""Alert lifecycle: create on anomaly, diagnose + route + notify in a worker thread,
then acknowledge -> work order -> resolve, with escalation when nobody answers.

All alerts live in memory, guarded by one lock. Engine hooks run inside engine.step(),
so they only do quick bookkeeping; the slow LLM work runs in a worker thread.
"""
from __future__ import annotations

import asyncio
import json
import os
import threading
import traceback
from datetime import datetime
from pathlib import Path

from backend.app import state
from backend.app.agent.diagnose import diagnose
from backend.app.alerts import notify, routing
from backend.app.models import Ack, AckRequest, Alert, AnomalyEvent, Resolution, ResolveRequest, WorkOrder

ESCALATE_AFTER_MIN = 120          # sim minutes without acknowledgement
WO_START = 412                    # first work order WO-2026-0412
PRIORITY = {"critical": "P1", "high": "P1", "medium": "P2", "low": "P3"}


class NotFound(Exception): ...
class InvalidState(Exception): ...


_lock = threading.Lock()
_alerts: dict[str, Alert] = {}
_order: list[str] = []            # alert ids, oldest first
_engine = None
_generation = 0                   # bumped on every attach, so stale worker threads can't write
_next_alert = 1
_next_wo = WO_START
_tasks: set = set()               # keep references to running asyncio tasks


# ---------- wiring ----------
def attach(engine) -> None:
    """Clear the store and hook into a new engine (called by state.reset)."""
    global _engine, _generation, _next_alert, _next_wo
    with _lock:
        _alerts.clear()
        _order.clear()
        _engine = engine
        _generation += 1
        _next_alert, _next_wo = 1, WO_START
    engine.on_anomaly.append(on_anomaly)
    engine.on_threshold.append(on_threshold)
    engine.on_tick.append(on_tick)


if attach not in state.RESET_HOOKS:
    state.RESET_HOOKS.append(attach)


# ---------- engine hooks (run inside engine.step: keep them fast) ----------
def on_anomaly(event: AnomalyEvent) -> None:
    global _next_alert
    cfg = _engine.machine_cfg(event.machine_id)
    with _lock:
        alert = Alert(id=f"ALT-{_next_alert:04d}", machine_id=event.machine_id, machine_name=cfg["name"],
                      state="diagnosing", created_at=event.detected_at, event=event)
        _next_alert += 1
        _alerts[alert.id] = alert
        _order.append(alert.id)
        gen = _generation
    _engine.set_active_alert(event.machine_id, alert.id)
    try:
        loop = asyncio.get_running_loop()
        task = loop.create_task(asyncio.to_thread(_pipeline, alert.id, gen))
        _tasks.add(task)
        task.add_done_callback(_tasks.discard)
    except RuntimeError:          # no event loop (tests, eval): run inline
        _pipeline(alert.id, gen)


def on_threshold(machine_id: str, t: datetime, signal: str) -> None:
    with _lock:
        for alert_id in reversed(_order):
            a = _alerts[alert_id]
            if a.machine_id == machine_id and a.state != "rejected":
                if a.threshold_alarm_at is None:      # keep the first legacy alarm only
                    a.threshold_alarm_at = t
                    a.threshold_signal = signal
                    a.lead_time_h = round((t - a.event.detected_at).total_seconds() / 3600, 1)
                return


def on_tick(now: datetime) -> None:
    with _lock:
        due = [a for a in _alerts.values()
               if a.state == "open" and (now - a.created_at).total_seconds() >= ESCALATE_AFTER_MIN * 60]
        for a in due:
            a.state = "escalated"
            supervisor = next(p for p in routing.people_now(now)
                              if p.on_shift and p.role == routing.SUPERVISOR)
            message = notify.template(supervisor, a, "escalation", now)
            a.notifications.append(notify.in_app(supervisor, message, "escalation", now))
            # Telegram can take seconds: send it from a thread so the plant clock never waits
            threading.Thread(target=_telegram_later, args=(a.id, _generation, supervisor, message, now),
                             daemon=True).start()


def _telegram_later(alert_id: str, gen: int, person, message: str, now: datetime) -> None:
    sent = notify.telegram(person, message, "escalation", now)
    if sent:
        with _lock:
            if gen == _generation and alert_id in _alerts:
                _alerts[alert_id].notifications += sent


# ---------- the diagnosis pipeline (worker thread) ----------
def _pipeline(alert_id: str, gen: int) -> None:
    try:
        _run_pipeline(alert_id, gen)
    except Exception as e:        # never leave an alert stuck in "diagnosing"
        traceback.print_exc()
        with _lock:
            if gen == _generation and _alerts[alert_id].state == "diagnosing":
                _alerts[alert_id].error = f"Alert pipeline failed: {type(e).__name__}"
                _alerts[alert_id].state = "open"


def _run_pipeline(alert_id: str, gen: int) -> None:
    with _lock:
        if gen != _generation:
            return
        alert = _alerts[alert_id].model_copy(deep=True)
        engine = _engine

    def on_step(step) -> None:
        with _lock:
            if gen == _generation:
                _alerts[alert_id].trace.append(step)

    result = diagnose(engine, alert.event, on_step=on_step)
    d = result.diagnosis
    now = engine.sim_time
    area = engine.machine_cfg(alert.machine_id)["area"]
    primary, cc = routing.pick(area, d, now)

    # build the message on a copy (the LLM call must not hold the lock)
    draft = alert.model_copy(update={"diagnosis": d, "assignee": primary})
    notifications = notify.send(primary, notify.compose(primary, draft, "primary", now), "primary", now)
    for person in cc:
        notifications += notify.send(person, notify.compose(person, draft, "cc", now), "cc", now)

    with _lock:
        if gen != _generation:
            return
        a = _alerts[alert_id]
        a.diagnosis = d
        a.trace = result.trace          # the full trace replaces the live one
        a.error = result.error
        a.assignee = primary
        a.notifications += notifications
        a.state = "open"


# ---------- reads ----------
def list_alerts() -> list[Alert]:
    """All alerts, newest first."""
    with _lock:
        return [_alerts[i].model_copy(deep=True) for i in reversed(_order)]


def get_alert(alert_id: str) -> Alert:
    with _lock:
        if alert_id not in _alerts:
            raise NotFound(f"unknown alert {alert_id}")
        return _alerts[alert_id].model_copy(deep=True)


def _person(person_id: str):
    for p in routing.people_now(_engine.sim_time):
        if p.id == person_id:
            return p
    raise NotFound(f"unknown person {person_id}")


# ---------- actions ----------
def ack(alert_id: str, req: AckRequest) -> Alert:
    global _next_wo
    person = _person(req.person_id)
    now = _engine.sim_time
    with _lock:
        if alert_id not in _alerts:
            raise NotFound(f"unknown alert {alert_id}")
        a = _alerts[alert_id]
        if a.state not in ("open", "escalated") or a.diagnosis is None:
            raise InvalidState(f"cannot acknowledge an alert in state '{a.state}'")
        a.ack = Ack(person_id=person.id, at=now, decision=req.decision, note=req.note)
        if req.decision == "accepted":
            d = a.diagnosis
            a.state = "acknowledged"
            a.work_order = WorkOrder(id=f"WO-2026-{_next_wo:04d}", created_at=now, machine_id=a.machine_id,
                                     title=f"{d.fault_label} - {a.machine_name}", priority=PRIORITY[d.severity],
                                     assignee_id=person.id, steps=list(d.fix_steps),
                                     parts=[p.model_copy() for p in d.parts], status="open")
            _next_wo += 1
            marker = f"Acknowledged by {person.name}"
        else:
            a.state = "rejected"
            marker = f"Rejected as false alarm by {person.name}"
        machine, result = a.machine_id, a.model_copy(deep=True)
    if req.decision == "rejected":
        _engine.suppress(machine, 12)
        _engine.set_active_alert(machine, None)
    _engine.add_marker(machine, "acknowledged", now, marker)
    return result


def resolve(alert_id: str, req: ResolveRequest) -> Alert:
    now = _engine.sim_time
    with _lock:
        if alert_id not in _alerts:
            raise NotFound(f"unknown alert {alert_id}")
        a = _alerts[alert_id]
        if a.state not in ("open", "acknowledged", "escalated"):
            raise InvalidState(f"cannot resolve an alert in state '{a.state}'")
        correct = a.diagnosis is not None and a.diagnosis.fault == req.actual_fault
        a.state = "resolved"
        a.resolution = Resolution(at=now, actual_fault=req.actual_fault, diagnosis_correct=correct, note=req.note)
        if a.work_order:
            a.work_order.status = "done"
        machine, result = a.machine_id, a.model_copy(deep=True)
    _engine.clear_fault(machine)
    _engine.set_active_alert(machine, None)
    _engine.add_marker(machine, "resolved", now, f"Resolved: {req.actual_fault.replace('_', ' ')}")
    _log_feedback(result)
    return result


def _log_feedback(a: Alert) -> None:
    """The learning loop: predicted vs actual fault, one JSON line per resolved alert."""
    row = {"alert_id": a.id, "machine_id": a.machine_id,
           "predicted": a.diagnosis.fault if a.diagnosis else None, "actual": a.resolution.actual_fault,
           "correct": a.resolution.diagnosis_correct, "at": a.resolution.at.isoformat()}
    try:
        log_dir = Path(os.getenv("LOG_DIR", "backend/logs") or "backend/logs")
        log_dir.mkdir(parents=True, exist_ok=True)
        with open(log_dir / "feedback.jsonl", "a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
    except OSError:
        pass
