from datetime import timedelta

from backend.app.sim.faults import DEFAULT_DURATION_H
from eval.scenarios import make_scenarios, run_scenario


def test_scenario_list_shape():
    sc = make_scenarios()
    assert len(sc) == 50
    assert len({s.id for s in sc}) == 50
    assert sum(1 for s in sc if s.fault is None) == 10
    for fault, default in DEFAULT_DURATION_H.items():
        group = [s for s in sc if s.fault == fault]
        assert len(group) == 10
        for s in group:
            assert 0.7 <= s.severity <= 1.3
            assert 6 <= s.onset_h <= 24
            assert 0.8 * default <= s.duration_h <= 1.2 * default
            assert 0.8 <= s.noise_mult <= 1.5
            assert abs(s.horizon_h - (s.onset_h + s.duration_h + 2)) < 1e-9


def test_scenarios_are_deterministic():
    assert make_scenarios() == make_scenarios()


def test_fault_scenario_run():
    s = next(x for x in make_scenarios() if x.fault == "bearing_wear")
    run = run_scenario(s)
    assert run.injected_at is not None
    assert run.event is not None
    assert run.injected_at < run.event.detected_at <= run.injected_at + timedelta(hours=12)
    assert run.engine_at_event is not None
    assert run.engine_at_event.sim_time == run.event.detected_at
    assert run.engine_at_event.on_anomaly == []
    assert run.failure_at is not None
    took_h = (run.failure_at - run.injected_at).total_seconds() / 3600
    assert abs(took_h - s.duration_h) <= 5 / 60 + 1e-6    # the pump trips when the fault is complete
    if run.threshold_at is not None:
        assert run.injected_at < run.threshold_at <= run.failure_at


def test_healthy_scenario_run():
    s = next(x for x in make_scenarios() if x.fault is None)
    run = run_scenario(s)
    assert run.injected_at is None and run.event is None
    assert run.failure_at is None and run.threshold_at is None
    assert run.healthy_events <= 1