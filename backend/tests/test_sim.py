from datetime import datetime, timedelta, timezone

from backend.app.sim.faults import FAULT_TABLE, Fault
from backend.app.config import load_config, sim_start
from backend.app.sim.machines import LoadModel, MachineSim

T0 = datetime(2026, 10, 15, 8, 0, tzinfo=timezone.utc)


def test_progress_clips():
    f = Fault.create("bearing_wear", 1.0, T0)
    assert f.progress(T0 - timedelta(hours=5)) == 0.0
    assert abs(f.progress(T0 + timedelta(hours=24)) - 0.5) < 1e-9
    assert f.progress(T0 + timedelta(hours=100)) == 1.0


def test_full_delta_equals_table():
    for name, signals in FAULT_TABLE.items():
        f = Fault.create(name, 1.0, T0)
        end = T0 + timedelta(hours=f.duration_h)
        for sig, (mag, _p, _g) in signals.items():
            assert abs(f.delta(sig, end) - mag) < 1e-9


def test_bearing_wear_halfway_matches_step3():
    f = Fault.create("bearing_wear", 1.0, T0)
    mid = T0 + timedelta(hours=24)
    assert abs(f.delta("vibration_hf", mid) - 1.2) < 0.01
    assert abs(f.delta("vibration_rms", mid) - 1.52) < 0.01
    assert f.delta("flow", mid) == 0.0   # bearing wear does not touch flow
def _gen(seed=7, n=288, fault=None, fault_at=0):
    cfg = load_config()
    load = LoadModel(cfg, seed)
    m = MachineSim(cfg["machines"][0], 0, seed)   # P-101
    t = sim_start(cfg)
    out = []
    for i in range(n):
        t += timedelta(minutes=5)
        if fault and i == fault_at:
            m.fault = Fault.create(fault, 1.0, t)
        out.append((t, m.step(t, load.next(t))))
    return out


def test_same_seed_identical():
    assert _gen(seed=7) == _gen(seed=7)


def test_different_seed_differs():
    assert _gen(seed=7) != _gen(seed=8)


def test_healthy_72h_never_crosses_alarms():
    cfg = load_config()
    load = LoadModel(cfg, 7)
    sims = [(MachineSim(m, i, 7), m["signals"]) for i, m in enumerate(cfg["machines"])]
    t = sim_start(cfg)
    for _ in range(72 * 12):
        t += timedelta(minutes=5)
        ld = load.next(t)
        for sim, signals in sims:
            vals = sim.step(t, ld)
            for s in signals:
                if s.get("alarm_high") is not None:
                    assert vals[s["name"]] <= s["alarm_high"], (sim.id, s["name"], t)
                if s.get("alarm_low") is not None:
                    assert vals[s["name"]] >= s["alarm_low"], (sim.id, s["name"], t)


def test_fault_changes_values_by_exactly_delta():
    healthy = _gen()
    faulty = _gen(fault="bearing_wear", fault_at=100)
    assert healthy[:100] == faulty[:100]            # identical before the fault starts
    t_fault = faulty[100][0]
    f = Fault.create("bearing_wear", 1.0, t_fault)
    for i in range(100, 288):
        t = faulty[i][0]
        diff = faulty[i][1]["vibration_hf"] - healthy[i][1]["vibration_hf"]
        assert abs(diff - f.delta("vibration_hf", t)) < 1e-9