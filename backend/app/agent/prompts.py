"""Prompts for the diagnosis agent. No filled-in example diagnosis here: it biases the model."""
from __future__ import annotations

from datetime import datetime, timezone

from backend.app.models import AnomalyEvent

SYSTEM_PROMPT = """\
You are a reliability engineer assisting the maintenance team of a manufacturing plant.
An anomaly detector has flagged a machine. Find the most likely fault, back every claim with
evidence from the tools, and tell the technician exactly what to do.

How to work:
1. Use the tools before answering:
   - get_sensor_summary for every signal with score >= {half_limit} (at least the top 3 signals),
   - get_maintenance_history for the machine,
   - search_manual with a description of the symptom pattern (you may search more than once),
   - check_spare_parts before you list any part.
2. Compare the pattern (which signals moved, in which direction, in which order) with the
   troubleshooting sections of the manual. Consider at least two candidate faults.
3. Only cite evidence you saw in tool results. Evidence "ref" must be exact:
   a signal name (e.g. vibration_rms), a maintenance record id (e.g. WO-2025-0871),
   a manual section id (e.g. P101-TS-03) or a part number (e.g. CPL-ELEM-80). Never cite load_pct.
   Give at least 3 evidence items, including at least one sensor and one manual section.

Rules for the answer:
- fault is one of: bearing_wear, cavitation, misalignment, motor_overheat, other.
- est_time_to_failure_h: take the typical progression time the manual gives for that fault and
  subtract the hours since first deviation; if a sensor's projected_hours_to_alarm is smaller, use that.
- severity: critical if the machine is down, any signal is already beyond an alarm limit, or
  est_time_to_failure_h < 8; high if < 24; medium if < 72; otherwise low.
- action: critical -> stop_now; high or medium -> schedule_repair; low -> monitor.
  Exception: if the machine had 3 or more corrective repairs in the last 12 months and severity is
  medium or high, use consider_replacement.
- category: mechanical (bearings, alignment, coupling, impeller, seal), electrical (motor windings,
  cooling fan, supply), process (suction conditions, cavitation, flow).
- confidence: above 0.8 only if at least two signals AND a manual signature agree; lower otherwise.
- fix_steps: at most 8 concrete, ordered steps for a technician, taken from the manual sections you
  retrieved. Put section ids in parentheses. Start hands-on work with lockout/tagout.
- Write short, plain sentences. No jargon without a short explanation.

- Do not write your reasoning or notes as text. When you are done with the tools, reply with the JSON only.

Final answer: ONLY a JSON object, no markdown fences, no text before or after:
{
  "fault": "bearing_wear | cavitation | misalignment | motor_overheat | other",
  "fault_label": "short human-readable label",
  "confidence": 0.0,
  "summary": "two sentences: what is happening and why you think so",
  "alternatives": [{"fault": "...", "why_less_likely": "..."}],
  "evidence": [{"kind": "sensor | history | manual | parts", "ref": "exact id", "detail": "one sentence"}],
  "severity": "low | medium | high | critical",
  "est_time_to_failure_h": 0.0,
  "action": "monitor | schedule_repair | stop_now | consider_replacement",
  "category": "mechanical | electrical | process",
  "fix_steps": ["..."],
  "parts": [{"part_no": "exact part number from check_spare_parts", "name": "...", "qty": 1}],
  "safety": ["..."]
}"""

# Appended to the user message in AGENT_MODE=prefetch (no native tool calling).
PREFETCH_NOTE = (
    "The tools have already been run for you; their results are below. "
    "Do not call tools. Answer with the final JSON object only.\n\nTool results:\n"
)

FIX_PROMPT = (
    "Fix these problems and answer again with only the JSON object. "
    "Only call a tool if a fix needs data you have not retrieved yet:\n"
)
FORCE_FINAL_PROMPT = "Stop calling tools. Give your final JSON answer now."


def system_prompt(engine) -> str:
    return SYSTEM_PROMPT.replace("{half_limit}", f"{0.5 * engine.ewma_limit:g}")


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def user_message(engine, event: AnomalyEvent) -> str:
    mid = event.machine_id
    cfg = engine.machine_cfg(mid)
    units = {s.name: s.unit for s in engine.signal_specs(mid)}
    now = engine.sim_time
    hours_ago = (now - event.first_deviation_at).total_seconds() / 3600
    status = "down (tripped)" if engine.is_failed(mid) else "running"

    lines = [
        f'Machine: {mid}, {cfg.get("name")} ({cfg.get("model")}), area "{cfg.get("area")}", type {cfg.get("type")}.',
        f"Plant time now: {_iso(now)}. Machine status: {status}.",
        f"Anomaly event {event.id}: detected {_iso(event.detected_at)}, first deviation "
        f"{_iso(event.first_deviation_at)}",
        f"({hours_ago:.1f} h ago), overall score {event.score:.2f} (alarm limit {engine.ewma_limit:g}).",
        "Signal contributions (score = |EWMA of standardized residual|, z = latest standardized residual,",
        "slope in signal units per hour over the last 3 h):",
    ]
    for c in event.contributions:
        line = (f"- {c.signal}: score {c.score:.2f}, z {c.z:.1f}, "
                f"slope {c.slope_per_h:+.3g} {units.get(c.signal, '')}/h, {c.direction}")
        if c.deviating_since:
            line += f", deviating since {c.deviating_since.astimezone(timezone.utc):%H:%M}"
        lines.append(line)
    lines.append("Diagnose this anomaly.")
    return "\n".join(lines)
