# 01: P1 brief: simulator, detection, repair vs. replace, eval

> **Paste this into your AI model, together with `00-project-and-contract.md`:**
>
> "You are my pair programmer for a 3-day hackathon. Read `00-project-and-contract.md` first. It is the shared spec, and its API contract (§7), engine interface (§8), and seed data (§10) are binding. Then read this brief: it is my part. Work only on the files listed under *You own*. Implement the tasks in order. After each task, run its acceptance check and show me the result before moving on. If something in the contract looks wrong or missing, tell me instead of changing it; I will coordinate with the team. Keep code simple and readable: this is a demo prototype, not production."

**Owner:** P1 (name: ____________)

**Your mission:** make a believable plant run in fast-forward, inject faults on demand, detect them early with a transparent statistical model, and prove with numbers that this beats a fixed-threshold alarm. You also own the repair-vs-replace math and the eval harness that produces the numbers for the pitch.

---

## You own

```
backend/__init__.py, backend/app/__init__.py
backend/requirements.txt
backend/app/main.py            (verbatim from 00 §9)
backend/app/models.py          (verbatim from 00 §7.1)
backend/app/state.py
backend/app/config.py
backend/app/sim/__init__.py, sim/engine.py, sim/machines.py, sim/faults.py
backend/app/detect/__init__.py, detect/detector.py, detect/threshold.py
backend/app/decide/__init__.py, decide/replace.py
backend/app/api/__init__.py, api/plant.py
backend/app/api/alerts.py      (stub only on Thursday; P2 owns it after that)
backend/data/machines.yaml
backend/data/roster.json, spare_parts.json, catalog.json   (commit from 00 §10, then hands off)
backend/data/maintenance_log.json, manuals/pump_p101.md    (placeholders only; P4 replaces them)
backend/tests/test_sim.py, test_detector.py, test_replace.py
eval/__init__.py, eval/scenarios.py, eval/detection_eval.py, eval/run_eval.py
.env.example, .gitignore
```

**Do not touch:** `agent/*`, `alerts/*`, `api/alerts.py` (after the stub), `data.py`, `frontend/*`, `Dockerfile`.

## You depend on

- **P2:** `backend.app.agent.llm.chat` and `is_mock` (00 §8.1), for the justification sentence only. Until P2 has merged it, use the template fallback.
- **P2:** `alerts.service.attach`, registered in `state.RESET_HOOKS`, so alerts get created. You can test everything without it.
- **P2:** `eval/diagnosis_eval.evaluate(runs)` for the full eval report.

## Others depend on you

| Who | Needs | By |
|---|---|---|
| Everyone | Skeleton on `main` | **Thu 21:00** |
| P2 | `Engine` interface (00 §8) with real data, for tools and diagnosis | Fri 13:00 |
| P3 | Live `/api/plant`, `/api/machines/{id}/series`, `/api/demo/*` | Fri 13:00 |
| P3 | `/api/machines/{id}/replace-analysis` | Sat 10:00 |
| P4 | `eval/report.md` with final numbers | Sat 12:00 |

---

## Task 1: Skeleton (Thu, target 21:00, about 1.5 h)

1. **Folders and files.** Create the folder structure from 00 §4 with empty `__init__.py` files.
2. **Contract files.** Commit `models.py` (00 §7.1) and `main.py` (00 §9) **verbatim**.
3. **`backend/requirements.txt`:**
   ```
   fastapi>=0.115
   uvicorn[standard]>=0.30
   pydantic>=2.7,<3
   numpy>=1.26
   pyyaml>=6.0
   python-dotenv>=1.0
   openai>=1.40
   rank-bm25>=0.2.2
   httpx>=0.27
   pytest>=8.0
   ```
4. **Stubs:**
   - `api/alerts.py` contains `from fastapi import APIRouter` and `router = APIRouter()`.
   - `api/plant.py` returns the **example payloads from 00 §14** (hard-coded) for `/api/plant` and `/series`, and a correct `/api/health`. This lets P3 hit a real server immediately.
5. **`state.py` stub:** `reset()` and `run_loop()` that do nothing yet, with `RESET_HOOKS = []`.
6. **Seed data:**
   - `backend/data/roster.json`, `spare_parts.json`, and `catalog.json`, exactly as in 00 §10.
   - `backend/data/manuals/pump_p101.md` as a placeholder: one `## [ID] Title` heading per section listed in 00 §10.4, each followed by one line `TODO (P4)`.
   - `backend/data/maintenance_log.json` as a placeholder with the 6 records from 00 §10.5. Use short descriptions, `cost_eur` 0, `downtime_h` 0, `parts` [], and `technician_id` null. P4 replaces this file.
7. **`.env.example`** exactly as 00 §11.
8. **`.gitignore`:** append these lines:
   ```
   node_modules/
   frontend/dist/
   backend/logs/
   .venv/
   ```

**Acceptance:**
- `uvicorn backend.app.main:app --port 8000` starts.
- `GET /api/health` → `{"ok": true, ...}`.
- `http://localhost:8000/docs` lists the endpoints.
- After that, push to `main` and post in the team chat: "skeleton is on main".

---

## Task 2: `machines.yaml` and signal generation (Thu evening)

### `backend/data/machines.yaml`

```yaml
sim:
  start: "2026-10-15T06:00:00Z"
  sample_minutes: 5
  history_hours: 72
  default_speed: 6            # samples per real second -> 30 sim-minutes per second
  auto_pause_on_alert: true
load:                          # plant-wide production load, %
  mean: 75
  amplitude: 12
  peak_hour: 15                # load peaks at 15:00
  noise: 3
  ar: 0.9
  min: 40
  max: 100
detector:
  ewma_alpha: 0.1
  ewma_limit: 1.5
  k_consecutive: 6             # 6 samples = 30 sim-minutes above the limit before an event
  watch_ratio: 0.6
  deviation_ratio: 0.5         # "deviating since" = score continuously >= 0.5 * limit
  slope_window_h: 3
  threshold_consecutive: 3
  sigma_floor_ratio: 0.25      # sigma >= 0.25 * configured noise
machines:
  - id: P-101
    name: Coolant pump P-101
    type: centrifugal_pump
    area: Cooling loop
    model: AquaFlow CP-80
    installed: "2017-03-14"
    design_life_years: 15
    duty: {flow_m3h: 120, head_m: 42, hours_per_year: 6000}
    signals:
      - {name: vibration_rms,      label: Vibration RMS,             unit: mm/s, base: 1.8,  noise: 0.12, load_coef: 0.15,  ar: 0.0, alarm_high: 7.1}
      - {name: vibration_hf,       label: HF vibration energy,       unit: g,    base: 0.30, noise: 0.03, load_coef: 0.02,  ar: 0.0}
      - {name: bearing_temp,       label: Bearing temperature,       unit: °C,   base: 55,   noise: 0.6,  load_coef: 2.0,   ar: 0.5, alarm_high: 85}
      - {name: motor_temp,         label: Motor winding temperature, unit: °C,   base: 72,   noise: 0.8,  load_coef: 4.0,   ar: 0.5, alarm_high: 120}
      - {name: motor_current,      label: Motor current,             unit: A,    base: 52,   noise: 0.8,  load_coef: 4.0,   ar: 0.0, alarm_high: 62}
      - {name: discharge_pressure, label: Discharge pressure,        unit: bar,  base: 4.2,  noise: 0.04, load_coef: -0.10, ar: 0.0, alarm_low: 3.3}
      - {name: flow,               label: Flow,                      unit: m³/h, base: 120,  noise: 1.5,  load_coef: 8.0,   ar: 0.0, alarm_low: 100}
  - id: P-102
    name: Process water pump P-102
    type: centrifugal_pump
    area: Utilities
    model: AquaFlow CP-65
    installed: "2021-06-02"
    design_life_years: 15
    duty: {flow_m3h: 80, head_m: 35, hours_per_year: 5000}
    signals:
      - {name: vibration_rms,      label: Vibration RMS,             unit: mm/s, base: 1.5,  noise: 0.10, load_coef: 0.12,  ar: 0.0, alarm_high: 7.1}
      - {name: vibration_hf,       label: HF vibration energy,       unit: g,    base: 0.25, noise: 0.03, load_coef: 0.02,  ar: 0.0}
      - {name: bearing_temp,       label: Bearing temperature,       unit: °C,   base: 50,   noise: 0.6,  load_coef: 1.5,   ar: 0.5, alarm_high: 85}
      - {name: motor_temp,         label: Motor winding temperature, unit: °C,   base: 65,   noise: 0.8,  load_coef: 3.0,   ar: 0.5, alarm_high: 120}
      - {name: motor_current,      label: Motor current,             unit: A,    base: 31,   noise: 0.5,  load_coef: 2.5,   ar: 0.0, alarm_high: 38}
      - {name: discharge_pressure, label: Discharge pressure,        unit: bar,  base: 3.5,  noise: 0.04, load_coef: -0.08, ar: 0.0, alarm_low: 2.7}
      - {name: flow,               label: Flow,                      unit: m³/h, base: 80,   noise: 1.2,  load_coef: 5.0,   ar: 0.0, alarm_low: 65}
  - id: C-201
    name: Air compressor C-201
    type: screw_compressor
    area: Utilities
    model: Kompra SK-45
    installed: "2019-01-20"
    design_life_years: 12
    signals:
      - {name: vibration_rms,      label: Vibration RMS,             unit: mm/s, base: 2.2,  noise: 0.15, load_coef: 0.2,   ar: 0.0, alarm_high: 7.1}
      - {name: discharge_pressure, label: Discharge pressure,        unit: bar,  base: 7.5,  noise: 0.05, load_coef: -0.15, ar: 0.0, alarm_low: 6.5}
      - {name: motor_current,      label: Motor current,             unit: A,    base: 78,   noise: 1.2,  load_coef: 6.0,   ar: 0.0, alarm_high: 92}
      - {name: oil_temp,           label: Oil temperature,           unit: °C,   base: 78,   noise: 0.7,  load_coef: 3.0,   ar: 0.5, alarm_high: 100}
      - {name: motor_temp,         label: Motor winding temperature, unit: °C,   base: 80,   noise: 0.8,  load_coef: 4.0,   ar: 0.5, alarm_high: 125}
  - id: M-301
    name: Conveyor drive M-301
    type: conveyor_drive
    area: Packaging line
    model: Line 2 conveyor drive
    installed: "2020-09-10"
    design_life_years: 15
    signals:
      - {name: vibration_rms,      label: Vibration RMS,             unit: mm/s, base: 1.2,  noise: 0.08, load_coef: 0.1,   ar: 0.0, alarm_high: 4.5}
      - {name: motor_current,      label: Motor current,             unit: A,    base: 14,   noise: 0.3,  load_coef: 1.5,   ar: 0.0, alarm_high: 19}
      - {name: motor_temp,         label: Motor winding temperature, unit: °C,   base: 60,   noise: 0.7,  load_coef: 3.0,   ar: 0.5, alarm_high: 110}
      - {name: gearbox_temp,       label: Gearbox temperature,       unit: °C,   base: 52,   noise: 0.5,  load_coef: 2.0,   ar: 0.5, alarm_high: 85}
      - {name: belt_speed,         label: Belt speed,                unit: m/s,  base: 1.2,  noise: 0.01, load_coef: 0.0,   ar: 0.0, alarm_low: 1.0}
```

Open YAML and JSON files with `encoding="utf-8"` (because of `°C` and `m³/h`).

### `sim/machines.py`: how a healthy value is produced

At each sample time `t`, for each machine and signal:

```
load_pct(t) = clip(mean + amplitude * cos(2π * (hour_of_day(t) - peak_hour) / 24) + load_noise_t, min, max)
              load_noise_t = ar * load_noise_{t-1} + sqrt(1 - ar²) * N(0, noise)      (plant-wide, one series)

value = base + load_coef * (load_pct - 75) / 25 + noise_t * fault_noise_factor + fault_delta
        noise_t = ar_s * noise_{t-1} + sqrt(1 - ar_s²) * N(0, noise_s * noise_mult)   (per signal)
```

- **RNG:** use `numpy.random.default_rng`. Give the load series its own generator `rng(seed)`, and each machine its own `rng(seed * 100 + machine_index)`. Injecting a fault in one machine must never change another machine's noise. Same seed means same data, always.
- **`noise_mult`** is an `Engine` constructor argument (default 1.0). The eval uses 0.8–1.5.

**Acceptance (in `test_sim.py`):**
- Two engines with the same seed give identical history.
- 72 h of healthy history never crosses any `alarm_high` or `alarm_low`.

---

## Task 3: Fault signatures (`sim/faults.py`, Thu evening)

A fault has `fault`, `severity` (0.3–2.0), `start` (sim datetime), and `duration_h` (None means the default). Progress runs from 0 to 1:

```
d(t) = clip((t - start).hours / duration_h, 0, 1)
delta_signal(t) = severity * magnitude * d^p
fault_noise_factor_signal(t) = 1 + noise_gain * d
```

Faults apply only to machines with `type: centrifugal_pump`. Signals not in the table get no delta.

| fault | default `duration_h` | signal | magnitude | p | noise_gain |
|---|---|---|---|---|---|
| `bearing_wear` | 48 | vibration_hf | +2.4 | 1.0 | 0 |
| | | vibration_rms | +7.0 | 2.2 | 2.0 |
| | | bearing_temp | +34 | 2.5 | 0 |
| | | motor_current | +4 | 3.0 | 0 |
| `cavitation` | 20 | discharge_pressure | −1.2 | 0.8 | 5.0 |
| | | flow | −28 | 0.8 | 3.0 |
| | | vibration_rms | +3.0 | 1.2 | 3.0 |
| | | vibration_hf | +0.9 | 1.0 | 1.0 |
| | | motor_current | −5 | 1.0 | 0 |
| `misalignment` | 72 | vibration_rms | +6.5 | 1.3 | 0.5 |
| | | vibration_hf | +0.25 | 1.5 | 0 |
| | | bearing_temp | +18 | 1.8 | 0 |
| | | motor_current | +7 | 1.5 | 0 |
| | | motor_temp | +10 | 1.5 | 0 |
| `motor_overheat` | 36 | motor_temp | +55 | 2.0 | 0 |
| | | motor_current | +9 | 1.5 | 0 |
| | | bearing_temp | +8 | 2.0 | 0 |

**Why these shapes:**
- **Bearing wear:** HF energy rises first and linearly, overall vibration and temperature follow late. This is exactly why an early detector beats a vibration-RMS threshold.
- **Cavitation:** pressure and flow drop and get noisy, and current drops because the pump does less hydraulic work.
- **Misalignment:** vibration rises together with temperatures and current.
- **Motor overheat:** winding temperature and current rise, while vibration stays flat.

The manual P4 writes describes the same fingerprints. Keep them in sync: if you change this table, tell P4 and P2.

**Failure:** when `d ≥ 1`, the machine **trips**:
- Set `failed = True`, add a `failure` marker ("P-101 tripped: bearing seized"), and set status to `down`.
- From then on the values are: flow 0, discharge_pressure 0.2, motor_current 0, vibration_rms 0.3, vibration_hf 0.05.
- Every temperature decays toward 25 °C: `T += (25 - T) * 0.05` per sample.
- The detector stops updating that machine; the sample keeps the last score.

**Acceptance (`test_sim.py`):** with noise set to 0 and severity 1, at `d = 1` each signal's delta equals the table value.

---

## Task 4: Detector and threshold baseline (Fri morning)

### Baseline fit (`detect/detector.py`), once per machine at reset, on the 72 h healthy history

For each signal:

```
a, b      = linear fit of value on load_pct           (np.polyfit(load, x, 1) -> slope b, intercept a)
resid     = x - (a + b * load)
m_r       = median(resid)
sigma     = max(1.4826 * median(|resid - m_r|), sigma_floor_ratio * noise)
typical   = a + b * 75
```

Store the result as `BaselineStat(intercept=a, load_slope=b, resid_median=m_r, sigma=sigma, typical=typical)` (00 §8).

### Per-sample update

```
z_s   = clip((x - a - b*load - m_r) / sigma, -20, 20)
e_s   = α * z_s + (1 - α) * e_s_prev                  (EWMA, starts at 0)
score_s = |e_s|;     score = max_s score_s
health = clip(round(100 - 50 * score / L), 0, 100)   (failed machine -> 0)
```

**Events:**
- `above` counts consecutive samples with `score ≥ L` and resets to 0 otherwise.
- When `above == k_consecutive`, the machine is not failed, not suppressed, and has no active alert, emit an event.
- Then add the `ai_detected` marker. If `auto_pause_on_alert`, set `paused = True` and stop stepping. Finally call the `on_anomaly` hooks.

**Contributions** (for `AnomalyEvent` and `Engine.contributions()`), one per signal, sorted by `score` desc:

| Field | Value |
|---|---|
| `score` | `score_s` |
| `z` | latest `z_s` |
| `direction` | `"up"` if `e_s ≥ 0`, else `"down"` |
| `slope_per_h` | slope of a linear fit of **raw values** over the last `slope_window_h` (3 h = 36 samples), in units per hour |
| `deviating_since` | walk back through stored per-signal scores while `score_s ≥ deviation_ratio * L` and return the earliest such time, or null if the current score is below that |

**Event fields:**
- `first_deviation_at` = the earliest `deviating_since` among signals with `score_s ≥ L`; fall back to `detected_at`.
- `id` = `EVT-0001`, `EVT-0002`, … per engine.

**Warm-up:** after fitting, run the update over the history samples so the EWMA state is warm and history samples have scores for the chart. **Never emit events during warm-up.**

### Threshold baseline (`detect/threshold.py`)

This is the "legacy alarm" the plant has today. For every signal with `alarm_high` / `alarm_low`, it fires when the **raw** value is beyond the limit for `threshold_consecutive` (3) consecutive samples.

When it fires (first time only per fault episode):
- Record `(t, signal)`. `t` is the time of the 3rd sample.
- Add marker `threshold_alarm` with label `"Legacy alarm: {label} {value:.1f} {unit} > {limit}"` (use `<` for low limits).
- Call the `on_threshold` hooks with `(machine_id, t, signal)`.

`clear_fault()` re-arms it. Note that `vibration_hf` has no limit: the legacy system doesn't watch it, which is part of our story.

### Machine status

| Status | When |
|---|---|
| `down` | The machine has failed |
| `alert` | `active_alert_id` is set |
| `watch` | `score ≥ watch_ratio * L` |
| `ok` | Otherwise |

**Acceptance (`test_detector.py`):**
- **Healthy runs:** 10 runs of 72 h after the live start, seeds 0–9, with `noise_mult` 1.5. Total events ≤ 1.
- **Bearing wear:** inject `bearing_wear` (seed 7, severity 1.0) at live start + 2 h. The event fires within 6 sim-hours, and the threshold alarm fires later than the event.
- **Every fault type:** each of the 4 faults (severity 1.0) produces an event before the threshold alarm.
- **If false alarms are too frequent,** tune in this order: `k_consecutive` (6 → 9), `ewma_limit` (1.5 → 2.0), then temperature `ar` (0.5 → 0.3). Record the final values in `machines.yaml`.

---

## Task 5: Engine and realtime loop (Fri morning, target 13:00)

Implement `Engine` exactly as in 00 §8. Notes:

- **Clock:**
  - `__init__` sets `sim_time = sim.start - history_hours`, generates the history (no hooks, no events), fits baselines, and warms the detector.
  - Then `sim_time = sim.start`, `speed = default_speed`, `paused = False`, and `auto_pause_on_alert` comes from config.
- **`only=[...]`** limits the machines (the eval uses `["P-101"]` for speed).
- **`step(n)`:**
  - Loop n times: advance 5 min, generate every machine's sample, update the detector and threshold monitor, and append to storage.
  - Stop early if `paused` became true.
  - Call each `on_tick` hook once at the end with `sim_time`.
- **Storage:** a list of `Sample` per machine. Trim anything older than 7 sim-days.
- **`samples(machine_id, hours)`** returns samples with `t > sim_time - hours` (all if `hours` is None), oldest first.
- **`inject(...)`:**
  - Raise `ValueError` if the machine is not a `centrifugal_pump` or already has an active fault.
  - Add a `fault_injected` marker: `"Demo: {fault} injected"`.
- **`clear_fault()`:** remove the fault, set `failed=False`, reset the EWMA states and `above` counter to 0, re-arm the threshold monitor, and keep the baseline.
- **`set_active_alert(machine_id, id_or_None)`:** only sets or clears the id. It never touches the fault. On resolve, P2 calls `clear_fault()` explicitly.
- **`plant_state()`:** build `PlantState`. `open_alerts` = number of machines with `active_alert_id` set. `sparkline` = last 60 `health` values. `latest` = the last sample's values without `load_pct`.

**`state.py`:**

```python
from __future__ import annotations
import asyncio
from typing import Callable
from backend.app.sim.engine import Engine

engine: Engine | None = None
RESET_HOOKS: list[Callable[[Engine], None]] = []

def get_engine() -> Engine:
    assert engine is not None
    return engine

def reset(seed: int = 7) -> Engine:
    global engine
    engine = Engine(seed=seed)
    for hook in RESET_HOOKS:
        hook(engine)
    return engine

async def run_loop() -> None:
    acc = 0.0
    while True:
        await asyncio.sleep(0.1)
        eng = engine
        if eng is None or eng.paused:
            continue
        acc += eng.speed * 0.1
        n = int(acc)
        if n:
            acc -= n
            eng.step(n)
```

**Acceptance:**
- A script steps the engine 600 times and injects `bearing_wear` at step 24. It sees: status turns `watch`, then `alert` (call `set_active_alert` from a test hook), then `down`.
- The markers come out in the order `fault_injected` < `ai_detected` < `threshold_alarm` < `failure`.
- Without `auto_pause` it runs to failure; with auto-pause it stops at the event.

---

## Task 6: Plant API (`api/plant.py`, Fri, target 13:00)

Replace the stubs with real handlers. All of them use `state.get_engine()`.

| Endpoint | Behaviour |
|---|---|
| `GET /health` | `{"ok": True, "sim_time": engine.sim_time}` |
| `GET /plant` | `engine.plant_state()` |
| `GET /machines/{id}/series?hours=48&max_points=600` | 404 if the machine is unknown. Take `samples(id, hours)` and downsample by stride `ceil(n / max_points)`, **always keeping the last sample**. Each point = `SeriesPoint(t, values incl. load_pct, score)`. Markers = those with `t` inside the window. |
| `POST /demo/inject` | `InjectRequest` → `engine.inject(...)`. Unknown machine → 404; `ValueError` → 409. Also set `paused=False` so the demo flows. Returns `PlantState`. |
| `POST /demo/control` | Apply the non-null fields → `PlantState`. |
| `POST /demo/reset` | `state.reset(body.seed)` → `PlantState`. P2's reset hook clears alerts. |
| `POST /machines/{id}/replace-analysis` | See Task 7. |

Remember the router has no prefix: `main.py` adds `/api`.

**Acceptance:**
- With the server running, `curl -X POST localhost:8000/api/demo/inject -H "Content-Type: application/json" -d "{\"machine_id\":\"P-101\",\"fault\":\"bearing_wear\"}"` works.
- Within about 10 s, `/api/plant` shows P-101 `paused: true`, and the series has an `ai_detected` marker.
- **Post in chat:** "live engine on main".

---

## Task 7: Integration with P2 (Fri afternoon)

- P2's `alerts/service.py` appends `attach` to `state.RESET_HOOKS` at import. `main.py` imports `api.alerts`, which imports the service.
- **Check together:**
  - inject → event → alert in `/api/alerts` with `state: "diagnosing"`, then `open`
  - acknowledge → `acknowledged`
  - resume (`/demo/control {"paused": false}`) → the threshold alarm later fills `lead_time_h`
  - resolve → machine back to `ok`
- **Fix any hook-timing issues.** P2 calls `engine.set_active_alert` inside the hook. Your step loop must read that before deciding the next event.

---

## Task 8: Repair vs. replace (`decide/replace.py`, Fri evening, or Sat by 10:00)

**Inputs:**
- `machines.yaml`: `duty` and `installed`.
- `catalog.json`: `assumptions`, `repair_estimates[fault]`, and `candidates`.
- `maintenance_log.json`: count `type == "corrective"` records for this machine with `date > sim_date - 365 days`.
- Use P2's `backend.app.data` loaders if they exist; otherwise read the JSON directly.
- The machine must have a `duty`, else return 400.

**Formulas:**

```
P_hyd_kW          = flow_m3h * head_m / 367.2
energy_year(eff)  = P_hyd_kW / (eff / 100) * hours_per_year * energy_eur_per_kwh
H                 = horizon_years;  C = corrective_repairs_last_12m;  D = downtime_eur_per_h

REPAIR  (option_id "repair", kind "repair", label "Repair current pump (<repair label>)")
  repair label: bearing_wear "bearing replacement", cavitation "suction-side fix",
                misalignment "realignment + coupling", motor_overheat "motor cooling repair", other "general repair"
  capex        = parts_eur + labor_eur
  energy_5y    = energy_year(efficiency_after_pct) * H
  maint_5y     = base_maintenance_eur_year * (1 + maintenance_factor_per_corrective * C) * H
  downtime_5y  = failures_per_corrective_repair * C * hours_per_failure * D * H  +  downtime_h * D
  efficiency   = efficiency_after_pct; lead_time_days = repair lead_time_days; fits_duty = True

REPLACE (each candidate)
  capex        = price_eur + install_eur
  energy_5y    = energy_year(efficiency_pct) * H
  maint_5y     = maintenance_eur_year * H
  downtime_5y  = failures_per_year_new * hours_per_failure * D * H  +  install_downtime_h * D
  fits_duty    = rated_flow_m3h >= duty.flow_m3h and rated_head_m >= duty.head_m

tco_5y      = capex + energy_5y + maint_5y + downtime_5y
score       = 0 if not fits_duty else 100 * min_tco_of_fitting_options / tco_5y   (1 decimal)
rank        = fitting options by tco ascending, then non-fitting by tco ascending
payback     = only if rank-1 is a replacement:
              annual_op(option) = (energy_5y + maint_5y + downtime_5y - one_off_downtime) / H
                 where one_off_downtime = downtime_h*D (repair) or install_downtime_h*D (replace)
              upfront(option)   = capex + one_off_downtime
              payback_months    = 12 * (upfront(best) - upfront(repair)) / (annual_op(repair) - annual_op(best))   (1 decimal)
```

**Rounding:** round EUR fields to whole euros at the end, computing totals from unrounded parts.

**`assumptions` in the response:** include every key from `catalog.json` plus `corrective_repairs_last_12m` (int) and `age_years` (1 decimal).

**`fit_notes` templates:**
- Fitting: `"Meets {flow} m3/h at {head} m (rated {rf} m3/h at {rh} m)"`, plus `"; same footprint."` or `"; {notes}"` if not footprint-compatible.
- Not fitting: `"Rated {rf} m3/h at {rh} m: below the {flow} m3/h at {head} m duty."`
- Repair: `"Keeps the {age:.0f}-year-old pump; {C} corrective repairs in the last 12 months."`

**Test oracle (`test_replace.py`).** For P-101, fault `bearing_wear`, sim date 2026-10-15, and the 00 §10 seed data, results must match **00 §14.4** to ±1 €:

| option | capex | energy_5y | maint_5y | downtime_5y | tco_5y | score | rank |
|---|---|---|---|---|---|---|---|
| AF-CP80-G2 | 16,300 | 100,159 | 4,500 | 21,600 | 142,559 | 100.0 | 1 |
| HX-NB100 | 15,400 | 108,997 | 5,500 | 36,000 | 165,897 | 85.9 | 2 |
| repair | 1,400 | 123,529 | 13,125 | 63,600 | 201,654 | 70.7 | 3 |
| VT-ECO75 | 9,900 | 121,504 | 6,000 | 21,600 | 159,004 | 0.0 | 4 |

The test also checks `payback_months == 15.0` and `recommendation == "AF-CP80-G2"`.

### Justification (one LLM call on AMD)

**Messages:**

```
system: You explain a maintenance investment decision to a plant maintenance supervisor.
        Write exactly 3 sentences of plain text, no markdown, no lists.
        Use ONLY numbers that appear in the JSON you are given. Do not invent or estimate new numbers.
        Mention the recommended option, its 5-year cost versus repairing, the main reason (energy, downtime
        or reliability), the payback if given, and any cheaper option that does not fit the duty point.
user:   <the ReplaceAnalysis options, duty, assumptions and payback as compact JSON, numbers rounded>
```

Call `llm.chat(messages, purpose="replace_justification", temperature=0.2, max_tokens=300)`.

**Verify the numbers:**
1. Extract every number in the text with regex `\d[\d,]*(?:\.\d+)?`. Strip commas.
2. The allowed set contains:
   - every numeric field of every option
   - all `duty` and `assumptions` values
   - `payback_months` and its rounded integer
   - `12` and `5`
   - pairwise differences of `tco_5y_eur` and of `capex_eur`
3. A number passes if it is within 1% (or ±0.5) of an allowed value, or of an allowed value divided by 1000 (for "€142.6k").

If anything fails, retry once and tell the model which numbers were not allowed. If it fails again, or `llm.is_mock()`, or `LlmError` → use a **template**:

```
"{best.label} has the lowest 5-year cost at €{best.tco:,.0f}, against €{repair.tco:,.0f} to repair the current pump."
+ " It pays back the extra upfront cost in about {payback:.0f} months." (if payback)
+ " {unfit.label} is cheaper to buy but cannot meet the {flow:.0f} m3/h at {head:.0f} m duty." (first non-fitting, if any)
```

(If repair is rank 1: "Repairing is the cheapest option over 5 years at €X; the best replacement, Y, would cost €Z.")

`justification_verified` is true for the template, and true for LLM text that passed the check.

---

## Task 9: Eval harness (Sat morning, report by 12:00)

### `eval/scenarios.py`

```python
@dataclass
class Scenario:
    id: str                 # "bearing_wear-03", "healthy-07"
    machine_id: str         # "P-101"
    fault: FaultType | None
    severity: float
    onset_h: float          # hours after live start
    duration_h: float | None
    noise_mult: float
    seed: int
    horizon_h: float        # hours after live start to simulate

@dataclass
class ScenarioRun:
    scenario: Scenario
    injected_at: datetime | None
    event: AnomalyEvent | None              # first event only
    engine_at_event: Engine | None          # deepcopy taken right after the event (hooks list emptied)
    threshold_at: datetime | None
    threshold_signal: str | None
    failure_at: datetime | None
    healthy_events: int                     # healthy runs only: number of events

def make_scenarios() -> list[Scenario]: ...
def run_scenario(s: Scenario) -> ScenarioRun: ...
```

**`make_scenarios()`** is deterministic and builds 50 scenarios:
- **Faults:** for each fault index `f` (0–3) and `i` (0–9): `seed = 1000 + 10*f + i`. With `rng = default_rng(seed)`:
  - `severity = U(0.7, 1.3)`
  - `onset_h = U(6, 24)`
  - `duration_h = default * U(0.8, 1.2)`
  - `noise_mult = U(0.8, 1.5)`
  - `horizon_h = onset_h + duration_h + 2`
- **Healthy:** seeds 2000–2009, `noise_mult = U(0.8, 1.5)`, horizon 72 h.

**`run_scenario()`:**
- Build `Engine(seed, only=["P-101"], noise_mult)` with `auto_pause_on_alert = False`.
- Step to the onset, inject, and keep stepping 1 at a time.
- **On the first event:** deepcopy the engine (clear its hook lists first), then call `engine.set_active_alert("P-101", "EVAL")` to stop further events, and continue until failure or horizon so you capture the threshold time.
- **Healthy runs:** count events. After each event, call `clear_fault` and `set_active_alert(None)`.

### `eval/detection_eval.py`

`evaluate(runs) -> dict` returns:
- **detection rate:** an event before failure, out of 40
- **detection delay:** `detected_at - injected_at` in hours (mean and median)
- **lead time:** `threshold_at - detected_at` in hours (mean, median, min), and the % of runs where it is > 0
- **false alarms:** healthy runs with ≥ 1 event, out of 10
- a **per-fault table** of the above

### `eval/run_eval.py`

```
python -m eval.run_eval --no-llm          # detection only, ~seconds
python -m eval.run_eval --workers 4       # + diagnosis (calls P2's eval.diagnosis_eval.evaluate(runs, workers))
python -m eval.run_eval --limit 8         # quick smoke run with first 2 scenarios of each fault
```

**Outputs:**
- `eval/report.json` (everything).
- `eval/report.md`, containing:
  1. a headline table (what P4 copies into the slides)
  2. per-fault detection table
  3. the diagnosis accuracy and confusion matrix (from P2)
  4. AMD stats: calls, tokens, average latency per diagnosis and per call, average tokens/s
  5. parameters used (detector config, number of scenarios, date)
  6. a "how to reproduce" line

**Pass bars** (00 §13): lead time > 0 in ≥ 90% of fault scenarios; at most 1 false-alarm healthy run. Accuracy ≥ 80% is P2's bar.

**Deliver:** commit `eval/report.md` with the full (LLM) run by **Sat 12:00** and send P4 the headline numbers.

---

## Your schedule

| When | Do |
|---|---|
| Thu → 21:00 | Task 1 skeleton, push, tell the team |
| Thu evening | Tasks 2–3 (machines.yaml, signal generator, faults, tests) |
| Fri morning → 13:00 | Tasks 4–6 (detector, threshold, engine, live API) |
| Fri afternoon | Task 7 integration with P2 and P3; fix hook/timing bugs |
| Fri evening | Task 8 repair vs. replace (math + oracle test; justification can use the template until P2's `llm.py` lands) |
| Sat → 12:00 | Task 9 eval, tune the detector, report on `main`, numbers to P4 |
| Sat 14:00 | Feature freeze, then bug fixes only; help P4/P3 with the video if needed |

## Pitfalls

- **Don't add a database or a second uvicorn worker.** State is in memory in one process.
- **Keep `engine.step` fast.** It runs every 100 ms in the event loop. No LLM or I/O calls there; hooks only schedule work.
- **Use timezone-aware datetimes everywhere** (`datetime(..., tzinfo=timezone.utc)`). Comparing naive and aware datetimes crashes.
- **Keep the eval deterministic.** Never use the global `np.random`.
- **Never remove or rename fields in `models.py`.** If you need a new field, ask the team. Add it as optional, and P3 adds it to `types.ts`.
