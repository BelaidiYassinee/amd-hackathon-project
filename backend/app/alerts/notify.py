"""Alert messages: one LLM call for the primary assignee, templates for everything else."""
from __future__ import annotations

import json
import os
from datetime import datetime

import httpx

from backend.app.agent import llm
from backend.app.models import Alert, Notification, Person

MAX_CHARS = 300

PROMPT = ("Write a phone notification for {name} ({role}). Max 300 characters, plain text, no markdown. "
          "Include the machine id and name, the fault in plain words, the severity, the estimated time to "
          "failure if known, and the first action. End with 'Open the dashboard to acknowledge.' "
          "Use only facts from this JSON: {facts}")


def template(person: Person, alert: Alert, reason: str, now: datetime | None = None) -> str:
    d = alert.diagnosis
    mid, mname = alert.machine_id, alert.machine_name
    primary_name = alert.assignee.name if alert.assignee else "the on-shift technician"
    if reason == "primary":
        ttf = d.est_time_to_failure_h
        first = d.fix_steps[0] if d.fix_steps else "Check the machine on site."
        return (f"{mid} {mname}: {d.fault_label} ({d.severity}{', ~%d h to failure' % ttf if ttf else ''}). "
                f"First step: {first} Open the dashboard to acknowledge.")
    if reason == "cc":
        msg = f"FYI {mid}: {d.fault_label} ({d.severity}). Assigned to {primary_name}."
        if d.action == "consider_replacement":
            msg += " Repair-vs-replace review suggested."
        return msg
    mins = int((now - alert.created_at).total_seconds() // 60) if now else 0
    label = d.fault_label if d else "Unexplained anomaly"      # diagnosis can be missing after a crash
    return (f"ESCALATION {mid}: {label} not acknowledged for {mins} min by {primary_name}. "
            f"Please take over.")


def compose(person: Person, alert: Alert, reason: str, now: datetime | None = None) -> str:
    """The message for one recipient. Only the primary message uses the LLM (on AMD)."""
    if reason != "primary" or llm.is_mock():
        return template(person, alert, reason, now)
    d = alert.diagnosis
    facts = {"fault_label": d.fault_label, "severity": d.severity,
             "est_time_to_failure_h": d.est_time_to_failure_h,
             "fix_steps[0]": d.fix_steps[0] if d.fix_steps else None,
             "machine": f"{alert.machine_id} {alert.machine_name}"}
    prompt = PROMPT.format(name=person.name, role=person.role.replace("_", " "), facts=json.dumps(facts))
    try:
        result = llm.chat([{"role": "user", "content": prompt}], purpose="alert_message", max_tokens=150)
    except llm.LlmError:
        return template(person, alert, reason, now)
    text = " ".join((result.content or "").split())   # one line, no stray newlines
    return text[:MAX_CHARS] if text else template(person, alert, reason, now)


def in_app(person: Person, message: str, reason: str, now: datetime) -> Notification:
    return Notification(person_id=person.id, person_name=person.name, role=person.role, channel="in_app",
                        reason=reason, sent_at=now, delivered=True, message=message)


def _telegram_chat_id(person_id: str) -> str | None:
    """TELEGRAM_CHAT_IDS is 'tech-a1:123456789,sup-a1:987654321'."""
    for pair in os.getenv("TELEGRAM_CHAT_IDS", "").split(","):
        pid, _, cid = pair.strip().partition(":")
        if pid == person_id and cid.strip():
            return cid.strip()
    return None


def telegram(person: Person, message: str, reason: str, now: datetime) -> list[Notification]:
    """Send on Telegram when a bot token and a chat id for this person are set. Never raises.
    Blocks up to 5 s: call it from a worker thread, never from an engine hook."""
    token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = _telegram_chat_id(person.id)
    if not token or not chat_id:
        return []
    try:
        r = httpx.post(f"https://api.telegram.org/bot{token}/sendMessage",
                       json={"chat_id": chat_id, "text": message}, timeout=5)
        delivered = r.status_code == 200
    except Exception:             # no details: httpx errors include the URL, which holds the token
        delivered = False
    return [Notification(person_id=person.id, person_name=person.name, role=person.role, channel="telegram",
                         reason=reason, sent_at=now, delivered=delivered, message=message)]


def send(person: Person, message: str, reason: str, now: datetime) -> list[Notification]:
    """Deliver a message: always in-app, plus Telegram when configured (may block up to 5 s)."""
    return [in_app(person, message, reason, now)] + telegram(person, message, reason, now)
