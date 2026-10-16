"""Fake Engine for fast unit tests (P2): the read methods of the 00 §8 Engine, shaped like 00 §14.

P-101 only. The clock stands at 2026-10-15T09:40:00Z (the §14 scenario). There are 48 h of
samples every 5 minutes, healthy except for vibration_hf, which rises 0.048 g/h during the
last 2 h (early bearing wear). contributions() returns the 00 §14.3 list as-is, so it does not
exactly match the scores recomputed from the samples. Write methods are no-ops.

Use the real Engine (P1) for integration tests; keep this one for quick unit tests.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import yaml

from backend.app.models import AnomalyEvent, Contribution, Marker, SignalSpec

UTC = timezone.utc
NOW = datetime(2026, 10, 15, 9, 40, tzinfo=UTC)
FAULT_START = NOW - timedelta(hours=2)
FIRST_DEVIATION = datetime(2026, 10, 15, 8, 55, tzinfo=UTC)
STEP = timedelta(minutes=5)
HF_SLOPE_PER_H = 0.048
MACHINES_YAML = Path(__file__).resolve().parents[1] / "data" / "machines.yaml"


@dataclass
class Sample:
    t: datetime
    values: dict[str, float]  # every signal + "load_pct"
    score: float  # max |EWMA z| over signals
    scores: dict[str, float]  # per-signal |EWMA z|
    health: int


@dataclass
class BaselineStat:
    intercept: float  # value = intercept + load_slope * load_pct + residual
    load_slope: float
    resid_median: float
    sigma: float
    typical: float  # expected value at load_pct = 75


def _c(signal, score, z, slope, direction, since=None) -> Contribution:
    return Contribution(signal=signal, score=score, z=z, slope_per_h=slope, direction=direction,
                        deviating_since=since)


# 00 §14.3, sorted by score desc
CONTRIBUTIONS = [
    _c("vibration_hf", 1.62, 3.9, 0.048, "up", FIRST_DEVIATION),
    _c("vibration_rms", 0.41, 1.1, 0.021, "up"),
    _c("bearing_temp", 0.22, 0.6, 0.05, "up"),
    _c("motor_current", 0.12, 0.3, 0.01, "up"),
    _c("motor_temp", 0.1, -0.2, 0.0, "down"),
    _c("flow", 0.08, 0.1, 0.1, "up"),
    _c("discharge_pressure", 0.05, -0.1, 0.0, "down"),
]


def fake_event() -> AnomalyEvent:
    """The 00 §14.3 anomaly event EVT-0001."""
    return AnomalyEvent(id="EVT-0001", machine_id="P-101", detected_at=NOW, first_deviation_at=FIRST_DEVIATION,
                        score=1.62, contributions=[c.model_copy() for c in CONTRIBUTIONS])


def _p101_cfg() -> dict:
    with open(MACHINES_YAML, encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return next(m for m in cfg["machines"] if m["id"] == "P-101")


class FakeEngine:
    def __init__(self, seed: int = 7, hours: float = 48, ewma_limit: float = 1.5):
        self.sim_time = NOW
        self.speed = 6
        self.paused = True
        self.auto_pause_on_alert = True
        self.ewma_limit = ewma_limit
        self.on_anomaly: list = []
        self.on_threshold: list = []
        self.on_tick: list = []
        self._cfg = _p101_cfg()
        self._baseline = {
            s["name"]: BaselineStat(intercept=s["base"] - 3 * s["load_coef"], load_slope=s["load_coef"] / 25,
                                    resid_median=0.0, sigma=s["noise"], typical=s["base"])
            for s in self._cfg["signals"]
        }
        self._samples = self._generate(seed, hours)
        self._markers = [
            Marker(kind="fault_injected", t=FAULT_START, label="Demo: bearing_wear injected"),
            Marker(kind="ai_detected", t=NOW, label="AI detected anomaly (EVT-0001)"),
        ]

    def _generate(self, seed: int, hours: float) -> list[Sample]:
        """Healthy values per the P1 formula (no AR noise), plus the vibration_hf ramp."""
        rng = random.Random(seed)
        n = int(hours * 12)
        ewma = {s["name"]: 0.0 for s in self._cfg["signals"]}
        out = []
        for i in range(n + 1):
            t = NOW - STEP * (n - i)
            hour = t.hour + t.minute / 60
            load = min(100.0, max(40.0, 75 + 12 * math.cos(2 * math.pi * (hour - 15) / 24) + rng.gauss(0, 3)))
            values = {}
            for s in self._cfg["signals"]:
                name = s["name"]
                v = s["base"] + s["load_coef"] * (load - 75) / 25 + rng.gauss(0, s["noise"])
                if name == "vibration_hf" and t > FAULT_START:
                    v += HF_SLOPE_PER_H * (t - FAULT_START).total_seconds() / 3600
                b = self._baseline[name]
                z = (v - b.intercept - b.load_slope * load - b.resid_median) / b.sigma
                ewma[name] = 0.1 * z + 0.9 * ewma[name]
                values[name] = round(v, 3)
            values["load_pct"] = round(load, 1)
            scores = {k: round(abs(e), 3) for k, e in ewma.items()}
            score = max(scores.values())
            health = min(100, max(0, round(100 - 50 * score / self.ewma_limit)))
            out.append(Sample(t=t, values=values, score=score, scores=scores, health=health))
        return out

    def _check(self, machine_id: str) -> None:
        if machine_id != "P-101":
            raise KeyError(f"unknown machine {machine_id}")

    # --- read ---
    def machine_ids(self) -> list[str]:
        return ["P-101"]

    def machine_cfg(self, machine_id: str) -> dict:
        self._check(machine_id)
        return self._cfg

    def signal_specs(self, machine_id: str) -> list[SignalSpec]:
        self._check(machine_id)
        return [SignalSpec(name=s["name"], label=s["label"], unit=s["unit"],
                           alarm_high=s.get("alarm_high"), alarm_low=s.get("alarm_low"))
                for s in self._cfg["signals"]]

    def samples(self, machine_id: str, hours: float | None = None) -> list[Sample]:
        self._check(machine_id)
        if hours is None:
            return list(self._samples)
        since = self.sim_time - timedelta(hours=hours)
        return [s for s in self._samples if s.t > since]

    def baseline(self, machine_id: str) -> dict[str, BaselineStat]:
        self._check(machine_id)
        return dict(self._baseline)

    def contributions(self, machine_id: str) -> list[Contribution]:
        self._check(machine_id)
        return [c.model_copy() for c in CONTRIBUTIONS]

    def threshold_alarm(self, machine_id: str) -> tuple[datetime, str] | None:
        self._check(machine_id)
        return None

    def is_failed(self, machine_id: str) -> bool:
        self._check(machine_id)
        return False

    def markers(self, machine_id: str) -> list[Marker]:
        self._check(machine_id)
        return list(self._markers)

    # --- write (no-ops) ---
    def step(self, n: int = 1) -> None: ...
    def inject(self, machine_id, fault, severity=1.0, duration_h=None) -> None: ...
    def clear_fault(self, machine_id: str) -> None: ...
    def suppress(self, machine_id: str, hours: float) -> None: ...
    def set_active_alert(self, machine_id: str, alert_id: str | None) -> None: ...

    def add_marker(self, machine_id, kind, t, label) -> None:
        self._markers.append(Marker(kind=kind, t=t, label=label))
