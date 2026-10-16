from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

from backend.app.config import load_config
from eval.detection_eval import evaluate as evaluate_detection
from eval.scenarios import FAULTS, make_scenarios, run_scenario

EVAL_DIR = Path(__file__).resolve().parent


def fmt_h(x) -> str:
    return "n/a" if x is None else f"{x:.1f} h"


def build_report(det: dict, diag, runs: list, args, cfg: dict) -> str:
    o, hl, d = det["overall"], det["healthy"], cfg["detector"]
    healthy_hours = sum(r.scenario.horizon_h for r in runs if r.scenario.fault is None)
    never = [r for r in runs if r.scenario.fault is not None and r.threshold_at is None]
    delay, lead = o["detection_delay_h"], o["lead_time_h"]
    ai_w, leg_w = o["ai_warning_before_failure_h"], o["legacy_warning_before_failure_h"]

    L: list[str] = ["# Detection evaluation", ""]
    if args.limit:
        L += [f"> **SMOKE RUN** ({args.limit} scenarios per fault). These are not the final numbers.", ""]
    L += [f"Generated {date.today().isoformat()} on a simulated plant: {o['runs']} fault runs and "
          f"{hl['runs']} healthy runs, with fixed seeds.", ""]

    L += ["## Headline", "", "| Metric | Result |", "|---|---|",
          f"| Faults detected before the pump failed | {o['detected']}/{o['runs']} ({o['detection_rate_pct']}%) |",
          f"| Detection delay after fault onset (median / mean) | {fmt_h(delay['median'])} / {fmt_h(delay['mean'])} |",
          f"| Warning before failure, AI detector (median / minimum) | {fmt_h(ai_w['median'])} / {fmt_h(ai_w['min'])} |",
          f"| Warning before failure, legacy alarm (median / minimum) | {fmt_h(leg_w['median'])} / {fmt_h(leg_w['min'])} |",
          f"| Runs where the legacy alarm never fired | {o['legacy_missed']}/{o['runs']} |",
          f"| Lead time over the legacy alarm, only runs where both fired (median / minimum) | "
          f"{fmt_h(lead['median'])} / {fmt_h(lead['min'])} (n={lead['n']}) |",
          f"| AI earlier than the legacy alarm, or legacy never fired | {o['ai_earlier']}/{o['runs']} ({o['ai_earlier_pct']}%) |",
          f"| Healthy runs with a false alarm | {hl['runs_with_false_alarm']}/{hl['runs']} "
          f"({healthy_hours:g} simulated hours, {hl['total_false_events']} events) |",
          f"| False alarms before a fault was injected | {o['pre_onset_false_alarm_runs']} runs |", ""]

    bars = det["pass_bars"]
    L += [f"Pass bars: AI earlier in at least 90% of runs: **{'PASS' if bars['ai_earlier_at_least_90pct'] else 'FAIL'}**. "
          f"At most 1 healthy run with a false alarm: **{'PASS' if bars['false_alarm_runs_at_most_1'] else 'FAIL'}**.", ""]

    L += ["## Per fault (medians)", "",
          "| Fault | Detected | Detection delay | AI warning before failure | "
          "Legacy fired | Legacy warning before failure | Lead time |",
          "|---|---|---|---|---|---|---|"]
    for f in FAULTS:
        pf = det["per_fault"][f]
        L.append(f"| {f} | {pf['detected']}/{pf['runs']} | {fmt_h(pf['detection_delay_h']['median'])} | "
                 f"{fmt_h(pf['ai_warning_before_failure_h']['median'])} | {pf['legacy_fired']}/{pf['runs']} | "
                 f"{fmt_h(pf['legacy_warning_before_failure_h']['median'])} | {fmt_h(pf['lead_time_h']['median'])} |")
    L.append("")

    L += ["## Runs where the legacy alarm never fired", ""]
    if never:
        L += [f"- {r.scenario.id} (severity {r.scenario.severity:.2f})" for r in never]
    else:
        L.append("None.")
    L.append("")

    L += ["## Method", "",
          "Each scenario simulates pump P-101 with its own random seed, severity (0.7 to 1.3), "
          "fault start (6 to 24 h after the live start), duration (80% to 120% of the default) and "
          "noise level (0.8 to 1.5 times normal). The detector learns what normal looks like from "
          "72 h of healthy history, removes the effect of plant load, and raises an event when its "
          "smoothed score stays above the limit for several samples in a row. The legacy alarm is the "
          "fixed-limit alarm on the raw signals, which fires after 3 samples beyond a limit. "
          "All data is simulated, with fault signatures designed by the team.", "",
          f"Detector settings: smoothing alpha {d['ewma_alpha']}, score limit {d['ewma_limit']}, "
          f"{d['k_consecutive']} samples in a row, {cfg['sim']['history_hours']} h of history, "
          f"legacy alarm {d['threshold_consecutive']} samples in a row.", ""]

    if diag is not None:
        L += ["## Diagnosis (from eval/diagnosis_eval.py)", "", "```json",
              json.dumps(diag, indent=2, default=str), "```", ""]

    L += ["## Reproduce", "", "```", "python -m eval.run_eval --no-llm", "```", ""]
    return "\n".join(L)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-llm", action="store_true", help="detection only")
    ap.add_argument("--workers", type=int, default=2, help="parallel diagnoses (the API key is rate limited)")
    ap.add_argument("--limit", type=int, default=0, help="N scenarios per fault and N healthy (0 = all)")
    args = ap.parse_args()

    scenarios = make_scenarios()
    if args.limit:
        keep = []
        for fault in FAULTS + [None]:
            keep += [s for s in scenarios if s.fault == fault][: args.limit]
        scenarios = keep

    runs = []
    for i, s in enumerate(scenarios, 1):
        runs.append(run_scenario(s))
        print(f"[{i}/{len(scenarios)}] {s.id}", flush=True)

    det = evaluate_detection(runs)

    diag = None
    if not args.no_llm:
        try:
            from eval.diagnosis_eval import evaluate as evaluate_diagnosis
        except ImportError:
            print("eval/diagnosis_eval.py is not there yet (P2's part): detection results only.")
        else:
            diag = evaluate_diagnosis(runs, args.workers)

    cfg = load_config()
    suffix = "_smoke" if args.limit else ""
    (EVAL_DIR / f"report{suffix}.md").write_text(build_report(det, diag, runs, args, cfg), encoding="utf-8")
    (EVAL_DIR / f"report{suffix}.json").write_text(
        json.dumps({"detection": det, "diagnosis": diag, "scenarios": len(scenarios)},
                   indent=2, default=str), encoding="utf-8")
    print(f"Wrote eval/report{suffix}.md and eval/report{suffix}.json")


if __name__ == "__main__":
    main()