from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from backend.app.config import load_config, sim_start
from backend.app.detect.detector import BaselineStat, Detector  # noqa: F401 (re-exported)
from backend.app.detect.threshold import ThresholdMonitor
from backend.app.models import Contribution
from backend.app.sim.faults import Fault
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


class Engine:
    def __init__(self, seed: int = 7, only: list[str] | None = None, noise_mult: float = 1.0):
        cfg = load_config()
        self.cfg = cfg
        sim_cfg, det_cfg = cfg["sim"], cfg["detector"]
        self.sample_minutes: int = sim_cfg["sample_minutes"]
        self.step_td = timedelta(minutes=self.sample_minutes)
        self.ewma_limit: float = det_cfg["ewma_limit"]
        self.speed: int = sim_cfg["default_speed"]
        self.paused = False
        self.auto_pause_on_alert: bool = sim_cfg["auto_pause_on_alert"]
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

    # ---------- write ----------
    def step(self, n: int = 1) -> None:
        for _ in range(n):
            if self.paused:
                break
            self._advance()

    def _advance(self) -> None:
        self.sim_time += self.step_td
        t = self.sim_time
        load = self._load.next(t)                          # drawn ONCE for the whole plant
        for m in self._m.values():
            values = m.sim.step(t, load)
            if m.sim.failed:                               # tripped: freeze the detector
                prev = m.samples[-1]
                score, scores, health = prev.score, dict(prev.scores), 0
            else:
                score, scores = m.detector.update(values, load)
                health = m.detector.health(score)
            m.samples.append(Sample(t, {**values, "load_pct": load}, score, scores, health))
            if len(m.samples) > MAX_SAMPLES:
                del m.samples[: len(m.samples) - MAX_SAMPLES]
            m.threshold.update(t, values)                  # the legacy alarm records when it fires

    def inject(self, machine_id: str, fault: str, severity: float = 1.0,
               duration_h: float | None = None) -> None:
        m = self._m[machine_id]
        if m.cfg["type"] != "centrifugal_pump":
            raise ValueError(f"{machine_id} is not a centrifugal pump: faults only apply to pumps")
        if m.sim.fault is not None:
            raise ValueError(f"{machine_id} already has an active fault")
        m.sim.fault = Fault.create(fault, severity, self.sim_time, duration_h)