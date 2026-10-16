# Detection evaluation

Generated 2026-10-16 on a simulated plant: 40 fault runs and 10 healthy runs, with fixed seeds.

## Headline

| Metric | Result |
|---|---|
| Faults detected before the pump failed | 40/40 (100.0%) |
| Detection delay after fault onset (median / mean) | 3.6 h / 4.3 h |
| Warning before failure, AI detector (median / minimum) | 36.4 h / 16.0 h |
| Warning before failure, legacy alarm (median / minimum) | 6.2 h / 0.2 h |
| Runs where the legacy alarm never fired | 9/40 |
| Lead time over the legacy alarm, only runs where both fired (median / minimum) | 28.6 h / 8.4 h (n=31) |
| AI earlier than the legacy alarm, or legacy never fired | 40/40 (100.0%) |
| Healthy runs with a false alarm | 0/10 (720 simulated hours, 0 events) |
| False alarms before a fault was injected | 0 runs |

Pass bars: AI earlier in at least 90% of runs: **PASS**. At most 1 healthy run with a false alarm: **PASS**.

## Per fault (medians)

| Fault | Detected | Detection delay | AI warning before failure | Legacy fired | Legacy warning before failure | Lead time |
|---|---|---|---|---|---|---|
| bearing_wear | 10/10 | 2.4 h | 41.7 h | 6/10 | 4.1 h | 39.3 h |
| cavitation | 10/10 | 1.8 h | 19.8 h | 10/10 | 7.2 h | 10.8 h |
| misalignment | 10/10 | 6.0 h | 63.8 h | 7/10 | 9.6 h | 53.6 h |
| motor_overheat | 10/10 | 6.5 h | 30.5 h | 8/10 | 5.7 h | 28.5 h |

## Runs where the legacy alarm never fired

- bearing_wear-04 (severity 0.70)
- bearing_wear-05 (severity 0.75)
- bearing_wear-07 (severity 0.74)
- bearing_wear-09 (severity 0.73)
- misalignment-02 (severity 0.70)
- misalignment-06 (severity 0.80)
- misalignment-07 (severity 0.72)
- motor_overheat-00 (severity 0.84)
- motor_overheat-07 (severity 0.89)

## Method

Each scenario simulates pump P-101 with its own random seed, severity (0.7 to 1.3), fault start (6 to 24 h after the live start), duration (80% to 120% of the default) and noise level (0.8 to 1.5 times normal). The detector learns what normal looks like from 72 h of healthy history, removes the effect of plant load, and raises an event when its smoothed score stays above the limit for several samples in a row. The legacy alarm is the fixed-limit alarm on the raw signals, which fires after 3 samples beyond a limit. All data is simulated, with fault signatures designed by the team.

Detector settings: smoothing alpha 0.1, score limit 1.5, 6 samples in a row, 72 h of history, legacy alarm 3 samples in a row.

## Reproduce

```
python -m eval.run_eval --no-llm
```
