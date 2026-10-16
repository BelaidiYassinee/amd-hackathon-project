from __future__ import annotations

from datetime import datetime, timezone

import pytest

from backend.app.alerts import routing
from backend.app.models import Diagnosis


def at(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 10, 15, hour, minute, tzinfo=timezone.utc)


def diag(category: str, action: str = "schedule_repair", severity: str = "medium") -> Diagnosis:
    return Diagnosis(fault="other", fault_label="Test fault", confidence=0.5, summary="", evidence=[],
                     severity=severity, action=action, category=category, fix_steps=["Check it."])


@pytest.mark.parametrize("hour, shift", [(5, "C"), (6, "A"), (13, "A"), (14, "B"), (21, "B"), (22, "C"), (0, "C")])
def test_shift_at(hour, shift):
    assert routing.shift_at(at(hour, 59 if hour in (5, 13, 21) else 0)) == shift


# ---- acceptance table (04 brief, Task 2) ----
def test_morning_mechanical_on_p101_goes_to_sara():
    primary, cc = routing.pick("Cooling loop", diag("mechanical"), at(9, 40))
    assert primary.id == "tech-a1" and primary.name == "Sara Benali"
    assert cc == []


def test_consider_replacement_copies_the_supervisor():
    primary, cc = routing.pick("Cooling loop", diag("mechanical", action="consider_replacement"), at(9, 40))
    assert primary.id == "tech-a1"
    assert [p.id for p in cc] == ["sup-a1"] and cc[0].name == "Karim Ouali"


def test_night_process_goes_to_the_supervisor():
    primary, cc = routing.pick("Cooling loop", diag("process"), at(23))
    assert primary.id == "sup-c1" and primary.name == "Giulia Romano"


def test_afternoon_electrical_goes_to_elena():
    primary, _ = routing.pick("Cooling loop", diag("electrical"), at(15))
    assert primary.id == "tech-b2" and primary.name == "Elena Conti"


# ---- extra rules ----
def test_area_filter_skips_technicians_of_other_areas():
    primary, _ = routing.pick("Packaging line", diag("mechanical"), at(9))
    assert primary.id == "tech-a3"          # Sara covers Cooling loop and Utilities only


def test_critical_copies_supervisor_but_never_twice():
    _, cc = routing.pick("Cooling loop", diag("mechanical", severity="critical"), at(9))
    assert [p.id for p in cc] == ["sup-a1"]
    primary, cc = routing.pick("Cooling loop", diag("process", action="stop_now"), at(23))
    assert primary.id == "sup-c1" and cc == []


def test_people_now_marks_the_current_shift():
    people = routing.people_now(at(15))
    assert len(people) == 12
    assert {p.id for p in people if p.on_shift} == {"tech-b1", "tech-b2", "eng-b1", "sup-b1"}
