from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

DEFAULT_DURATION_H = {"bearing_wear": 48.0, "cavitation": 20.0,
                      "misalignment": 72.0, "motor_overheat": 36.0}

# fault -> signal -> (magnitude, p, noise_gain)
FAULT_TABLE: dict[str, dict[str, tuple[float, float, float]]] = {
    "bearing_wear": {
        "vibration_hf": (2.4, 1.0, 0.0),
        "vibration_rms": (7.0, 2.2, 2.0),
        "bearing_temp": (34.0, 2.5, 0.0),
        "motor_current": (4.0, 3.0, 0.0),
    },
    "cavitation": {
        "discharge_pressure": (-1.2, 0.8, 5.0),
        "flow": (-28.0, 0.8, 3.0),
        "vibration_rms": (3.0, 1.2, 3.0),
        "vibration_hf": (0.9, 1.0, 1.0),
        "motor_current": (-5.0, 1.0, 0.0),
    },
    "misalignment": {
        "vibration_rms": (6.5, 1.3, 0.5),
        "vibration_hf": (0.25, 1.5, 0.0),
        "bearing_temp": (18.0, 1.8, 0.0),
        "motor_current": (7.0, 1.5, 0.0),
        "motor_temp": (10.0, 1.5, 0.0),
    },
    "motor_overheat": {
        "motor_temp": (55.0, 2.0, 0.0),
        "motor_current": (9.0, 1.5, 0.0),
        "bearing_temp": (8.0, 2.0, 0.0),
    },
}

FAILURE_LABEL = {
    "bearing_wear": "bearing seized",
    "cavitation": "pump lost prime (severe cavitation)",
    "misalignment": "coupling failure from misalignment",
    "motor_overheat": "motor tripped on overtemperature",
}

# values of a tripped pump; temperatures (unit °C) decay toward 25 instead
TRIP_VALUES = {"flow": 0.0, "discharge_pressure": 0.2, "motor_current": 0.0,
               "vibration_rms": 0.3, "vibration_hf": 0.05}


@dataclass
class Fault:
    fault: str
    severity: float
    start: datetime
    duration_h: float

    @classmethod
    def create(cls, fault: str, severity: float, start: datetime,
               duration_h: float | None = None) -> "Fault":
        if fault not in FAULT_TABLE:
            raise ValueError(f"unknown fault {fault}")
        return cls(fault, severity, start, duration_h or DEFAULT_DURATION_H[fault])

    def progress(self, t: datetime) -> float:
        d = (t - self.start).total_seconds() / 3600.0 / self.duration_h
        return min(max(d, 0.0), 1.0)

    def delta(self, signal: str, t: datetime) -> float:
        spec = FAULT_TABLE[self.fault].get(signal)
        if spec is None:
            return 0.0
        magnitude, p, _ = spec
        return self.severity * magnitude * self.progress(t) ** p

    def noise_factor(self, signal: str, t: datetime) -> float:
        spec = FAULT_TABLE[self.fault].get(signal)
        if spec is None:
            return 1.0
        return 1.0 + spec[2] * self.progress(t)