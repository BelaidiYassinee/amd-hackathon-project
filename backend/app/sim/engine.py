from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Callable

from backend.app.config import load_config, sim_start
from backend.app.detect.detector import BaselineStat, Detector  # noqa: F401 (re-exported)
from backend.app.detect.threshold import ThresholdMonitor
from backend.app.models import (AnomalyEvent, Contribution, FaultType, MachineSummary,
                                Marker, MarkerKind, PlantState, SignalSpec)
from backend.app.sim.faults import FAILURE_LABEL, Fault
from backend.app.sim.machines import LoadModel, MachineSim

MAX_SAMPLES = 7 * 24 * 12  # keep 7 sim-days of 5-minute samples


@dataclass
class Sample:
    t: datetime
    values: dict[str, float]        # every signal + "load_pct"
    score: float                    # max |EWMA z| over signals
    scores: dict[str, float]        # per-signal |EWMA z|
    health: int


@dataclass
class _Machine:
    cfg: dict
    sim: MachineSim
    detector: Detector
    threshold: ThresholdMonitor
    samples: list = field(default_factory=list)
    markers: list = field(default_factory=list)
    active_alert: str | None = None
    suppress_until: datetime | None = None
    injected_fault: str | None = None
    event_emitted: bool = False     # one event per streak above the limit


class Engine:
    def __init__(self, seed: int = 7, only: list[str] | None = None, noise_mult: float = 1.0):
        cfg = load_config()
        self.cfg = cfg
        sim_cfg, det_cfg = cfg["sim"], cfg["detector"]
        self.sample_minutes: int = sim_cfg["sample_minutes"]
        self.step_td = timedelta(minutes=self.sample_minutes)
        self.ewma_limit: float = det_cfg["ewma_limit"]
        self.watch_ratio: float = det_cfg["watch_ratio"]
        self.speed: int = sim_cfg["default_speed"]
        self.paused = False
        self.auto_pause_on_alert: bool = sim_cfg["auto_pause_on_alert"]
        self.on_anomaly: list[Callable[[AnomalyEvent], None]] = []
        self.on_threshold: list[Callable[[str, datetime, str], None]] = []
        self.on_tick: list[Callable[[datetime], None]] = []
        self._evt_counter = 0
        self._load = LoadModel(cfg, seed)
        self._m: dict[str, _Machine] = {}
        for idx, mcfg in enumerate(cfg["machines"]):      # idx is the position in the FULL list
            if only is not None and mcfg["id"] not in only:
                continue
            self._m[mcfg["id"]] = _Machine(
                cfg=mcfg,
                sim=MachineSim(mcfg, idx, seed, noise_mult),
                detector=Detector(mcfg["signals"], det_cfg),
                threshold=ThresholdMonitor(mcfg["signals"], det_cfg["threshold_consecutive"]))
        self._build_history(sim_cfg)

    # ---------- setup ----------
    def _build_history(self, sim_cfg: dict) -> None:
        start = sim_start(self.cfg)
        n = int(sim_cfg["history_hours"] * 60 / self.sample_minutes)
        self.sim_time = start - timedelta(hours=sim_cfg["history_hours"])
        times: list[datetime] = []
        loads: list[float] = []
        raw: dict[str, list[dict[str, float]]] = {mid: [] for mid in self._m}
        for _ in range(n):                                 # 1. generate healthy history
            self.sim_time += self.step_td
            load = self._load.next(self.sim_time)
            times.append(self.sim_time)
            loads.append(load)
            for mid, m in self._m.items():
                raw[mid].append(m.sim.step(self.sim_time, load))
        for mid, m in self._m.items():
            m.detector.fit(loads, raw[mid])                # 2. learn "normal"
            for t, load, values in zip(times, loads, raw[mid]):   # 3. warm-up replay
                score, scores = m.detector.update(values, load)
                m.samples.append(Sample(t, {**values, "load_pct": load}, score, scores,
                                        m.detector.health(score)))
            m.detector.above = 0                           # warm-up never counts toward an event
        # self.sim_time is now exactly the live start

    # ---------- read ----------
    def machine_ids(self) -> list[str]:
        return list(self._m)

    def machine_cfg(self, machine_id: str) -> dict:
        return self._m[machine_id].cfg

    def signal_specs(self, machine_id: str) -> list[SignalSpec]:
        return [SignalSpec(name=s["name"], label=s["label"], unit=s["unit"],
                           alarm_high=s.get("alarm_high"), alarm_low=s.get("alarm_low"))
                for s in self._m[machine_id].cfg["signals"]]

    def samples(self, machine_id: str, hours: float | None = None) -> list[Sample]:
        data = self._m[machine_id].samples
        if hours is None:
            return list(data)
        cutoff = self.sim_time - timedelta(hours=hours)
        i = len(data)
        while i > 0 and data[i - 1].t > cutoff:
            i -= 1
        return data[i:]

    def baseline(self, machine_id: str) -> dict[str, BaselineStat]:
        return self._m[machine_id].detector.baseline

    def contributions(self, machine_id: str) -> list[Contribution]:
        m = self._m[machine_id]
        return m.detector.contributions(m.samples, self.sample_minutes)

    def threshold_alarm(self, machine_id: str) -> tuple[datetime, str] | None:
        return self._m[machine_id].threshold.fired

    def is_failed(self, machine_id: str) -> bool:
        return self._m[machine_id].sim.failed

    def markers(self, machine_id: str) -> list[Marker]:
        return sorted(self._m[machine_id].markers, key=lambda mk: mk.t)

    def _status(self, m: _Machine) -> str:
        if m.sim.failed:
            return "down"
        if m.active_alert:
            return "alert"
        if m.samples and m.samples[-1].score >= self.watch_ratio * self.ewma_limit:
            return "watch"
        return "ok"

    def plant_state(self) -> PlantState:
        machines = []
        for mid, m in self._m.items():
            last = m.samples[-1]
            machines.append(MachineSummary(
                id=mid, name=m.cfg["name"], type=m.cfg["type"], area=m.cfg["area"],
                model=m.cfg["model"], status=self._status(m), health=last.health,
                active_alert_id=m.active_alert, injected_fault=m.injected_fault,
                signals=self.signal_specs(mid),
                latest={k: round(v, 3) for k, v in last.values.items() if k != "load_pct"},
                sparkline=[s.health for s in m.samples[-60:]]))
        return PlantState(
            sim_time=self.sim_time, speed=self.speed, paused=self.paused,
            auto_pause_on_alert=self.auto_pause_on_alert, machines=machines,
            open_alerts=sum(1 for m in self._m.values() if m.active_alert))

    # ---------- write ----------
    def step(self, n: int = 1) -> None:
        for _ in range(n):
            if self.paused:
                break
            self._advance()
        for hook in list(self.on_tick):
            hook(self.sim_time)

    def _advance(self) -> None:
        self.sim_time += self.step_td
        t = self.sim_time
        load = self._load.next(t)                          # drawn ONCE for the whole plant
        thresholds: list[tuple[str, str, str]] = []        # (machine_id, signal, label)
        events: list[AnomalyEvent] = []

        for mid, m in self._m.items():                     # 1. update EVERY machine first
            values = m.sim.step(t, load)
            if m.sim.just_tripped:
                self._add_marker(m, "failure", t,
                                 f"{mid} tripped: {FAILURE_LABEL[m.sim.fault.fault]}")
                if self.auto_pause_on_alert:
                    self.paused = True
            if m.sim.failed:                               # tripped: freeze the detector
                prev = m.samples[-1]
                score, scores, health = prev.score, dict(prev.scores), 0
            else:
                score, scores = m.detector.update(values, load)
                health = m.detector.health(score)
                if score < self.ewma_limit:
                    m.event_emitted = False                # the streak ended: re-arm
            m.samples.append(Sample(t, {**values, "load_pct": load}, score, scores, health))
            if len(m.samples) > MAX_SAMPLES:
                del m.samples[: len(m.samples) - MAX_SAMPLES]

            fired = m.threshold.update(t, values)
            if fired:
                sig, label = fired
                self._add_marker(m, "threshold_alarm", t, label, sig)
                thresholds.append((mid, sig, label))
            if self._should_emit(m, t):
                m.event_emitted = True
                events.append(self._make_event(mid, t))

        for mid, sig, _label in thresholds:                # 2. only now: markers, pause, hooks
            for hook in list(self.on_threshold):
                hook(mid, t, sig)
        for event in events:
            self._add_marker(self._m[event.machine_id], "ai_detected", t,
                             f"AI detected anomaly ({event.id})")
        if events and self.auto_pause_on_alert:
            self.paused = True                             # BEFORE the hooks, as the contract says
        for event in events:
            for hook in list(self.on_anomaly):
                hook(event)

    def _should_emit(self, m: _Machine, t: datetime) -> bool:
        if m.sim.failed or m.event_emitted or m.active_alert is not None:
            return False
        if m.suppress_until is not None and t < m.suppress_until:
            return False
        return m.detector.above >= m.detector.k

    def _make_event(self, mid: str, t: datetime) -> AnomalyEvent:
        contribs = self.contributions(mid)
        firsts = [c.deviating_since for c in contribs
                  if c.score >= self.ewma_limit and c.deviating_since is not None]
        self._evt_counter += 1
        return AnomalyEvent(
            id=f"EVT-{self._evt_counter:04d}", machine_id=mid, detected_at=t,
            first_deviation_at=min(firsts) if firsts else t,
            score=round(max(c.score for c in contribs), 3), contributions=contribs)

    def _add_marker(self, m: _Machine, kind: str, t: datetime, label: str,
                    signal: str | None = None) -> None:
        m.markers.append(Marker(kind=kind, t=t, label=label, signal=signal))

    def inject(self, machine_id: str, fault: FaultType, severity: float = 1.0,
               duration_h: float | None = None) -> None:
        m = self._m[machine_id]
        if m.cfg["type"] != "centrifugal_pump":
            raise ValueError(f"{machine_id} is not a centrifugal pump: faults only apply to pumps")
        if m.sim.fault is not None:
            raise ValueError(f"{machine_id} already has an active fault")
        m.sim.fault = Fault.create(fault, severity, self.sim_time, duration_h)
        m.injected_fault = fault
        self._add_marker(m, "fault_injected", self.sim_time,
                         f"Demo: {fault.replace('_', ' ')} injected")

    def clear_fault(self, machine_id: str) -> None:
        m = self._m[machine_id]
        m.sim.clear_fault()
        m.injected_fault = None
        m.detector.reset()
        m.threshold.reset()
        m.event_emitted = False

    def suppress(self, machine_id: str, hours: float) -> None:
        self._m[machine_id].suppress_until = self.sim_time + timedelta(hours=hours)

    def set_active_alert(self, machine_id: str, alert_id: str | None) -> None:
        m = self._m[machine_id]
        m.active_alert = alert_id
        if alert_id is None:
            m.event_emitted = False

    def add_marker(self, machine_id: str, kind: MarkerKind, t: datetime, label: str) -> None:
        self._add_marker(self._m[machine_id], kind, t, label)