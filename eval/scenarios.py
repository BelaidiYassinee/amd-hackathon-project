from __future__ import annotations

import copy
from dataclasses import dataclass
from datetime import datetime

import numpy as np

from backend.app.models import AnomalyEvent
from backend.app.sim.engine import Engine
from backend.app.sim.faults import DEFAULT_DURATION_H

FAULTS = ["bearing_wear", "cavitation", "misalignment", "motor_overheat"]
MACHINE = "P-101"


@dataclass
class Scenario:
    id: str
    machine_id: str
    fault: str | None               # None = healthy run
    severity: float
    onset_h: float                  # hours after the live start
    duration_h: float | None
    noise_mult: float
    seed: int
    horizon_h: float                # hours after the live start to simulate


@dataclass
class ScenarioRun:
    scenario: Scenario
    injected_at: datetime | None = None
    event: AnomalyEvent | None = None            # first event AFTER the injection
    engine_at_event: Engine | None = None        # copy of the engine right after that event
    threshold_at: datetime | None = None         # when the legacy alarm fired
    threshold_signal: str | None = None
    failure_at: datetime | None = None
    healthy_events: int = 0                      # healthy runs: number of events (false alarms)
    pre_onset_events: int = 0                    # fault runs: events before the injection


def make_scenarios() -> list[Scenario]:
    out: list[Scenario] = []
    for f_idx, fault in enumerate(FAULTS):
        for i in range(10):
            seed = 1000 + 10 * f_idx + i
            rng = np.random.default_rng(seed)
            severity = float(rng.uniform(0.7, 1.3))
            onset_h = float(rng.uniform(6, 24))
            duration_h = DEFAULT_DURATION_H[fault] * float(rng.uniform(0.8, 1.2))
            noise_mult = float(rng.uniform(0.8, 1.5))
            out.append(Scenario(
                id=f"{fault}-{i:02d}", machine_id=MACHINE, fault=fault, severity=severity,
                onset_h=onset_h, duration_h=duration_h, noise_mult=noise_mult, seed=seed,
                horizon_h=onset_h + duration_h + 2))
    for i in range(10):
        seed = 2000 + i
        rng = np.random.default_rng(seed)
        out.append(Scenario(
            id=f"healthy-{i:02d}", machine_id=MACHINE, fault=None, severity=1.0, onset_h=0.0,
            duration_h=None, noise_mult=float(rng.uniform(0.8, 1.5)), seed=seed, horizon_h=72.0))
    return out


def _snapshot(e: Engine) -> Engine:
    """Deep copy of the engine without its hooks (they may hold references we do not want to copy)."""
    hooks = (e.on_anomaly, e.on_threshold, e.on_tick)
    e.on_anomaly, e.on_threshold, e.on_tick = [], [], []
    try:
        return copy.deepcopy(e)
    finally:
        e.on_anomaly, e.on_threshold, e.on_tick = hooks


def run_scenario(s: Scenario) -> ScenarioRun:
    e = Engine(seed=s.seed, only=[s.machine_id], noise_mult=s.noise_mult)
    e.auto_pause_on_alert = False                  # nobody is there to click "resume"
    events: list[AnomalyEvent] = []
    e.on_anomaly.append(events.append)
    run = ScenarioRun(scenario=s)
    onset_step = round(s.onset_h * 12)             # 12 samples per hour
    seen = 0
    for i in range(round(s.horizon_h * 12)):
        if s.fault and i == onset_step:
            e.inject(s.machine_id, s.fault, s.severity, s.duration_h)
            run.injected_at = e.sim_time
        e.step(1)
        while seen < len(events):                  # look at events raised by this step
            ev = events[seen]
            seen += 1
            if s.fault is None:
                run.healthy_events += 1
            elif run.injected_at is None:
                run.pre_onset_events += 1          # a false alarm before the fault existed
            elif run.event is None:
                run.event = ev
                run.engine_at_event = _snapshot(e)
        if e.is_failed(s.machine_id):
            break
    th = e.threshold_alarm(s.machine_id)
    if th:
        run.threshold_at, run.threshold_signal = th
    failures = [mk.t for mk in e.markers(s.machine_id) if mk.kind == "failure"]
    run.failure_at = failures[0] if failures else None
    return run