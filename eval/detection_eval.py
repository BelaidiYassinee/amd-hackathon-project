from __future__ import annotations

import statistics

from eval.scenarios import FAULTS, ScenarioRun


def _h(a, b) -> float:
    return (b - a).total_seconds() / 3600


def _pct(a: int, b: int):
    return round(100 * a / b, 1) if b else None


def _stats(xs: list[float]) -> dict:
    if not xs:
        return {"n": 0, "mean": None, "median": None, "min": None}
    return {"n": len(xs), "mean": round(statistics.mean(xs), 2),
            "median": round(statistics.median(xs), 2), "min": round(min(xs), 2)}


def _summarize(runs: list[ScenarioRun]) -> dict:
    n = len(runs)
    detected = [r for r in runs if r.event is not None]
    legacy_fired = [r for r in runs if r.threshold_at is not None]
    both = [r for r in detected if r.threshold_at is not None]
    wins = [r for r in detected if r.threshold_at is None or r.threshold_at > r.event.detected_at]
    return {
        "runs": n,
        "detected": len(detected),
        "detection_rate_pct": _pct(len(detected), n),
        "detection_delay_h": _stats([_h(r.injected_at, r.event.detected_at) for r in detected]),
        "legacy_fired": len(legacy_fired),
        "legacy_missed": n - len(legacy_fired),
        "lead_time_h": _stats([_h(r.event.detected_at, r.threshold_at) for r in both]),
        "ai_earlier": len(wins),
        "ai_earlier_pct": _pct(len(wins), n),
        "ai_warning_before_failure_h": _stats(
            [_h(r.event.detected_at, r.failure_at) for r in detected if r.failure_at]),
        "legacy_warning_before_failure_h": _stats(
            [_h(r.threshold_at, r.failure_at) for r in legacy_fired if r.failure_at]),
        "pre_onset_false_alarm_runs": sum(1 for r in runs if r.pre_onset_events > 0),
    }


def evaluate(runs: list[ScenarioRun]) -> dict:
    fault_runs = [r for r in runs if r.scenario.fault is not None]
    healthy = [r for r in runs if r.scenario.fault is None]
    overall = _summarize(fault_runs)
    false_alarm_runs = sum(1 for r in healthy if r.healthy_events > 0)
    return {
        "overall": overall,
        "per_fault": {f: _summarize([r for r in fault_runs if r.scenario.fault == f])
                      for f in FAULTS},
        "healthy": {"runs": len(healthy), "runs_with_false_alarm": false_alarm_runs,
                    "total_false_events": sum(r.healthy_events for r in healthy)},
        "pass_bars": {
            "ai_earlier_at_least_90pct": (overall["ai_earlier_pct"] or 0) >= 90,
            "false_alarm_runs_at_most_1": false_alarm_runs <= 1,
        },
    }