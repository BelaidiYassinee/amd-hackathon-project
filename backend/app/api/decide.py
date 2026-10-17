"""Repair-vs-replace endpoint (P2). main.py includes this router under /api."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.app.decide import replace
from backend.app.models import ReplaceAnalysis, ReplaceRequest

router = APIRouter()


def get_engine():
    from backend.app import state  # imported lazily so this router loads before P1's state exists

    return state.get_engine()


@router.post("/machines/{machine_id}/replace-analysis", response_model=ReplaceAnalysis)
def replace_analysis(machine_id: str, req: ReplaceRequest | None = None, engine=Depends(get_engine)) -> ReplaceAnalysis:
    """Sync on purpose: FastAPI runs it in a thread pool, so the AMD call does not block the event loop."""
    try:
        return replace.analyze(engine, machine_id, req.fault if req else None)
    except replace.UnknownMachine:
        raise HTTPException(404, f"unknown machine {machine_id}")
    except replace.NoDuty as e:
        raise HTTPException(400, str(e))
