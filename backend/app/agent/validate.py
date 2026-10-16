"""Evidence validation: every ref in a diagnosis must point at real data the agent actually saw.

Invalid refs are never fixed silently: they are reported in validation_errors so the agent
can correct them on retry. Stock numbers always come from spare_parts.json, never the model.
"""
from __future__ import annotations

from backend.app.agent import data_shim as data  # TODO: `from backend.app import data` once P4's data.py is on main
from backend.app.models import Diagnosis


def _norm(x) -> str:
    return str(x).strip().upper()


def _lookup(ids) -> dict[str, str]:
    """Normalized id -> canonical id."""
    return {_norm(i): i for i in ids}


def check(d: Diagnosis, engine, machine_id: str, seen: set[str]) -> list[str]:
    """Human-readable problems with the diagnosis; empty list means verified."""
    signals = _lookup(s.name for s in engine.signal_specs(machine_id))
    records = _lookup(r.id for r in data.maintenance(machine_id))
    sections = _lookup(data.manual_sections())
    all_parts = _lookup(p["part_no"] for p in data.parts())
    fitting = _lookup(p["part_no"] for p in data.parts(machine_id))
    seen_n = {_norm(s) for s in seen}

    errors = []
    for i, ev in enumerate(d.evidence, 1):
        ref, label = _norm(ev.ref), f"evidence {i} ({ev.kind} '{ev.ref}')"
        if ev.kind == "sensor":
            if ref == "LOAD_PCT":
                errors.append(f"{label}: load_pct is the production load, not a sensor")
            elif ref not in signals:
                errors.append(f"{label}: not a signal of {machine_id}; valid: {', '.join(signals.values())}")
        elif ev.kind == "history":
            if ref not in records:
                errors.append(f"{label}: not a maintenance record id of {machine_id}")
            elif ref not in seen_n:
                errors.append(f"{label}: not in any tool result; call get_maintenance_history and cite ids it returns")
        elif ev.kind == "manual":
            if ref not in sections:
                errors.append(f"{label}: no such manual section id")
            elif ref not in seen_n:
                errors.append(f"{label}: you did not retrieve this section; use search_manual and cite ids it returns")
        elif ev.kind == "parts":
            if ref not in all_parts:
                errors.append(f"{label}: no such part number")
            elif ref not in fitting:
                errors.append(f"{label}: this part does not fit {machine_id}")

    kinds = [ev.kind for ev in d.evidence]
    if len(kinds) < 3:
        errors.append(f"need at least 3 evidence items, got {len(kinds)}")
    if "sensor" not in kinds:
        errors.append("need at least one sensor evidence item")
    if "manual" not in kinds:
        errors.append("need at least one manual evidence item")

    for p in d.parts:
        ref = _norm(p.part_no)
        if ref not in all_parts:
            errors.append(f"part '{p.part_no}': no such part number; use check_spare_parts")
        elif ref not in fitting:
            errors.append(f"part '{p.part_no}': does not fit {machine_id}")
    return errors


def finalize(d: Diagnosis, engine, machine_id: str, seen: set[str]) -> list[str]:
    """Check d, then (in place) canonicalize valid refs, overwrite part info from inventory,
    and set verified / validation_errors. Returns the errors."""
    errors = check(d, engine, machine_id, seen)

    canonical = _lookup(s.name for s in engine.signal_specs(machine_id))
    canonical |= _lookup(r.id for r in data.maintenance(machine_id))
    canonical |= _lookup(data.manual_sections())
    canonical |= _lookup(p["part_no"] for p in data.parts())
    for ev in d.evidence:
        ev.ref = canonical.get(_norm(ev.ref), ev.ref)

    for p in d.parts:
        p.part_no = canonical.get(_norm(p.part_no), p.part_no)
        info = data.part(p.part_no)
        p.in_stock = info["in_stock"] if info else None
        p.lead_time_days = info["lead_time_days"] if info else None
        if info:
            p.name = info["name"]

    if d.est_time_to_failure_h is not None and d.est_time_to_failure_h < 0:
        d.est_time_to_failure_h = 0.0  # past the manual's typical progression time: failure can come any time

    d.verified = not errors
    d.validation_errors = errors
    return errors


def summary(d: Diagnosis | None, errors: list[str]) -> str:
    """One line for the validation trace step."""
    if d is None:
        return "no parseable diagnosis: " + "; ".join(errors)
    head = f"{len(d.evidence)} evidence refs, {len(d.parts)} parts"
    if errors:
        return f"{head} -> {len(errors)} problem(s): " + "; ".join(errors)
    return f"{head} -> ok: all refs resolved; stock overwritten from inventory"
