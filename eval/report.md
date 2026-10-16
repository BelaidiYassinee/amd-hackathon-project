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

## Diagnosis (from eval/diagnosis_eval.py)

```json
{
  "n": 40,
  "skipped_no_event": 0,
  "accuracy": 0.75,
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
      "correct": 0,
      "accuracy": 0.0
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
      "bearing_wear": 10,
      "cavitation": 0,
      "misalignment": 0,
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
  "avg_latency_ms": 28422.5,
  "median_latency_ms": 26980.0,
  "avg_llm_calls": 1.1,
  "avg_prompt_tokens": 5574.8,
  "avg_completion_tokens": 781.5,
  "avg_tokens_per_s": 28.2,
  "misdiagnosed": [
    {
      "id": "misalignment-00",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Vibration RMS is rising steadily and has been deviating for 1.8 hours, while high-frequency vibration energy is also increasing, indicating early bearing wear. The machine had a bearing replaced in August 2025 and a scheduled re-greasing was skipped in July 2026, supporting this diagnosis.",
      "error": null
    },
    {
      "id": "misalignment-01",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Vibration RMS is rising steadily and high-frequency vibration is elevated, while bearing temperature is falling, indicating early bearing wear rather than misalignment or cavitation. The manual troubleshooting section for bearing wear matches this pattern, and the machine has a history of bearing issues and missed lubrication.",
      "error": null
    },
    {
      "id": "misalignment-02",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Overall vibration is rising steadily and high-frequency vibration is slightly up, while discharge pressure is slowly dropping. This pattern matches bearing wear in the manual, and the machine has a history of skipped bearing re-greasing and prior bearing replacement.",
      "error": null
    },
    {
      "id": "misalignment-03",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Vibration RMS and bearing temperature are rising together, indicating progressive bearing wear. The pattern matches the bearing wear troubleshooting section, and the machine has a history of bearing issues and missed lubrication.",
      "error": null
    },
    {
      "id": "misalignment-04",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Vibration RMS is rising steadily and is the only signal beyond the anomaly threshold, suggesting progressive bearing wear. The maintenance history shows a skipped bearing re-greasing and a prior bearing replacement, supporting this diagnosis.",
      "error": null
    },
    {
      "id": "misalignment-05",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Vibration RMS is rising steadily and is the only signal beyond the anomaly threshold, while bearing temperature is also trending upwardched. The manual troubleshooting section for bearing wear matches this pattern, and the machine has a history of bearing issues and missed re-greasing.",
      "error": null
    },
    {
      "id": "misalignment-06",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Vibration RMS is rising and has been deviating for 2.9 hours, with a slight increase in bearing temperature. The manual troubleshooting section for bearing wear matches this pattern, and the machine has a history of bearing issues and missed lubrication.",
      "error": null
    },
    {
      "id": "misalignment-07",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Vibration RMS is rising steadily and is the only signal deviating, while high-frequency vibration and motor current remain normal. This pattern matches bearing wear progression, especially given a missed bearing re-greasing and a prior bearing replacement.",
      "error": null
    },
    {
      "id": "misalignment-08",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Vibration RMS is rising steadily and is the only signal beyond the anomaly threshold, while flow is dropping and discharge pressure is slightly low. The pattern matches bearing wear progression, especially given a missed re-greasing and prior bearing replacement history.",
      "error": null
    },
    {
      "id": "misalignment-09",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "summary": "Overall vibration is rising steadily while flow and high-frequency vibration are falling, indicating progressive bearing wear rather than cavitation or misalignment. The machine has a history of skipped bearing re-greasing and prior bearing replacement, and the manual troubleshooting section for bearing wear matches this pattern.",
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
      "summary": "High-frequency vibration is rising sharply while overall vibration and discharge pressure are slightly falling, indicating early bearing wear. The machine had a skipped bearing re-greasing and a prior bearing replacement, and the manual links this pattern to bearing wear.",
      "latency_ms": 39232,
      "llm_calls": 1,
      "prompt_tokens": 5195,
      "completion_tokens": 785,
      "tokens_per_s": [
        20.0
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
      "summary": "High-frequency vibration energy is rising sharply and is the only signal beyond the anomaly threshold, while bearing temperature is also trending upwardholistically. The manual's bearing wear troubleshooting section matches this pattern, and the machine has a history of bearing issues and missed lubrication.",
      "latency_ms": 31536,
      "llm_calls": 1,
      "prompt_tokens": 5269,
      "completion_tokens": 871,
      "tokens_per_s": [
        27.6
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
      "summary": "High-frequency vibration is sharply rising while discharge pressure and bearing temperature are falling, indicating early bearing wear. The manual section P101-TS-01 confirms this pattern, and the machine has a history of bearing issues and skipped re-greasing.",
      "latency_ms": 32131,
      "llm_calls": 1,
      "prompt_tokens": 5270,
      "completion_tokens": 860,
      "tokens_per_s": [
        26.8
      ]
    },
    {
      "id": "bearing_wear-03",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration is rising sharply while motor and bearing temperatures are falling, indicating early bearing wear rather than overheating. The vibration pattern matches the manual's bearing wear signature, and the machine has a history of bearing issues and skipped lubrication.",
      "latency_ms": 40274,
      "llm_calls": 1,
      "prompt_tokens": 5276,
      "completion_tokens": 905,
      "tokens_per_s": [
        22.5
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
      "summary": "High-frequency vibration energy is rising sharply and is already well above baseline, while bearing temperature is also trending upward. This pattern matches the bearing wear troubleshooting section, and the machine has a history of bearing issues and missed lubrication.",
      "latency_ms": 34378,
      "llm_calls": 1,
      "prompt_tokens": 5183,
      "completion_tokens": 885,
      "tokens_per_s": [
        25.7
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
      "summary": "High-frequency vibration is rising sharply while overall vibration is falling, indicating localized bearing damage rather than a general imbalance. The motor current is also trending up, consistent with increased friction from a worn bearing.",
      "latency_ms": 25281,
      "llm_calls": 1,
      "prompt_tokens": 5273,
      "completion_tokens": 741,
      "tokens_per_s": [
        29.3
      ]
    },
    {
      "id": "bearing_wear-06",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration energy is rising sharply while motor current and temperatures are falling, indicating early bearing wear rather than an electrical or process issue. The pattern matches the bearing wear troubleshooting section and the machine has a history of bearing problems.",
      "latency_ms": 31937,
      "llm_calls": 1,
      "prompt_tokens": 5186,
      "completion_tokens": 902,
      "tokens_per_s": [
        28.2
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
      "summary": "High-frequency vibration is rising sharply while motor temperature is falling, indicating early bearing wear rather than motor overheating. The pattern matches the manual's bearing wear signature and the machine has a history of bearing issues.",
      "latency_ms": 25934,
      "llm_calls": 1,
      "prompt_tokens": 5303,
      "completion_tokens": 699,
      "tokens_per_s": [
        27.0
      ]
    },
    {
      "id": "bearing_wear-08",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration is rising sharply while overall vibration and flow are stable or slightly down, indicating localized bearing damage. The machine had a skipped bearing re-greasing and a prior bearing replacement, and the manual's bearing wear section matches this pattern.",
      "latency_ms": 34531,
      "llm_calls": 1,
      "prompt_tokens": 5271,
      "completion_tokens": 729,
      "tokens_per_s": [
        21.1
      ]
    },
    {
      "id": "bearing_wear-09",
      "actual": "bearing_wear",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "High-frequency vibration is rising sharply and is the only signal beyond the anomaly threshold, indicating early bearing wear. Motor current and temperature are also trending up, consistent with increased friction from a worn bearing.",
      "latency_ms": 28460,
      "llm_calls": 1,
      "prompt_tokens": 5182,
      "completion_tokens": 838,
      "tokens_per_s": [
        29.4
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
      "summary": "Discharge pressure and flow are dropping while high-frequency vibration is rising, indicating cavitation in the pump. The pattern matches the cavitation troubleshooting section, and the pump has a history of skipped bearing maintenance and recent corrective repairs.",
      "latency_ms": 27950,
      "llm_calls": 1,
      "prompt_tokens": 5321,
      "completion_tokens": 825,
      "tokens_per_s": [
        29.5
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
      "summary": "Discharge pressure and flow are dropping sharply while high-frequency vibration is rising, indicating cavitation in the pump. The pattern matches the manual's cavitation troubleshooting section, and the flow is projected to hit its alarm limit in about 3 hours.",
      "latency_ms": 19694,
      "llm_calls": 1,
      "prompt_tokens": 5316,
      "completion_tokens": 666,
      "tokens_per_s": [
        33.8
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
      "summary": "Discharge pressure is dropping sharply while high-frequency vibration and overall vibration are rising, with flow also declining. This pattern matches cavitation, likely due to suction blockage or low NPSH.",
      "latency_ms": 26363,
      "llm_calls": 1,
      "prompt_tokens": 5339,
      "completion_tokens": 729,
      "tokens_per_s": [
        27.7
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
      "summary": "Discharge pressure and flow are dropping while high-frequency vibration is rising, indicating cavitation in the pump. The pattern matches the cavitation troubleshooting section, and the pump has a history of skipped bearing maintenance and recent seal/coupling repairs.",
      "latency_ms": 25742,
      "llm_calls": 1,
      "prompt_tokens": 5320,
      "completion_tokens": 748,
      "tokens_per_s": [
        29.1
      ]
    },
    {
      "id": "cavitation-04",
      "actual": "cavitation",
      "predicted": "cavitation",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Discharge pressure and flow are dropping while high-frequency vibration is rising, indicating cavitation. The flow is projected to hit its low alarm in about 4.7 hours, so action is needed soon.",
      "latency_ms": 25156,
      "llm_calls": 1,
      "prompt_tokens": 5321,
      "completion_tokens": 762,
      "tokens_per_s": [
        30.3
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
      "summary": "Discharge pressure and flow are dropping while high-frequency vibration is rising, indicating cavitation in the pump. The pattern matches the cavitation troubleshooting section, and the flow is projected to hit its low alarm in about 7 hours.",
      "latency_ms": 22046,
      "llm_calls": 1,
      "prompt_tokens": 5340,
      "completion_tokens": 641,
      "tokens_per_s": [
        29.1
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
      "summary": "Discharge pressure and flow are dropping while high-frequency vibration is rising, indicating cavitation in the pump. The pattern matches the cavitation troubleshooting section and is supported by sensor trends.",
      "latency_ms": 24640,
      "llm_calls": 1,
      "prompt_tokens": 5342,
      "completion_tokens": 706,
      "tokens_per_s": [
        28.7
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
      "summary": "Flow and discharge pressure are dropping while high-frequency vibration is rising, indicating cavitation in the pump. The pattern matches the cavitation troubleshooting section in the manual.",
      "latency_ms": 26773,
      "llm_calls": 1,
      "prompt_tokens": 5337,
      "completion_tokens": 651,
      "tokens_per_s": [
        24.3
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
      "summary": "Discharge pressure and flow are dropping while high-frequency vibration is rising, indicating cavitation in the pump. The pattern matches the cavitation troubleshooting section, and the flow is projected to hit the low alarm in about 3.3 hours.",
      "latency_ms": 26051,
      "llm_calls": 1,
      "prompt_tokens": 5232,
      "completion_tokens": 761,
      "tokens_per_s": [
        29.2
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
      "summary": "Discharge pressure is dropping sharply while vibration is rising and flow is falling, a pattern consistent with cavitation. The manual troubleshooting section for cavitation (P101-TS-02) matches this symptom set.",
      "latency_ms": 23839,
      "llm_calls": 1,
      "prompt_tokens": 5316,
      "completion_tokens": 666,
      "tokens_per_s": [
        27.9
      ]
    },
    {
      "id": "misalignment-00",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Vibration RMS is rising steadily and has been deviating for 1.8 hours, while high-frequency vibration energy is also increasing, indicating early bearing wear. The machine had a bearing replaced in August 2025 and a scheduled re-greasing was skipped in July 2026, supporting this diagnosis.",
      "latency_ms": 23312,
      "llm_calls": 1,
      "prompt_tokens": 5276,
      "completion_tokens": 674,
      "tokens_per_s": [
        28.9
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
      "summary": "Vibration RMS is rising steadily and high-frequency vibration is elevated, while bearing temperature is falling, indicating early bearing wear rather than misalignment or cavitation. The manual troubleshooting section for bearing wear matches this pattern, and the machine has a history of bearing issues and missed lubrication.",
      "latency_ms": 31620,
      "llm_calls": 1,
      "prompt_tokens": 5271,
      "completion_tokens": 905,
      "tokens_per_s": [
        28.6
      ]
    },
    {
      "id": "misalignment-02",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Overall vibration is rising steadily and high-frequency vibration is slightly up, while discharge pressure is slowly dropping. This pattern matches bearing wear in the manual, and the machine has a history of skipped bearing re-greasing and prior bearing replacement.",
      "latency_ms": 29446,
      "llm_calls": 1,
      "prompt_tokens": 5279,
      "completion_tokens": 730,
      "tokens_per_s": [
        24.8
      ]
    },
    {
      "id": "misalignment-03",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Vibration RMS and bearing temperature are rising together, indicating progressive bearing wear. The pattern matches the bearing wear troubleshooting section, and the machine has a history of bearing issues and missed lubrication.",
      "latency_ms": 29867,
      "llm_calls": 1,
      "prompt_tokens": 5321,
      "completion_tokens": 656,
      "tokens_per_s": [
        22.0
      ]
    },
    {
      "id": "misalignment-04",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Vibration RMS is rising steadily and is the only signal beyond the anomaly threshold, suggesting progressive bearing wear. The maintenance history shows a skipped bearing re-greasing and a prior bearing replacement, supporting this diagnosis.",
      "latency_ms": 27802,
      "llm_calls": 1,
      "prompt_tokens": 5272,
      "completion_tokens": 870,
      "tokens_per_s": [
        31.3
      ]
    },
    {
      "id": "misalignment-05",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Vibration RMS is rising steadily and is the only signal beyond the anomaly threshold, while bearing temperature is also trending upwardched. The manual troubleshooting section for bearing wear matches this pattern, and the machine has a history of bearing issues and missed re-greasing.",
      "latency_ms": 29568,
      "llm_calls": 1,
      "prompt_tokens": 5274,
      "completion_tokens": 892,
      "tokens_per_s": [
        30.2
      ]
    },
    {
      "id": "misalignment-06",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Vibration RMS is rising and has been deviating for 2.9 hours, with a slight increase in bearing temperature. The manual troubleshooting section for bearing wear matches this pattern, and the machine has a history of bearing issues and missed lubrication.",
      "latency_ms": 22144,
      "llm_calls": 1,
      "prompt_tokens": 5275,
      "completion_tokens": 616,
      "tokens_per_s": [
        27.8
      ]
    },
    {
      "id": "misalignment-07",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Vibration RMS is rising steadily and is the only signal deviating, while high-frequency vibration and motor current remain normal. This pattern matches bearing wear progression, especially given a missed bearing re-greasing and a prior bearing replacement.",
      "latency_ms": 14766,
      "llm_calls": 1,
      "prompt_tokens": 5275,
      "completion_tokens": 665,
      "tokens_per_s": [
        45.0
      ]
    },
    {
      "id": "misalignment-08",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Vibration RMS is rising steadily and is the only signal beyond the anomaly threshold, while flow is dropping and discharge pressure is slightly low. The pattern matches bearing wear progression, especially given a missed re-greasing and prior bearing replacement history.",
      "latency_ms": 23847,
      "llm_calls": 1,
      "prompt_tokens": 5276,
      "completion_tokens": 720,
      "tokens_per_s": [
        30.2
      ]
    },
    {
      "id": "misalignment-09",
      "actual": "misalignment",
      "predicted": "bearing_wear",
      "confidence": 0.85,
      "verified": true,
      "fallback": false,
      "error": null,
      "summary": "Overall vibration is rising steadily while flow and high-frequency vibration are falling, indicating progressive bearing wear rather than cavitation or misalignment. The machine has a history of skipped bearing re-greasing and prior bearing replacement, and the manual troubleshooting section for bearing wear matches this pattern.",
      "latency_ms": 28296,
      "llm_calls": 1,
      "prompt_tokens": 5276,
      "completion_tokens": 877,
      "tokens_per_s": [
        31.0
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
      "summary": "Motor winding temperature is rising steadily and is the only signal beyond the anomaly threshold, while flow and motor current also increased. This pattern matches the motor overheating troubleshooting section, likely due to cooling or insulation issues.",
      "latency_ms": 22599,
      "llm_calls": 1,
      "prompt_tokens": 5183,
      "completion_tokens": 699,
      "tokens_per_s": [
        30.9
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
      "summary": "Motor temperature and current are rising together, indicating increased motor load and heat generation. The pattern matches the motor overheating troubleshooting section, and the machine has had multiple corrective repairs in the past year.",
      "latency_ms": 21204,
      "llm_calls": 1,
      "prompt_tokens": 5211,
      "completion_tokens": 657,
      "tokens_per_s": [
        31.0
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
      "summary": "Motor temperature is rising steadily and is the only signal beyond the anomaly threshold, while vibration and flow are normal. This pattern points to motor overheating, likely due to cooling or insulation issues, rather than mechanical faults.",
      "latency_ms": 17674,
      "llm_calls": 1,
      "prompt_tokens": 5295,
      "completion_tokens": 759,
      "tokens_per_s": [
        42.9
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
      "summary": "Motor temperature and current are rising together, with high-frequency vibration also elevated, indicating the motor is overheating. The pattern matches the motor overheating troubleshooting section, and the projected time to alarm is about 14.5 hours based on motor current.",
      "latency_ms": 25136,
      "llm_calls": 1,
      "prompt_tokens": 5297,
      "completion_tokens": 606,
      "tokens_per_s": [
        24.1
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
      "summary": "Motor winding temperature is rising steadily and is the only signal beyond the anomaly threshold, while bearing temperature is also slightly elevated)Skip. The pattern matches the motor overheating troubleshooting section, and the machine has had three corrective repairs in the last year, suggesting a recurring issue.",
      "latency_ms": 22496,
      "llm_calls": 1,
      "prompt_tokens": 5299,
      "completion_tokens": 668,
      "tokens_per_s": [
        29.7
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
      "summary": "Motor winding temperature is rising steadily and is the only signal beyond the anomaly threshold, while motor current and vibration are near normal. This pattern points to motor overheating, likely due to cooling or insulation issues, rather than mechanical faults.",
      "latency_ms": 51006,
      "llm_calls": 2,
      "prompt_tokens": 11141,
      "completion_tokens": 1432,
      "tokens_per_s": [
        27.9,
        28.2
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
      "summary": "Motor temperature is rising steadily with increasing motor current, while vibration and flow are declining, indicating a motor cooling or electrical issue rather than a mechanical fault. The pattern matches the motor overheating troubleshooting section.",
      "latency_ms": 55325,
      "llm_calls": 2,
      "prompt_tokens": 11309,
      "completion_tokens": 1428,
      "tokens_per_s": [
        28.0,
        23.9
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
      "summary": "Motor temperature is deviating with a high anomaly score, while motor current and bearing temperature are trending down after an earlier rise, suggesting a cooling or insulation issue rather than a mechanical fault. The manual troubleshooting section for motor overheating matches the pattern.",
      "latency_ms": 30592,
      "llm_calls": 1,
      "prompt_tokens": 5271,
      "completion_tokens": 603,
      "tokens_per_s": [
        19.7
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
      "summary": "Motor temperature is rising steadily and is the only signal beyond the anomaly threshold, while current is slightly up and vibration is stable. This pattern points to motor overheating, likely from cooling or insulation issues, not bearing or alignment problems.",
      "latency_ms": 27187,
      "llm_calls": 1,
      "prompt_tokens": 5299,
      "completion_tokens": 764,
      "tokens_per_s": [
        28.1
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
      "summary": "Motor temperature is rising steadily and is the only signal beyond the alarm threshold, while vibration and current remain normal. This pattern matches the motor overheating troubleshooting section, likely due to cooling issues or insulation degradation.",
      "latency_ms": 31063,
      "llm_calls": 1,
      "prompt_tokens": 5299,
      "completion_tokens": 667,
      "tokens_per_s": [
        21.5
      ]
    }
  ]
}
```

## Reproduce

```
python -m eval.run_eval --no-llm
```
