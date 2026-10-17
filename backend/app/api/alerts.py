from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.app import data, state
from backend.app.agent import llm
from backend.app.alerts import routing, service
from backend.app.models import (AckRequest, Alert, AmdStats, MaintenanceRecord, ManualSection, Person,
                                ResolveRequest)

router = APIRouter()


def _call(fn, *args):
    try:
        return fn(*args)
    except service.NotFound as e:
        raise HTTPException(404, str(e))
    except service.InvalidState as e:
        raise HTTPException(409, str(e))


@router.get("/alerts", response_model=list[Alert])
def list_alerts():
    return service.list_alerts()


@router.get("/alerts/{alert_id}", response_model=Alert)
def get_alert(alert_id: str):
    return _call(service.get_alert, alert_id)


@router.post("/alerts/{alert_id}/ack", response_model=Alert)
def ack(alert_id: str, req: AckRequest):
    return _call(service.ack, alert_id, req)


@router.post("/alerts/{alert_id}/resolve", response_model=Alert)
def resolve(alert_id: str, req: ResolveRequest):
    return _call(service.resolve, alert_id, req)


@router.get("/people", response_model=list[Person])
def people():
    return routing.people_now(state.get_engine().sim_time)


@router.get("/manual/{section_id}", response_model=ManualSection)
def manual(section_id: str):
    section = data.manual_sections().get(section_id)
    if section is None:
        raise HTTPException(404, f"unknown manual section {section_id}")
    return section


@router.get("/maintenance/{machine_id}", response_model=list[MaintenanceRecord])
def maintenance(machine_id: str):
    if machine_id not in state.get_engine().machine_ids():
        raise HTTPException(404, f"unknown machine {machine_id}")
    return data.maintenance(machine_id)


@router.get("/amd/stats", response_model=AmdStats)
def amd_stats():
    return llm.stats()
