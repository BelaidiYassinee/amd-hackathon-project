from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from backend.app.models import Contribution


@dataclass
class BaselineStat:
    intercept: float      # value = intercept + load_slope * load_pct + residual
    load_slope: float
    resid_median: float
    sigma: float          # 1.4826 * MAD of residuals
    typical: float        # expected value at load_pct = 75


class Detector:
    """Load-regressed robust z-score + EWMA drift, one instance per machine."""

    def __init__(self, signals: list[dict], cfg: dict):
        self.signals = signals
        self.names = [s["name"] for s in signals]
        self.alpha = cfg["ewma_alpha"]
        self.limit = cfg["ewma_limit"]
        self.k = cfg["k_consecutive"]
        self.floor_ratio = cfg["sigma_floor_ratio"]
        self.dev_ratio = cfg["deviation_ratio"]            # new
        self.slope_window_h = cfg["slope_window_h"]        # new
        self.baseline: dict[str, BaselineStat] = {}
        self.e = {n: 0.0 for n in self.names}     # EWMA state per signal
        self.z = {n: 0.0 for n in self.names}     # latest z-score per signal
        self.above = 0                            # consecutive samples with score >= limit

    def fit(self, loads: list[float], history: list[dict[str, float]]) -> None:
        load = np.asarray(loads, dtype=float)
        for s in self.signals:
            x = np.asarray([h[s["name"]] for h in history], dtype=float)
            slope, intercept = np.polyfit(load, x, 1)
            resid = x - (intercept + slope * load)
            m_r = float(np.median(resid))
            mad = float(np.median(np.abs(resid - m_r)))
            sigma = max(1.4826 * mad, self.floor_ratio * s["noise"])
            self.baseline[s["name"]] = BaselineStat(
                intercept=float(intercept), load_slope=float(slope),
                resid_median=m_r, sigma=sigma, typical=float(intercept + slope * 75))

    def reset(self) -> None:
        self.e = {n: 0.0 for n in self.names}
        self.z = {n: 0.0 for n in self.names}
        self.above = 0

    def update(self, values: dict[str, float], load: float) -> tuple[float, dict[str, float]]:
        scores: dict[str, float] = {}
        for n in self.names:
            b = self.baseline[n]
            z = (values[n] - b.intercept - b.load_slope * load - b.resid_median) / b.sigma
            z = max(-20.0, min(20.0, z))          # clip, so one crazy value cannot dominate
            self.z[n] = z
            self.e[n] = self.alpha * z + (1 - self.alpha) * self.e[n]
            scores[n] = abs(self.e[n])
        score = max(scores.values())
        self.above = self.above + 1 if score >= self.limit else 0
        return score, scores

    def health(self, score: float) -> int:
        return int(max(0, min(100, round(100 - 50 * score / self.limit))))

    def contributions(self, samples: list, sample_minutes: int) -> list[Contribution]:
        """samples: objects with .t, .values and .scores (oldest first). One Contribution per signal."""
        if not samples:
            return []
        n_win = max(2, int(self.slope_window_h * 60 / sample_minutes))
        window = samples[-n_win:]
        hours = np.arange(len(window)) * (sample_minutes / 60.0)
        last = samples[-1]
        thr = self.dev_ratio * self.limit
        out: list[Contribution] = []
        for name in self.names:
            ys = np.asarray([s.values[name] for s in window], dtype=float)
            slope = float(np.polyfit(hours, ys, 1)[0]) if len(window) > 1 else 0.0
            score = last.scores[name]
            since = None
            if score >= thr:
                since = last.t
                for s in reversed(samples):
                    if s.scores[name] >= thr:
                        since = s.t
                    else:
                        break
            out.append(Contribution(
                signal=name, score=round(score, 3), z=round(self.z[name], 2),
                slope_per_h=round(slope, 5),
                direction="up" if self.e[name] >= 0 else "down",
                deviating_since=since))
        out.sort(key=lambda c: c.score, reverse=True)
        return out