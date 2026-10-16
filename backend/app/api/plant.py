from __future__ import annotations

import math
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Query

from backend.app import state
from backend.app.models import (ControlRequest, InjectRequest, PlantState, ResetRequest,
                                Series, SeriesPoint)

router = APIRouter()


def _engine():
    if state.engine is None:
        raise HTTPException(503, "engine not ready")
    return state.engine


@router.get("/health")
def health():
    eng = state.engine
    t = eng.sim_time.isoformat().replace("+00:00", "Z") if eng else None
    return {"ok": True, "sim_time": t}


@router.get("/plant", response_model=PlantState)
def plant():
    return _engine().plant_state()


@router.get("/machines/{machine_id}/series", response_model=Series)
def series(machine_id: str, hours: float = Query(48, ge=1, le=168),
           max_points: int = Query(600, ge=10, le=2000)):
    eng = _engine()
    if machine_id not in eng.machine_ids():
        raise HTTPException(404, f"unknown machine {machine_id}")
    samples = eng.samples(machine_id, hours)
    stride = max(1, math.ceil(len(samples) / max_points))
    picked = samples[::-1][::stride][::-1]         # counts from the end, so the last sample is kept
    points = [SeriesPoint(t=s.t, values={k: round(v, 3) for k, v in s.values.items()},
                          score=round(s.score, 3)) for s in picked]
    t_min = samples[0].t if samples else eng.sim_time - timedelta(hours=hours)
    markers = [mk for mk in eng.markers(machine_id) if mk.t >= t_min]
    return Series(machine_id=machine_id, signals=eng.signal_specs(machine_id),
                  ewma_limit=eng.ewma_limit, points=points, markers=markers)


@router.post("/demo/inject", response_model=PlantState)
def inject(req: InjectRequest):
    eng = _engine()
    if req.machine_id not in eng.machine_ids():
        raise HTTPException(404, f"unknown machine {req.machine_id}")
    try:
        eng.inject(req.machine_id, req.fault, req.severity, req.duration_h)
    except ValueError as e:
        raise HTTPException(409, str(e))
    eng.paused = False                             # so the demo starts flowing right away
    return eng.plant_state()


@router.post("/demo/control", response_model=PlantState)
def control(req: ControlRequest):
    eng = _engine()
    if req.paused is not None:
        eng.paused = req.paused
    if req.speed is not None:
        eng.speed = req.speed
    if req.auto_pause_on_alert is not None:
        eng.auto_pause_on_alert = req.auto_pause_on_alert
    return eng.plant_state()


@router.post("/demo/reset", response_model=PlantState)
def reset(req: ResetRequest):
    state.reset(req.seed)
    return _engine().plant_state()