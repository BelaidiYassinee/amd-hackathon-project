from datetime import timedelta

from backend.app.config import load_config, sim_start
from backend.app.detect.threshold import ThresholdMonitor
from backend.app.sim.faults import Fault
from backend.app.sim.machines import LoadModel, MachineSim


def run_legacy(fault=None, hours=72, seed=7, onset_h=2.0):
    """Returns (signal that fired or None, hours from fault onset to firing or None)."""
    cfg = load_config()
    mcfg = cfg["machines"][0]                      # P-101
    load_model = LoadModel(cfg, seed)
    sim = MachineSim(mcfg, 0, seed)
    mon = ThresholdMonitor(mcfg["signals"], cfg["detector"]["threshold_consecutive"])
    t = sim_start(cfg)
    onset = None
    for i in range(hours * 12):
        t += timedelta(minutes=5)
        if fault and i == int(onset_h * 12):
            sim.fault = Fault.create(fault, 1.0, t)
            onset = t
        fired = mon.update(t, sim.step(t, load_model.next(t)))
        if fired:
            return fired[0], ((t - onset).total_seconds() / 3600 if onset else None)
    return None, None


def test_healthy_never_fires():
    assert run_legacy(fault=None, hours=72) == (None, None)


def test_bearing_wear_fires_late_on_vibration_rms():
    signal, hours = run_legacy(fault="bearing_wear", hours=72)
    assert signal == "vibration_rms"
    assert 38 <= hours <= 46


def test_vibration_hf_is_not_watched():
    cfg = load_config()
    mon = ThresholdMonitor(cfg["machines"][0]["signals"], 3)
    assert "vibration_hf" not in mon.counts


def test_fires_once_and_reset_rearms():
    cfg = load_config()
    mon = ThresholdMonitor(cfg["machines"][0]["signals"], 3)
    t = sim_start(cfg)
    bad = {s["name"]: s["base"] for s in cfg["machines"][0]["signals"]}
    bad["vibration_rms"] = 9.0                     # above the 7.1 limit
    assert mon.update(t, bad) is None              # sample 1
    assert mon.update(t, bad) is None              # sample 2
    fired = mon.update(t, bad)                     # sample 3: fires
    assert fired is not None and fired[0] == "vibration_rms" and ">" in fired[1]
    assert mon.update(t, bad) is None              # already fired: silent
    mon.reset()
    mon.update(t, bad); mon.update(t, bad)
    assert mon.update(t, bad) is not None          # re-armed