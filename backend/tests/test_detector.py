from datetime import timedelta
from dataclasses import dataclass
from backend.app.config import load_config, sim_start
from backend.app.detect.detector import Detector
from backend.app.sim.faults import DEFAULT_DURATION_H, Fault
from backend.app.sim.machines import LoadModel, MachineSim


def run(seed=7, noise_mult=1.0, fault=None, onset_h=2.0, live_h=72, stop_at_event=True):
    """Simulate P-101: 72 h healthy history, fit the detector, then live data.
    Returns (hours from fault onset to first event, or None; highest score; number of events)."""
    cfg = load_config()
    mcfg = cfg["machines"][0]                      # P-101
    load_model = LoadModel(cfg, seed)
    sim = MachineSim(mcfg, 0, seed, noise_mult)
    det = Detector(mcfg["signals"], cfg["detector"])

    t = sim_start(cfg) - timedelta(hours=cfg["sim"]["history_hours"])
    loads, hist = [], []
    for _ in range(cfg["sim"]["history_hours"] * 12):
        t += timedelta(minutes=5)
        ld = load_model.next(t)
        loads.append(ld)
        hist.append(sim.step(t, ld))
    det.fit(loads, hist)
    for ld, v in zip(loads, hist):                 # warm-up: never counts as an event
        det.update(v, ld)
    det.above = 0

    onset = None
    first_event_h, peak, events = None, 0.0, 0
    for i in range(live_h * 12):
        t += timedelta(minutes=5)
        if fault and i == int(onset_h * 12):
            sim.fault = Fault.create(fault, 1.0, t)
            onset = t
        ld = load_model.next(t)
        score, _ = det.update(sim.step(t, ld), ld)
        peak = max(peak, score)
        if det.above == det.k:
            events += 1
            if first_event_h is None and onset is not None:
                first_event_h = (t - onset).total_seconds() / 3600
            if stop_at_event and fault:
                break
    return first_event_h, peak, events


def test_baseline_learns_load_effect():
    cfg = load_config()
    mcfg = cfg["machines"][0]
    load_model = LoadModel(cfg, 7)
    sim = MachineSim(mcfg, 0, 7)
    det = Detector(mcfg["signals"], cfg["detector"])
    t = sim_start(cfg) - timedelta(hours=72)
    loads, hist = [], []
    for _ in range(72 * 12):
        t += timedelta(minutes=5)
        ld = load_model.next(t)
        loads.append(ld)
        hist.append(sim.step(t, ld))
    det.fit(loads, hist)
    b = det.baseline["bearing_temp"]
    assert abs(b.load_slope - 2.0 / 25) < 0.03     # true slope is load_coef / 25 = 0.08
    assert abs(b.typical - 55) < 1.5


def test_healthy_runs_have_at_most_one_false_event():
    total = sum(run(seed=s, noise_mult=1.5, live_h=72)[2] for s in range(10))
    assert total <= 1


def test_bearing_wear_detected_early():
    hours, _, _ = run(seed=7, fault="bearing_wear")
    assert hours is not None and hours <= 6


def test_every_fault_is_detected_well_before_failure():
    for fault, duration in DEFAULT_DURATION_H.items():
        hours, _, _ = run(seed=7, fault=fault)
        assert hours is not None, fault
        assert hours < duration * 0.5, (fault, hours)
@dataclass
class S:
    """Tiny stand-in for the engine's Sample."""
    t: object
    values: dict
    scores: dict


def test_contributions_point_at_the_faulty_signal():
    cfg = load_config()
    mcfg = cfg["machines"][0]                      # P-101
    load_model = LoadModel(cfg, 7)
    sim = MachineSim(mcfg, 0, 7)
    det = Detector(mcfg["signals"], cfg["detector"])

    t = sim_start(cfg) - timedelta(hours=cfg["sim"]["history_hours"])
    loads, hist = [], []
    for _ in range(cfg["sim"]["history_hours"] * 12):
        t += timedelta(minutes=5)
        ld = load_model.next(t)
        loads.append(ld)
        hist.append(sim.step(t, ld))
    det.fit(loads, hist)
    samples = []
    for ld, v in zip(loads, hist):                 # warm-up, keeping the samples
        _, scores = det.update(v, ld)
        samples.append(S(t, {**v, "load_pct": ld}, scores))
    det.above = 0

    onset = event_t = None
    for i in range(24 * 12):
        t += timedelta(minutes=5)
        if i == 24:                                # fault starts 2 h into live time
            sim.fault = Fault.create("bearing_wear", 1.0, t)
            onset = t
        ld = load_model.next(t)
        v = sim.step(t, ld)
        _, scores = det.update(v, ld)
        samples.append(S(t, {**v, "load_pct": ld}, scores))
        if det.above == det.k:
            event_t = t
            break
    assert event_t is not None

    contribs = det.contributions(samples, 5)
    for c in contribs:
        print(c.signal, c.score, c.z, c.slope_per_h, c.direction, c.deviating_since)
    assert len(contribs) == 7
    assert [c.score for c in contribs] == sorted((c.score for c in contribs), reverse=True)
    top = contribs[0]
    assert top.signal == "vibration_hf"
    assert top.direction == "up"
    assert 0.02 < top.slope_per_h < 0.09           # true slope is 2.4 / 48 = 0.05 g per hour
    assert top.deviating_since is not None
    assert onset - timedelta(hours=1) <= top.deviating_since < event_t