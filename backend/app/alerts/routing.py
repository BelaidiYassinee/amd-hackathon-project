"""Who gets an alert: the on-shift person with the right role for the plant area."""
from __future__ import annotations

from datetime import datetime

from backend.app import data
from backend.app.models import Diagnosis, Person

ROLE_FOR_CATEGORY = {"mechanical": "mechanical_technician", "electrical": "electrical_technician",
                     "process": "process_engineer"}
SUPERVISOR = "maintenance_supervisor"


def shift_at(t: datetime) -> str:
    """A 06-14, B 14-22, C 22-06 (sim time hour)."""
    if 6 <= t.hour < 14:
        return "A"
    if 14 <= t.hour < 22:
        return "B"
    return "C"


def on_shift(person: Person, t: datetime) -> bool:
    return person.shift == shift_at(t)


def people_now(t: datetime) -> list[Person]:
    """The roster with on_shift computed (for GET /api/people)."""
    people = data.roster()
    for p in people:
        p.on_shift = on_shift(p, t)
    return people


def pick(machine_area: str, diagnosis: Diagnosis, t: datetime) -> tuple[Person, list[Person]]:
    """Primary assignee and cc list for a diagnosis at sim time t."""
    present = [p for p in people_now(t) if p.on_shift]
    supervisor = next(p for p in present if p.role == SUPERVISOR)   # every shift has one
    role = ROLE_FOR_CATEGORY[diagnosis.category]
    primary = next((p for p in present
                    if p.role == role and (machine_area in p.areas or "all" in p.areas)), supervisor)
    needs_cc = diagnosis.severity == "critical" or diagnosis.action in ("stop_now", "consider_replacement")
    cc = [supervisor] if needs_cc and supervisor.id != primary.id else []
    return primary, cc
