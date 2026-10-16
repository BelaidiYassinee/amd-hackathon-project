"""Rule-based diagnosis, used in mock mode and when the AMD API is unavailable.

Deterministic and instant. It only cites real refs, so it can still pass validation.
"""
from __future__ import annotations

import re

from backend.app.agent import data_shim as data  # TODO: `from backend.app import data` once P4's data.py is on main
from backend.app.agent import validate
from backend.app.models import AnomalyEvent, Contribution, Diagnosis, Evidence, PartLine

LABELS = {
    "bearing_wear": "Bearing wear",
    "cavitation": "Cavitation (suction-side problem)",
    "misalignment": "Shaft misalignment",
    "motor_overheat": "Motor overheating",
    "other": "Unclassified anomaly",
}
MANUAL_SECTION = {
    "bearing_wear": "P101-TS-01",
    "cavitation": "P101-TS-02",
    "misalignment": "P101-TS-03",
    "motor_overheat": "P101-TS-04",
}
PARTS = {
    "bearing_wear": ["BRG-6309-C3", "GREASE-EP2"],
    "cavitation": ["STR-DN125"],
    "misalignment": ["CPL-ELEM-80", "SHIM-KIT-80"],
    "motor_overheat": ["FAN-MTR-30"],
    "other": [],
}
CATEGORY = {
    "bearing_wear": "mechanical",
    "cavitation": "process",
    "misalignment": "mechanical",
    "motor_overheat": "electrical",
    "other": "mechanical",
}
SAFETY = ["Lock out and tag out the motor before any hands-on work (P101-SAF-01)."]
_STEP_LINE = re.compile(r"^\s*(?:[-*]|\d+[.)])\s+(.+)$")


def classify(contributions: list[Contribution], ewma_limit: float) -> str:
    """First matching rule wins (contributions sorted by score desc)."""
    top, top2 = contributions[0], contributions[:2]
    by_signal = {c.signal: c for c in contributions}
    rms = by_signal.get("vibration_rms")
    if top.signal == "vibration_hf" and top.direction == "up":
        return "bearing_wear"
    if any(c.signal in ("discharge_pressure", "flow") and c.direction == "down" for c in top2):
        return "cavitation"
    if top.signal == "motor_temp" and (rms is None or rms.score < 0.5 * ewma_limit):
        return "motor_overheat"
    if any(c.signal == "vibration_rms" and c.direction == "up" for c in top2):
        return "misalignment"
    return "other"


def _fix_steps(section_text: str | None, section_id: str | None) -> list[str]:
    """Bullet / numbered lines of the manual section, preferring the 'What to do' part (max 6)."""
    if section_text:
        text = section_text
        m = re.search(r"what to do", text, re.I)
        if m:
            text = text[m.end():]
        steps = [s.group(1).strip() for line in text.splitlines() if (s := _STEP_LINE.match(line))]
        if steps:
            return steps[:6]
    ref = f" ({section_id})" if section_id else ""
    return [
        "Lock out and tag out the machine before any hands-on work (P101-SAF-01).",
        "Confirm the readings on site with a handheld instrument.",
        f"Follow the troubleshooting steps in the manual{ref}.",
        "Restart and confirm the signals return to their normal range.",
    ]


def _sensor_detail(c: Contribution, label: str, unit: str) -> str:
    side = "above" if c.z >= 0 else "below"
    trend = "rising" if c.slope_per_h > 0 else "falling" if c.slope_per_h < 0 else "flat"
    return (f"{label} is {abs(c.z):.1f} sigma {side} its learned baseline and {trend} "
            f"about {abs(c.slope_per_h):.3g} {unit} per hour.")


def rule_based(engine, event: AnomalyEvent) -> Diagnosis:
    mid = event.machine_id
    specs = {s.name: s for s in engine.signal_specs(mid)}
    contribs = [c for c in event.contributions if c.signal in specs]
    fault = classify(contribs, engine.ewma_limit)
    section_id = MANUAL_SECTION.get(fault)
    section = data.manual_sections().get(section_id) if section_id else None
    corrective = [r for r in data.maintenance(mid) if r.type == "corrective"]
    n_corrective = data.corrective_last_12m(mid, engine.sim_time)

    evidence = [Evidence(kind="sensor", ref=c.signal,
                         detail=_sensor_detail(c, specs[c.signal].label, specs[c.signal].unit))
                for c in contribs[:2]]
    if section:
        evidence.append(Evidence(kind="manual", ref=section.id,
                                 detail=f"Rule-based match: this signal pattern fits '{section.title}'."))
    if corrective:
        evidence.append(Evidence(kind="history", ref=corrective[0].id,
                                 detail=f"Latest corrective repair ({corrective[0].date}): {corrective[0].title}."))

    top_names = " and ".join(specs[c.signal].label.lower() for c in contribs[:2])
    d = Diagnosis(
        fault=fault,
        fault_label=f"{LABELS[fault]} (rule-based fallback)",
        confidence=0.5,
        summary=(f"The detector flagged {mid} because {top_names} moved away from their learned baseline. "
                 f"A fixed rule matches this pattern to {LABELS[fault].lower()}; the AI diagnosis was not available."),
        evidence=evidence,
        severity="medium",
        action="consider_replacement" if n_corrective >= 3 else "schedule_repair",
        category=CATEGORY[fault],
        fix_steps=_fix_steps(section.text if section else None, section_id),
        parts=[PartLine(part_no=p, name=p) for p in PARTS[fault]],
        safety=list(SAFETY),
    )
    seen = {ev.ref for ev in evidence}  # the fallback looked these up itself
    validate.finalize(d, engine, mid, seen)  # overwrites stock, sets verified
    return d
