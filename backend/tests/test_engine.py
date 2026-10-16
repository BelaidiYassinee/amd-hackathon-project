from datetime import timedelta

import pytest

from backend.app.config import load_config, sim_start
from backend.app.sim.engine import Engine

HIST = 72 * 12


def first_event_index(samples, limit, k):
    """Index of the sample where the score has been >= limit for k samples in a row."""
    run = 0
    for i, s in enumerate(samples):
        run = run + 1 if s.score >= limit else 0
        if run == k:
            return i
    return None


def test_history_and_clock():
    e = Engine(seed=7)
    assert e.machine_ids() == ["P-101", "P-102", "C-201", "M-301"]
    for mid in e.machine_ids():
        assert len(e.samples(mid)) == HIST
    assert e.sim_time == sim_start(load_config())


def test_step_advances_clock_and_respects_pause():
    e = Engine(seed=7, only=["P-101"])
    t0 = e.sim_time
    e.step(12)
    assert e.sim_time == t0 + timedelta(hours=1)
    assert len(e.samples("P-101")) == HIST + 12
    e.paused = True
    e.step(5)
    assert e.sim_time == t0 + timedelta(hours=1)


def test_only_gives_identical_data():
    full = Engine(seed=7)
    solo = Engine(seed=7, only=["P-101"])
    full.step(120)
    solo.step(120)
    assert [s.values for s in full.samples("P-101")] == [s.values for s in solo.samples("P-101")]


def test_inject_rules():
    e = Engine(seed=7)
    with pytest.raises(ValueError):
        e.inject("C-201", "bearing_wear")          # a compressor cannot get a pump fault
    e.inject("P-101", "cavitation")
    with pytest.raises(ValueError):
        e.inject("P-101", "bearing_wear")          # already has a fault


def test_bearing_wear_through_the_engine():
    e = Engine(seed=7, only=["P-101"])
    e.step(24)                                     # 2 h of live time
    t_onset = e.sim_time
    e.inject("P-101", "bearing_wear")
    e.step(12 * 60)                                # 60 h: enough to reach failure
    live = e.samples("P-101")[HIST:]
    idx = first_event_index(live, e.ewma_limit, e.cfg["detector"]["k_consecutive"])
    assert idx is not None
    t_event = live[idx].t
    assert t_onset < t_event <= t_onset + timedelta(hours=6)
    legacy = e.threshold_alarm("P-101")
    assert legacy is not None and legacy[1] == "vibration_rms"
    assert legacy[0] > t_event + timedelta(hours=30)
    assert e.is_failed("P-101")
    assert e.samples("P-101")[-1].health == 0