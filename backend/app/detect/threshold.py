from __future__ import annotations

from datetime import datetime


class ThresholdMonitor:
    """The 'legacy alarm': raw value beyond its fixed limit for N consecutive samples."""

    def __init__(self, signals: list[dict], consecutive: int):
        self.consecutive = consecutive
        self.limits = [s for s in signals
                       if s.get("alarm_high") is not None or s.get("alarm_low") is not None]
        self.counts = {s["name"]: 0 for s in self.limits}
        self.fired: tuple[datetime, str] | None = None

    def reset(self) -> None:
        self.counts = {k: 0 for k in self.counts}
        self.fired = None

    def update(self, t: datetime, values: dict[str, float]) -> tuple[str, str] | None:
        """Returns (signal, marker_label) the first time the alarm fires, else None."""
        if self.fired is not None:
            return None
        for s in self.limits:
            name = s["name"]
            v = values[name]
            hi, lo = s.get("alarm_high"), s.get("alarm_low")
            if hi is not None and v > hi:
                op, limit = ">", hi
            elif lo is not None and v < lo:
                op, limit = "<", lo
            else:
                self.counts[name] = 0
                continue
            self.counts[name] += 1
            if self.counts[name] >= self.consecutive:
                self.fired = (t, name)
                return name, f"Legacy alarm: {s['label']} {v:.1f} {s['unit']} {op} {limit}"
        return None