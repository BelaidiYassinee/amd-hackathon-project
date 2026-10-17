from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from eval.detection_eval import evaluate
from eval.scenarios import Scenario, ScenarioRun

T0 = datetime(2026, 10, 15, 8, 0, tzinfo=timezone.utc)


def at(h):
    return T0 + timedelta(hours=h)


def sc(fault, sid):
    return Scenario(id=sid, machine_id="P-101", fault=fault, severity=1.0, onset_h=2.0,
                    duration_h=48.0, noise_mult=1.0, seed=0, horizon_h=60.0)


def fault_run(fault, sid, event_h, legacy_h, failure_h=48, pre=0):
    return ScenarioRun(
        scenario=sc(fault, sid), injected_at=T0,
        event=SimpleNamespace(detected_at=at(event_h)) if event_h is not None else None,
        threshold_at=at(legacy_h) if legacy_h is not None else None,
        failure_at=at(failure_h), pre_onset_events=pre)


def healthy_run(sid, events):
    return ScenarioRun(scenario=sc(None, sid), healthy_events=events)


def test_the_maths():
    runs = [
        fault_run("bearing_wear", "a", 2, 42),             # normal: AI at 2 h, legacy at 42 h
        fault_run("bearing_wear", "b", 3, None),           # legacy never fired
        fault_run("bearing_wear", "c", None, 44, pre=1),   # AI missed it, and had a false alarm
        fault_run("cavitation", "d", 5, 4),                # legacy came FIRST
        healthy_run("h1", 2),
        healthy_run("h2", 0),
    ]
    out = evaluate(runs)

    bw = out["per_fault"]["bearing_wear"]
    assert bw["runs"] == 3 and bw["detected"] == 2
    assert bw["detection_rate_pct"] == 66.7
    assert bw["detection_delay_h"]["mean"] == 2.5
    assert bw["legacy_fired"] == 2 and bw["legacy_missed"] == 1
    assert bw["lead_time_h"]["n"] == 1 and bw["lead_time_h"]["mean"] == 40.0
    assert bw["ai_earlier"] == 2 and bw["ai_earlier_pct"] == 66.7
    assert bw["ai_warning_before_failure_h"]["mean"] == 45.5
    assert bw["legacy_warning_before_failure_h"]["mean"] == 5.0
    assert bw["pre_onset_false_alarm_runs"] == 1

    cav = out["per_fault"]["cavitation"]
    assert cav["lead_time_h"]["mean"] == -1.0
    assert cav["ai_earlier"] == 0 and cav["ai_earlier_pct"] == 0.0

    assert out["overall"]["runs"] == 4
    assert out["overall"]["ai_earlier_pct"] == 50.0
    assert out["healthy"] == {"runs": 2, "runs_with_false_alarm": 1, "total_false_events": 2}
    assert out["pass_bars"] == {"ai_earlier_at_least_90pct": False,
                                "false_alarm_runs_at_most_1": True}
    assert out["per_fault"]["misalignment"]["runs"] == 0   # a fault with no runs does not crash