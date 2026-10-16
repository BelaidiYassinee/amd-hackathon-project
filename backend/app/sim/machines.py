from __future__ import annotations

import math
from datetime import datetime

import numpy as np

from backend.app.sim.faults import TRIP_VALUES, Fault


class LoadModel:
    """Plant-wide production load, one series shared by all machines."""

    def __init__(self, cfg: dict, seed: int):
        self.c = cfg["load"]
        self.rng = np.random.default_rng(seed)
        self.noise = 0.0

    def next(self, t: datetime) -> float:
        c = self.c
        hour = t.hour + t.minute / 60.0
        self.noise = (c["ar"] * self.noise
                      + math.sqrt(1 - c["ar"] ** 2) * self.rng.normal(0, c["noise"]))
        v = (c["mean"] + c["amplitude"] * math.cos(2 * math.pi * (hour - c["peak_hour"]) / 24)
             + self.noise)
        return float(min(max(v, c["min"]), c["max"]))


class MachineSim:
    """One machine. `index` is its position in the FULL machines list, so that
    Engine(only=[...]) produces exactly the same data for that machine."""

    def __init__(self, cfg: dict, index: int, seed: int, noise_mult: float = 1.0):
        self.cfg = cfg
        self.id = cfg["id"]
        self.signals = cfg["signals"]
        self.rng = np.random.default_rng(seed * 100 + index)
        self.noise_mult = noise_mult
        self.ar_state = {s["name"]: 0.0 for s in self.signals}
        self.fault: Fault | None = None
        self.failed = False
        self.just_tripped = False
        self.last: dict[str, float] = {}

    def clear_fault(self) -> None:
        self.fault = None
        self.failed = False
        self.just_tripped = False

    def step(self, t: datetime, load_pct: float) -> dict[str, float]:
        self.just_tripped = False

        # always draw the noise, so the random stream does not depend on the fault state
        noise = {}
        for s in self.signals:
            ar = s.get("ar", 0.0)
            sd = s["noise"] * self.noise_mult
            n = ar * self.ar_state[s["name"]] + math.sqrt(1 - ar * ar) * self.rng.normal(0, sd)
            self.ar_state[s["name"]] = n
            noise[s["name"]] = n

        if self.fault and not self.failed and self.fault.progress(t) >= 1.0:
            self.failed = True
            self.just_tripped = True

        values: dict[str, float] = {}
        for s in self.signals:
            name = s["name"]
            if self.failed:
                if name in TRIP_VALUES:
                    values[name] = TRIP_VALUES[name]
                elif s["unit"] == "°C":
                    prev = self.last.get(name, s["base"])
                    values[name] = prev + (25.0 - prev) * 0.05
                else:
                    values[name] = 0.0
            else:
                v = s["base"] + s["load_coef"] * (load_pct - 75) / 25
                nf, delta = 1.0, 0.0
                if self.fault:
                    nf = self.fault.noise_factor(name, t)
                    delta = self.fault.delta(name, t)
                values[name] = v + noise[name] * nf + delta
        self.last = dict(values)
        return values