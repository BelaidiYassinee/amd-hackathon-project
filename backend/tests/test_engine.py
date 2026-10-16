from datetime import timedelta
from backend.app.models import PlantState
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
    e.auto_pause_on_alert = False 
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
def _run_to_failure(e, hours=60):
    e.inject("P-101", "bearing_wear")
    e.step(12 * hours)


def test_event_pauses_before_hooks_and_stops_the_clock():
    e = Engine(seed=7, only=["P-101"])
    seen = []
    e.on_anomaly.append(lambda ev: seen.append((ev, e.paused)))
    e.step(24)
    e.inject("P-101", "bearing_wear")
    e.step(12 * 60)
    assert len(seen) == 1
    event, paused_inside_hook = seen[0]
    assert paused_inside_hook is True
    assert e.paused is True
    assert e.sim_time == event.detected_at          # the clock stopped at the event
    assert event.machine_id == "P-101"
    assert event.first_deviation_at <= event.detected_at
    scores = [c.score for c in event.contributions]
    assert scores == sorted(scores, reverse=True)
    assert event.contributions[0].signal == "vibration_hf"


def test_no_second_event_while_an_alert_is_active():
    e = Engine(seed=7, only=["P-101"])
    events = []

    def hook(ev):
        events.append(ev)
        e.set_active_alert("P-101", "ALT-0001")

    e.on_anomaly.append(hook)
    e.inject("P-101", "bearing_wear")
    e.step(12 * 20)
    assert len(events) == 1 and e.paused
    assert e.plant_state().machines[0].status == "alert"
    e.paused = False
    e.step(12 * 20)
    assert len(events) == 1                          # still just one


def test_markers_come_out_in_the_right_order():
    e = Engine(seed=7, only=["P-101"])
    e.auto_pause_on_alert = False
    e.step(24)
    _run_to_failure(e)
    kinds = [mk.kind for mk in e.markers("P-101")]
    assert kinds == ["fault_injected", "ai_detected", "threshold_alarm", "failure"]
    assert e.plant_state().machines[0].status == "down"


def test_suppress_delays_the_event():
    e = Engine(seed=7, only=["P-101"])
    e.auto_pause_on_alert = False
    events = []
    e.on_anomaly.append(events.append)
    t0 = e.sim_time
    e.suppress("P-101", 12)
    e.inject("P-101", "bearing_wear")
    e.step(12 * 10)                                  # 10 h: still suppressed
    assert events == []
    e.step(12 * 4)                                   # up to 14 h
    assert len(events) == 1
    assert events[0].detected_at >= t0 + timedelta(hours=12)


def test_clear_fault_returns_the_machine_to_normal():
    e = Engine(seed=7, only=["P-101"])
    e.auto_pause_on_alert = False
    events = []
    e.on_anomaly.append(events.append)
    _run_to_failure(e)
    assert e.is_failed("P-101")
    n_events = len(events)
    e.clear_fault("P-101")
    e.step(12 * 4)
    assert not e.is_failed("P-101")
    assert len(events) == n_events                   # no new event after the repair
    assert e.plant_state().machines[0].status == "ok"


def test_plant_state_matches_the_contract():
    e = Engine(seed=7)
    ps = e.plant_state()
    assert isinstance(ps, PlantState)
    assert [m.id for m in ps.machines] == ["P-101", "P-102", "C-201", "M-301"]
    assert all(m.status == "ok" for m in ps.machines)
    assert all(len(m.sparkline) == 60 for m in ps.machines)
    assert all("load_pct" not in m.latest for m in ps.machines)
    assert ps.open_alerts == 0


def test_hooks_tick_once_per_step_call():
    e = Engine(seed=7, only=["P-101"])
    ticks = []
    e.on_tick.append(ticks.append)
    e.step(12)
    assert len(ticks) == 1 and ticks[0] == e.sim_time