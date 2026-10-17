# Detection evaluation

Generated 2026-10-17 on a simulated plant: 40 fault runs and 10 healthy runs, with fixed seeds.

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

## Diagnosis (from eval/diagnosis_eval.py)

```json
{
  "n": 40,
  "skipped_no_event": 0,
  "accuracy": 0.975,
  "per_fault": {
    "bearing_wear": {
      "n": 10,
      "correct": 10,
      "accuracy": 1.0
    },
    "cavitation": {
      "n": 10,
      "correct": 10,
      "accuracy": 1.0
    },
    "misalignment": {
      "n": 10,
      "correct": 9,
      "accuracy": 0.9
    },
    "motor_overheat": {
      "n": 10,
      "correct": 10,
      "accuracy": 1.0
    }
  },
  "confusion": {
    "bearing_wear": {
      "bearing_wear": 10,
      "cavitation": 0,
      "misalignment": 0,
      "motor_overheat": 0,
      "other": 0
    },
    "cavitation": {
      "bearing_wear": 0,
      "cavitation": 10,
      "misalignment": 0,
      "motor_overheat": 0,
      "other": 0
    },
    "misalignment": {
      "bearing_wear": 1,
      "cavitation": 0,
      "misalignment": 9,
      "motor_overheat": 0,
      "other": 0
    },
    "motor_overheat": {
      "bearing_wear": 0,
      "cavitation": 0,
      "misalignment": 0,
      "motor_overheat": 10,
      "other": 0
    }
  },
  "verified_rate": 1.0,
  "fallback_count": 0,
  "avg_latency_ms": 31524.7,
  "median_latency_ms": 29236.5,
  "avg_llm_calls": 1.0,
  "avg_prompt_tokens": 9951.7,
  "avg_completion_tokens": 757.1,
  "avg_tokens_per_s": 24.9,
  "misdiagnosed": [
    {
      "id": "misalignment-01",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Vibration_rms has been rising steadily since 17:35 and is now at 2.189 mm/s (z=3.6), while vibration_hf is also elevated (0.377 g, z=2.8). The pattern matches bearing wear in the manual, which starts with high-frequency vibration and is followed by overall vibration; the maintenance history shows a missed re-greasing and a previous bearing replacement.",
      "error": null
    }
  ],
  "settings": {
    "agent_mode": "prefetch",
    "mock": false,
    "model": "DeepSeek-V4-Flash",
    "workers": 2
  },
  "runs": [
    {
      "id": "bearing_wear-00",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration (vibration_hf) has risen sharply and is the only signal deviating, which matches the early signature of bearing wear. The maintenance history shows a missed re-greasing and a prior bearing replacement, supporting this diagnosis.",
      "latency_ms": 35583,
      "llm_calls": 1,
      "prompt_tokens": 9608,
      "completion_tokens": 943,
      "tokens_per_s": [
        26.5
      ]
    },
    {
      "id": "bearing_wear-01",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration energy has risen sharply since 13:10, while other signals remain near normal, matching the early bearing wear signature. The maintenance history shows a missed re-greasing and a prior bearing replacement, supporting this diagnosis.",
      "latency_ms": 27083,
      "llm_calls": 1,
      "prompt_tokens": 9688,
      "completion_tokens": 652,
      "tokens_per_s": [
        24.1
      ]
    },
    {
      "id": "bearing_wear-02",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration energy (vibration_hf) has risen sharply and is the only signal deviating, matching the early bearing wear signature. The maintenance history shows a missed re-greasing and a prior bearing replacement, supporting this diagnosis.",
      "latency_ms": 24720,
      "llm_calls": 1,
      "prompt_tokens": 9687,
      "completion_tokens": 679,
      "tokens_per_s": [
        27.5
      ]
    },
    {
      "id": "bearing_wear-03",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.9,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration (vibration_hf) has risen sharply and is the only signal deviating, matching the early bearing wear signature. The maintenance history shows a missed re-greasing and a prior bearing failure, supporting this diagnosis.",
      "latency_ms": 24739,
      "llm_calls": 1,
      "prompt_tokens": 9691,
      "completion_tokens": 683,
      "tokens_per_s": [
        27.6
      ]
    },
    {
      "id": "bearing_wear-04",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration energy has risen sharply and is the only signal deviating, matching the early bearing wear signature. The pump has a history of missed lubrication and prior bearing issues, supporting this diagnosis.",
      "latency_ms": 36769,
      "llm_calls": 1,
      "prompt_tokens": 9600,
      "completion_tokens": 912,
      "tokens_per_s": [
        24.8
      ]
    },
    {
      "id": "bearing_wear-05",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration (vibration_hf) has been rising since 06:15 and is the only signal deviating, which matches the early bearing wear signature. The maintenance history shows a missed bearing re-greasing in July 2026, supporting lubrication-related bearing damage.",
      "latency_ms": 29131,
      "llm_calls": 1,
      "prompt_tokens": 9687,
      "completion_tokens": 708,
      "tokens_per_s": [
        24.3
      ]
    },
    {
      "id": "bearing_wear-06",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.9,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration energy has risen sharply and is the only signal deviating, matching the early bearing wear signature. The maintenance history shows a missed re-greasing and prior bearing issues, supporting this diagnosis.",
      "latency_ms": 29342,
      "llm_calls": 1,
      "prompt_tokens": 9600,
      "completion_tokens": 858,
      "tokens_per_s": [
        29.2
      ]
    },
    {
      "id": "bearing_wear-07",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration (vibration_hf) has risen sharply since 03:55, while overall vibration and other signals remain near normal, matching the early bearing wear signature. The maintenance history shows a missed re-greasing and a prior bearing replacement, supporting this diagnosis.",
      "latency_ms": 23958,
      "llm_calls": 1,
      "prompt_tokens": 9718,
      "completion_tokens": 754,
      "tokens_per_s": [
        31.5
      ]
    },
    {
      "id": "bearing_wear-08",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.9,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration (vibration_hf) has risen sharply and is the only signal deviating, which matches the early signature of bearing wear. The maintenance history shows a missed re-greasing and a previous bearing replacement, supporting this diagnosis.",
      "latency_ms": 21916,
      "llm_calls": 1,
      "prompt_tokens": 9686,
      "completion_tokens": 595,
      "tokens_per_s": [
        27.1
      ]
    },
    {
      "id": "bearing_wear-09",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.9,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration (vibration_hf) has risen sharply and is the only signal deviating, matching the early signature of bearing wear. The maintenance history shows a missed re-greasing and a previous bearing replacement, supporting this diagnosis.",
      "latency_ms": 25544,
      "llm_calls": 1,
      "prompt_tokens": 9597,
      "completion_tokens": 723,
      "tokens_per_s": [
        28.3
      ]
    },
    {
      "id": "cavitation-00",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure and flow are both dropping together, with a slight rise in high-frequency vibration, matching the cavitation signature. The pump is likely suffering from low suction pressure or a clogged strainer, and the condition is progressing toward loss of cooling flow.",
      "latency_ms": 27866,
      "llm_calls": 1,
      "prompt_tokens": 9736,
      "completion_tokens": 754,
      "tokens_per_s": [
        27.1
      ]
    },
    {
      "id": "cavitation-01",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure and flow are dropping together while high-frequency vibration rises, matching the cavitation signature. The pump is likely suffering from low suction pressure or a clogged strainer.",
      "latency_ms": 25125,
      "llm_calls": 1,
      "prompt_tokens": 9731,
      "completion_tokens": 714,
      "tokens_per_s": [
        28.4
      ]
    },
    {
      "id": "cavitation-02",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure is dropping sharply and flow is falling together, while high-frequency vibration is rising moderately, matching the cavitation signature. The pump is likely suffering from low suction pressure or a clogged strainer, and action is needed to prevent impeller damage.",
      "latency_ms": 38770,
      "llm_calls": 1,
      "prompt_tokens": 9754,
      "completion_tokens": 780,
      "tokens_per_s": [
        20.1
      ]
    },
    {
      "id": "cavitation-03",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure and flow are dropping together while high-frequency vibration is rising, matching the cavitation signature. The pump is likely suffering from low suction pressure or a clogged strainer, and the condition is progressing quickly.",
      "latency_ms": 27142,
      "llm_calls": 1,
      "prompt_tokens": 9735,
      "completion_tokens": 749,
      "tokens_per_s": [
        27.6
      ]
    },
    {
      "id": "cavitation-04",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.9,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure and flow are dropping together while high-frequency vibration rises, matching the cavitation signature. The flow is projected to hit its alarm limit in about 4.7 hours, so action is needed soon.",
      "latency_ms": 51042,
      "llm_calls": 2,
      "prompt_tokens": 20202,
      "completion_tokens": 1315,
      "tokens_per_s": [
        25.7,
        25.8
      ]
    },
    {
      "id": "cavitation-05",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure and flow are dropping together while high-frequency vibration rises, matching the cavitation signature. The pump is likely suffering from low suction pressure or a clogged strainer, and flow is projected to hit the alarm limit in about 7 hours.",
      "latency_ms": 32541,
      "llm_calls": 1,
      "prompt_tokens": 9755,
      "completion_tokens": 785,
      "tokens_per_s": [
        24.1
      ]
    },
    {
      "id": "cavitation-06",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure and flow are dropping together while high-frequency vibration rises, matching the cavitation signature. The pump likely has a suction-side restriction or low inlet pressure, and flow is projected to hit the low alarm in about 3.7 hours.",
      "latency_ms": 25728,
      "llm_calls": 1,
      "prompt_tokens": 9757,
      "completion_tokens": 678,
      "tokens_per_s": [
        26.4
      ]
    },
    {
      "id": "cavitation-07",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure and flow are dropping together while high-frequency vibration is rising, matching the cavitation pattern. The pump is likely losing suction due to a clogged strainer or low tank level, and needs immediate attention.",
      "latency_ms": 24443,
      "llm_calls": 1,
      "prompt_tokens": 9752,
      "completion_tokens": 619,
      "tokens_per_s": [
        25.3
      ]
    },
    {
      "id": "cavitation-08",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure and flow are dropping together while high-frequency vibration rises, matching the cavitation signature. The pump is likely suffering from low suction pressure or a clogged strainer, and flow is projected to hit the alarm limit in about 3 hours.",
      "latency_ms": 30687,
      "llm_calls": 1,
      "prompt_tokens": 9647,
      "completion_tokens": 790,
      "tokens_per_s": [
        25.7
      ]
    },
    {
      "id": "cavitation-09",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure is dropping and flow is falling together, with rising overall vibration and a slight rise in high-frequency vibration, matching the cavitation pattern. The pump has had three corrective repairs in the last year)Skip, but the leading signals point to suction-side issues rather than bearing wear or misalignment.",
      "latency_ms": 50981,
      "llm_calls": 1,
      "prompt_tokens": 9733,
      "completion_tokens": 700,
      "tokens_per_s": [
        13.7
      ]
    },
    {
      "id": "misalignment-00",
      "actual": "misalignment",
      "predicted": "misalignment",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Overall vibration (vibration_rms) has been rising steadily since 21:10 while high-frequency vibration (vibration_hf) remains near normal, matching the manual's signature for shaft misalignment. Bearing temperature is also rising slightlyaine, and the maintenance history shows a recent alignment correction and coupling replacement, supporting this diagnosis.",
      "latency_ms": 31644,
      "llm_calls": 1,
      "prompt_tokens": 9692,
      "completion_tokens": 894,
      "tokens_per_s": [
        28.3
      ]
    },
    {
      "id": "misalignment-01",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Vibration_rms has been rising steadily since 17:35 and is now at 2.189 mm/s (z=3.6), while vibration_hf is also elevated (0.377 g, z=2.8). The pattern matches bearing wear in the manual, which starts with high-frequency vibration and is followed by overall vibration; the maintenance history shows a missed re-greasing and a previous bearing replacement.",
      "latency_ms": 32094,
      "llm_calls": 1,
      "prompt_tokens": 9692,
      "completion_tokens": 882,
      "tokens_per_s": [
        27.5
      ]
    },
    {
      "id": "misalignment-02",
      "actual": "misalignment",
      "predicted": "misalignment",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Overall vibration (vibration_rms) is rising steadily and is the only signal that has deviated, while high-frequency vibration (vibration_hf) remains near normal. This pattern matches shaft misalignment, especially given a recent alignment correction and coupling replacement in the maintenance history.",
      "latency_ms": 26097,
      "llm_calls": 1,
      "prompt_tokens": 9694,
      "completion_tokens": 669,
      "tokens_per_s": [
        25.6
      ]
    },
    {
      "id": "misalignment-03",
      "actual": "misalignment",
      "predicted": "misalignment",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Overall vibration and bearing temperature are rising steadily while high-frequency vibration stays near normal, matching the misalignment signature. The machine had a recent alignment correction and coupling replacement, supporting this diagnosis.",
      "latency_ms": 31189,
      "llm_calls": 1,
      "prompt_tokens": 9738,
      "completion_tokens": 793,
      "tokens_per_s": [
        25.4
      ]
    },
    {
      "id": "misalignment-04",
      "actual": "misalignment",
      "predicted": "misalignment",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Overall vibration (vibration_rms) has been rising steadily since 20:40 and is the only signal deviating, while high-frequency vibration (vibration_hf) remains near normal. This matches the manual signature for shaft misalignment, and the machine had a recent alignment correction and coupling replacement.",
      "latency_ms": 32372,
      "llm_calls": 1,
      "prompt_tokens": 9691,
      "completion_tokens": 843,
      "tokens_per_s": [
        26.0
      ]
    },
    {
      "id": "misalignment-05",
      "actual": "misalignment",
      "predicted": "misalignment",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Overall vibration is rising first and is the only signal clearly deviating, while high-frequency vibration stays near normal, matching the misalignment signature. Bearing temperature and motor current are also creeping up, and the machine had a recent alignment correction and coupling replacement, supporting this diagnosis.",
      "latency_ms": 25401,
      "llm_calls": 1,
      "prompt_tokens": 9691,
      "completion_tokens": 713,
      "tokens_per_s": [
        28.1
      ]
    },
    {
      "id": "misalignment-06",
      "actual": "misalignment",
      "predicted": "misalignment",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Vibration RMS is rising steadily and is the only signal deviating, while high-frequency vibration stays near normal, matching the misalignment signature. Bearing temperature is also rising slightlyholistically, and the machine had a recent alignment correction and coupling replacement, supporting this diagnosis.",
      "latency_ms": 35687,
      "llm_calls": 1,
      "prompt_tokens": 9692,
      "completion_tokens": 750,
      "tokens_per_s": [
        21.0
      ]
    },
    {
      "id": "misalignment-07",
      "actual": "misalignment",
      "predicted": "misalignment",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Overall vibration (vibration_rms) is rising steadily and is the only signal deviating, while high-frequency vibration (vibration_hf) remains normal. This matches the manual's signature for shaft misalignment, not bearing wear. Recent alignment work and a coupling replacement in the maintenance history support this diagnosis.",
      "latency_ms": 26947,
      "llm_calls": 1,
      "prompt_tokens": 9691,
      "completion_tokens": 756,
      "tokens_per_s": [
        28.1
      ]
    },
    {
      "id": "misalignment-08",
      "actual": "misalignment",
      "predicted": "misalignment",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Overall vibration (vibration_rms) is rising steadily and is the only signal that has deviated, while high-frequency vibration (vibration_hf) remains near normal. This matches the manual signature for shaft misalignment, and the machine had a recent alignment correction and coupling replacement.",
      "latency_ms": 29003,
      "llm_calls": 1,
      "prompt_tokens": 9693,
      "completion_tokens": 702,
      "tokens_per_s": [
        24.2
      ]
    },
    {
      "id": "misalignment-09",
      "actual": "misalignment",
      "predicted": "misalignment",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Overall vibration (vibration_rms) is rising steadily and is the only signal that has deviated, while high-frequency vibration (vibration_hf) remains near normal. This pattern matches shaft misalignment, especially given the recent alignment correction and coupling replacement in the maintenance history.",
      "latency_ms": 31938,
      "llm_calls": 1,
      "prompt_tokens": 9694,
      "completion_tokens": 813,
      "tokens_per_s": [
        25.5
      ]
    },
    {
      "id": "motor_overheat-00",
      "actual": "motor_overheat",
      "predicted": "motor_overheat",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Motor winding temperature is rising steadily with a high anomaly score, while motor current is also elevated, and vibration signals remain normal. This pattern matches the motor overheating troubleshooting section, not bearing wear or misalignment.",
      "latency_ms": 26979,
      "llm_calls": 1,
      "prompt_tokens": 9598,
      "completion_tokens": 746,
      "tokens_per_s": [
        27.7
      ]
    },
    {
      "id": "motor_overheat-01",
      "actual": "motor_overheat",
      "predicted": "motor_overheat",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Motor temperature and current are rising together while vibration signals remain normal, matching the motor overheating signature. The trend started about 1.3 hours ago and is projected to reach alarm in about 13 hours.",
      "latency_ms": 25567,
      "llm_calls": 1,
      "prompt_tokens": 9621,
      "completion_tokens": 716,
      "tokens_per_s": [
        28.0
      ]
    },
    {
      "id": "motor_overheat-02",
      "actual": "motor_overheat",
      "predicted": "motor_overheat",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Motor winding temperature is rising steadily with a slight increase in motor current, while vibration signals remain normal. This matches the motor overheating pattern in the manual, likely due to cooling issues or electrical supply problems.",
      "latency_ms": 61665,
      "llm_calls": 1,
      "prompt_tokens": 9708,
      "completion_tokens": 637,
      "tokens_per_s": [
        10.3
      ]
    },
    {
      "id": "motor_overheat-03",
      "actual": "motor_overheat",
      "predicted": "motor_overheat",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Motor temperature and current are rising together while vibration signals remain near normal, indicating motor overheating rather than a pump mechanical fault. The pattern matches the motor overheating troubleshooting section.",
      "latency_ms": 37484,
      "llm_calls": 1,
      "prompt_tokens": 9709,
      "completion_tokens": 718,
      "tokens_per_s": [
        19.2
      ]
    },
    {
      "id": "motor_overheat-04",
      "actual": "motor_overheat",
      "predicted": "motor_overheat",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Motor winding temperature is rising steadily with a high anomaly score, while vibration signals remain normalcars. This matches the motor overheating signature in the manual, likely due to cooling issues or electrical problems.",
      "latency_ms": 28417,
      "llm_calls": 1,
      "prompt_tokens": 9709,
      "completion_tokens": 738,
      "tokens_per_s": [
        26.0
      ]
    },
    {
      "id": "motor_overheat-05",
      "actual": "motor_overheat",
      "predicted": "motor_overheat",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Motor winding temperature is rising steadily and is the only signal deviating, while vibration signals remain near normal. This matches the manual signature for motor overheating, not bearing wear or misalignment.",
      "latency_ms": 29616,
      "llm_calls": 1,
      "prompt_tokens": 9600,
      "completion_tokens": 724,
      "tokens_per_s": [
        24.4
      ]
    },
    {
      "id": "motor_overheat-06",
      "actual": "motor_overheat",
      "predicted": "motor_overheat",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Motor temperature is rising steadily with motor current also increasing, while vibration signals remain near normal. This matches the motor overheating pattern in the manual, likely due to cooling issues or electrical problems.",
      "latency_ms": 28181,
      "llm_calls": 1,
      "prompt_tokens": 9687,
      "completion_tokens": 746,
      "tokens_per_s": [
        26.5
      ]
    },
    {
      "id": "motor_overheat-07",
      "actual": "motor_overheat",
      "predicted": "motor_overheat",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Motor temperature is deviating with a high EWMA score, while vibration signals remain near normal)Skip. The pattern matches motor overheating: motor_temp rises first, motor_current follows, and vibration stays normal.",
      "latency_ms": 34500,
      "llm_calls": 1,
      "prompt_tokens": 9683,
      "completion_tokens": 675,
      "tokens_per_s": [
        19.6
      ]
    },
    {
      "id": "motor_overheat-08",
      "actual": "motor_overheat",
      "predicted": "motor_overheat",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Motor winding temperature is rising steadily while motor current is slightly elevated and vibration signals remain normal, matching the motor overheating pattern. The deviation started 1.3 hours ago and the temperature is still far from alarm limits.",
      "latency_ms": 43752,
      "llm_calls": 1,
      "prompt_tokens": 9709,
      "completion_tokens": 717,
      "tokens_per_s": [
        16.4
      ]
    },
    {
      "id": "motor_overheat-09",
      "actual": "motor_overheat",
      "predicted": "motor_overheat",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Motor winding temperature is rising steadily while vibration signals are normal or falling, matching the motor overheating pattern. The motor current is not rising yet, but the temperature trend and lack of vibration changes point to an electrical cooling issue.",
      "latency_ms": 29343,
      "llm_calls": 1,
      "prompt_tokens": 9712,
      "completion_tokens": 663,
      "tokens_per_s": [
        22.6
      ]
    }
  ]
}
```

## Reproduce

```
python -m eval.run_eval --no-llm
```
