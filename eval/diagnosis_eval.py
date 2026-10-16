"""Diagnosis eval (P2): run the agent on every simulated fault event and score it.

P1's run_eval.py calls evaluate(runs, workers) and puts markdown(result) in eval/report.md.
Only fault scenarios count (scenario.fault set): a healthy run has no right answer, and its
false alarms are scored by P1's detection eval.
"""
from __future__ import annotations

import statistics
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING

from backend.app.agent import llm
from backend.app.agent.diagnose import agent_mode, diagnose

if TYPE_CHECKING:
    from eval.scenarios import ScenarioRun  # P1

FAULTS = ["bearing_wear", "cavitation", "misalignment", "motor_overheat"]
PREDICTED = FAULTS + ["other"]


def _diagnose_run(run: "ScenarioRun") -> dict:
    """One diagnosis -> one result row. Never raises."""
    actual = run.scenario.fault
    try:
        res = diagnose(run.engine_at_event, run.event, purpose="eval")
    except Exception as e:  # diagnose() should not raise; keep the eval going if it does
        return {"id": run.scenario.id, "actual": actual, "predicted": None, "confidence": 0.0, "verified": False,
                "fallback": True, "error": f"{type(e).__name__}: {e}", "summary": "", "latency_ms": 0,
                "llm_calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "tokens_per_s": []}
    d = res.diagnosis
    ok_calls = [c for c in res.calls if c.ok]
    return {
        "id": run.scenario.id, "actual": actual, "predicted": d.fault, "confidence": d.confidence,
        "verified": d.verified, "fallback": res.used_fallback, "error": res.error, "summary": d.summary,
        "latency_ms": sum(s.latency_ms for s in res.trace if s.kind == "llm"),
        "llm_calls": len(res.calls),
        "prompt_tokens": sum(c.prompt_tokens for c in res.calls),
        "completion_tokens": sum(c.completion_tokens for c in res.calls),
        "tokens_per_s": [c.tokens_per_s for c in ok_calls],
    }


def _mean(xs) -> float:
    return round(statistics.mean(xs), 1) if xs else 0.0


def evaluate(runs: list["ScenarioRun"], workers: int = 4) -> dict:
    todo = [r for r in runs if r.event is not None and r.scenario.fault is not None]
    with ThreadPoolExecutor(max(1, workers)) as pool:
        rows = list(pool.map(_diagnose_run, todo))

    n = len(rows)
    correct = [r for r in rows if r["predicted"] == r["actual"]]
    confusion = {a: {p: 0 for p in PREDICTED} for a in FAULTS}
    for r in rows:
        if r["predicted"] in PREDICTED:
            confusion[r["actual"]][r["predicted"]] += 1
    per_fault = {}
    for f in FAULTS:
        fr = [r for r in rows if r["actual"] == f]
        hits = sum(r["predicted"] == f for r in fr)
        per_fault[f] = {"n": len(fr), "correct": hits, "accuracy": round(hits / len(fr), 3) if fr else None}
    latencies = [r["latency_ms"] for r in rows if r["llm_calls"]]
    tps = [x for r in rows for x in r["tokens_per_s"]]

    return {
        "n": n,
        "skipped_no_event": sum(1 for r in runs if r.event is None and r.scenario.fault is not None),
        "accuracy": round(len(correct) / n, 3) if n else None,
        "per_fault": per_fault,
        "confusion": confusion,  # rows = actual, columns = predicted
        "verified_rate": round(sum(r["verified"] for r in rows) / n, 3) if n else None,
        "fallback_count": sum(r["fallback"] for r in rows),
        "avg_latency_ms": _mean(latencies),
        "median_latency_ms": round(statistics.median(latencies), 1) if latencies else 0.0,
        "avg_llm_calls": _mean([r["llm_calls"] for r in rows]),
        "avg_prompt_tokens": _mean([r["prompt_tokens"] for r in rows]),
        "avg_completion_tokens": _mean([r["completion_tokens"] for r in rows]),
        "avg_tokens_per_s": _mean(tps),
        "misdiagnosed": [{"id": r["id"], "actual": r["actual"], "predicted": r["predicted"],
                          "confidence": r["confidence"], "summary": r["summary"], "error": r["error"]}
                         for r in rows if r["predicted"] != r["actual"]],
        "settings": {"agent_mode": agent_mode(), "mock": llm.is_mock(), "model": llm.stats().model,
                     "workers": workers},
        "runs": rows,
    }


def markdown(result: dict) -> str:
    """Diagnosis section for eval/report.md."""
    def pct(x):
        return "n/a" if x is None else f"{100 * x:.0f}%"

    s = result["settings"]
    lines = [
        "## Diagnosis (AI agent on AMD)",
        "",
        f"Model `{s['model']}`, AGENT_MODE `{s['agent_mode']}`{' (MOCK: rule-based only)' if s['mock'] else ''}.",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Diagnosed fault scenarios | {result['n']} |",
        f"| Top-1 accuracy | {pct(result['accuracy'])} |",
        f"| Evidence verified | {pct(result['verified_rate'])} |",
        f"| Rule-based fallbacks | {result['fallback_count']} |",
        f"| Latency per diagnosis (mean / median) | {result['avg_latency_ms'] / 1000:.1f} s / "
        f"{result['median_latency_ms'] / 1000:.1f} s |",
        f"| LLM calls per diagnosis | {result['avg_llm_calls']} |",
        f"| Tokens per diagnosis (prompt / completion) | {result['avg_prompt_tokens']:.0f} / "
        f"{result['avg_completion_tokens']:.0f} |",
        f"| Avg tokens/s per call | {result['avg_tokens_per_s']} |",
        "",
        "Confusion matrix (rows = injected fault, columns = diagnosed):",
        "",
        "| actual \\ predicted | " + " | ".join(PREDICTED) + " | accuracy |",
        "|---|" + "---|" * (len(PREDICTED) + 1),
    ]
    for f in FAULTS:
        row = result["confusion"][f]
        lines.append(f"| {f} | " + " | ".join(str(row[p]) for p in PREDICTED)
                     + f" | {pct(result['per_fault'][f]['accuracy'])} |")
    if result["misdiagnosed"]:
        lines += ["", "Misdiagnosed:", ""]
        lines += [f"- `{m['id']}`: predicted `{m['predicted']}` ({m['confidence']:.2f}). {m['summary']}"
                  for m in result["misdiagnosed"]]
    return "\n".join(lines) + "\n"
