"""The diagnosis agent: a tool-calling loop on the AMD Radeon API, with evidence validation.

diagnose() is synchronous and runs in P4's worker thread; never call it from engine.step or a hook.
It never raises: on an AMD API error, in mock mode, or on an unexpected agent error it returns
the rule-based fallback with used_fallback=True and the reason in `error`.

Headless CLI:  python -m backend.app.agent.diagnose --fault bearing_wear [--seed 7]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from dataclasses import dataclass
from typing import Callable

from pydantic import ValidationError

from backend.app.agent import fallback, llm, prompts, tools, validate
from backend.app.models import AnomalyEvent, Diagnosis, LlmCall, LlmPurpose, TraceStep

MAX_TURNS = 8
MAX_TOKENS = 2500  # 1500 cut two real tools-mode answers mid-JSON (reasoning tokens count too)
# Team decision 2026-10-16: prefetch for the demo (1 AMD call, ~35 s) over tools (~3 calls, ~2 min).
# AGENT_MODE=tools keeps the native tool-calling loop.
DEFAULT_AGENT_MODE = "prefetch"
_FENCE = re.compile(r"```(?:json)?", re.I)
_THINK = re.compile(r"<think>.*?</think>", re.S)

# prefetch mode: contribution (signal, direction) -> manual search phrase
SEARCH_PHRASES = {
    ("vibration_hf", "up"): "high frequency vibration energy rising",
    ("vibration_rms", "up"): "overall vibration rising",
    ("bearing_temp", "up"): "bearing temperature rising",
    ("motor_temp", "up"): "motor temperature rising",
    ("motor_current", "up"): "motor current rising",
    ("motor_current", "down"): "motor current dropping",
    ("discharge_pressure", "down"): "discharge pressure dropping fluctuating",
    ("flow", "down"): "flow falling",
}


@dataclass
class DiagnosisResult:
    diagnosis: Diagnosis
    trace: list[TraceStep]
    calls: list[LlmCall]
    used_fallback: bool
    error: str | None


class _AgentFailed(Exception):
    """The model gave no usable answer (e.g. unparseable JSON twice)."""


class _Run:
    """State of one diagnosis: trace steps (pushed live to on_step) and LLM calls."""

    def __init__(self, engine, event: AnomalyEvent, purpose: LlmPurpose, on_step):
        self.engine, self.event, self.purpose, self.on_step = engine, event, purpose, on_step
        self.mid = event.machine_id
        self.trace: list[TraceStep] = []
        self.calls: list[LlmCall] = []
        self.seen: set[str] = {s.name for s in engine.signal_specs(self.mid)}

    def step(self, kind, name, input=None, output=None, latency_ms=0, prompt_tokens=None, completion_tokens=None):
        s = TraceStep(i=len(self.trace) + 1, kind=kind, name=name, input=input, output=output,
                      latency_ms=latency_ms, prompt_tokens=prompt_tokens, completion_tokens=completion_tokens)
        self.trace.append(s)
        if self.on_step:
            try:
                self.on_step(s)
            except Exception:
                pass  # a UI hook must never break the diagnosis
        return s

    def chat(self, messages, input_desc: str, *, tools_=None, json_mode=False) -> llm.ChatResult:
        r = llm.chat(messages, purpose=self.purpose, tools=tools_, json_mode=json_mode,
                     temperature=0.2, max_tokens=MAX_TOKENS)
        self.calls.append(r.call)
        if r.truncated:
            output = f"answer cut at max_tokens ({MAX_TOKENS})"
        elif r.tool_calls:
            output = "tool_calls: " + ", ".join(f"{tc['name']}({_short_args(tc['arguments'])})" for tc in r.tool_calls)
        else:
            output = "final JSON" if r.content and "{" in r.content else f"text: {(r.content or '')[:80]}"
        self.step("llm", "chat.completions", input=input_desc, output=output, latency_ms=r.call.latency_ms,
                  prompt_tokens=r.call.prompt_tokens, completion_tokens=r.call.completion_tokens)
        return r

    def tool(self, name: str, args: dict, parse_error: str | None = None):
        t0 = time.perf_counter()
        if parse_error:
            result = {"error": f"could not parse your arguments ({parse_error}); send valid JSON"}
        else:
            result = tools.run_tool(self.engine, name, args, self.seen)
        self.step("tool", name, input=args, output=_compact(name, result),
                  latency_ms=int((time.perf_counter() - t0) * 1000))
        return result

    def check_answer(self, content: str | None, truncated: bool = False) -> tuple[Diagnosis | None, list[str]]:
        d, errors = parse_diagnosis(content)
        if d is None and truncated:
            errors = [prompts.TRUNCATED_HINT] + errors
        if d is not None:
            errors = validate.finalize(d, self.engine, self.mid, self.seen)
        n_ev = len(d.evidence) if d else 0
        self.step("validation", "validate", input=f"{n_ev} evidence refs, {len(d.parts) if d else 0} parts",
                  output=validate.summary(d, errors))
        return d, errors


# ---------- helpers ----------
def agent_mode() -> str:
    """'prefetch' or 'tools' (from AGENT_MODE)."""
    mode = os.getenv("AGENT_MODE", DEFAULT_AGENT_MODE).strip().lower()
    return mode if mode in ("prefetch", "tools") else DEFAULT_AGENT_MODE


def _short_args(args: dict) -> str:
    vals = [v for k, v in args.items() if k != "machine_id"] or list(args.values())
    return ", ".join(repr(v) if isinstance(v, str) and " " in v else str(v) for v in vals)


def _compact(name: str, result):
    """Short version of a tool result for the trace (the model gets the full one)."""
    if isinstance(result, dict) and "error" in result:
        return result
    if name == "get_sensor_summary":
        return {k: v for k, v in result.items() if k != "hourly_means"} | {"hourly_means": len(result["hourly_means"])}
    if name == "get_maintenance_history":
        return {"corrective_last_12m": result["corrective_last_12m"], "records": [r["id"] for r in result["records"]]}
    if name == "search_manual":
        return [{"section_id": s["section_id"], "score": s["score"]} for s in result]
    if name == "check_spare_parts":
        rows = result["parts"] if isinstance(result, dict) else result
        return [{"part_no": p["part_no"], "in_stock": p["in_stock"]} for p in rows]
    return result


def parse_diagnosis(text: str | None) -> tuple[Diagnosis | None, list[str]]:
    """Model text -> Diagnosis, or (None, readable errors)."""
    if not text or not text.strip():
        return None, ["empty answer; reply with only the JSON object"]
    text = _FENCE.sub("", _THINK.sub("", text))
    starts = [i for i, ch in enumerate(text) if ch == "{"]
    if not starts:
        return None, ["no JSON object found in the answer"]
    obj, first_error = None, None
    for start in starts[:20]:  # first complete JSON object wins; text after it is ignored
        try:
            candidate, _ = json.JSONDecoder().raw_decode(text, start)
        except json.JSONDecodeError as e:
            first_error = first_error or e
            continue
        if isinstance(candidate, dict):
            obj = candidate
            break
    if obj is None:
        return None, [f"invalid JSON: {first_error}" if first_error else "the answer must be a JSON object"]
    obj.pop("verified", None)  # backend-owned fields
    obj.pop("validation_errors", None)
    for p in obj.get("parts") or []:
        if isinstance(p, dict):
            p.setdefault("name", "")  # overwritten from inventory anyway
    try:
        return Diagnosis.model_validate(obj), []
    except ValidationError as e:
        return None, [f"{'.'.join(str(x) for x in err['loc']) or 'answer'}: {err['msg']}" for err in e.errors()]


def _fix_message(errors: list[str], prompt: str = prompts.FIX_PROMPT) -> dict:
    return {"role": "user", "content": prompt + "\n".join(f"- {e}" for e in errors)}


# ---------- modes ----------
def _run_tools(run: _Run) -> Diagnosis:
    messages = [{"role": "system", "content": prompts.system_prompt(run.engine)},
                {"role": "user", "content": prompts.user_message(run.engine, run.event)}]
    input_desc = f"system + anomaly event {run.event.id}"
    failed_answers = 0
    force_json = False  # set after an answer with no usable JSON: next call is JSON-only, no tools
    for _ in range(MAX_TURNS):
        r = run.chat(messages, input_desc, tools_=None if force_json else tools.TOOLS, json_mode=force_json)
        if r.tool_calls:
            messages.append(r.raw_message)
            for tc in r.tool_calls:
                result = run.tool(tc["name"], tc["arguments"], tc.get("parse_error"))
                messages.append({"role": "tool", "tool_call_id": tc["id"],
                                 "content": tools.tool_message_content(result)})
            input_desc = f"{len(r.tool_calls)} tool result(s)"
            continue
        d, errors = run.check_answer(r.content, r.truncated)
        if not errors:
            return d
        failed_answers += 1
        if failed_answers >= 2:
            if d is None:
                raise _AgentFailed("no valid JSON answer after a retry: " + "; ".join(errors[:3]))
            return d  # keep it, verified=False, errors listed
        messages += [r.raw_message, _fix_message(errors)]
        input_desc = f"{len(errors)} validation problem(s) to fix"
        force_json = d is None

    messages.append({"role": "user", "content": prompts.FORCE_FINAL_PROMPT})
    r = run.chat(messages, f"turn limit ({MAX_TURNS}) reached: forced final answer")
    d, errors = run.check_answer(r.content, r.truncated)
    if d is None:
        raise _AgentFailed("no final answer after the turn limit: " + "; ".join(errors[:3]))
    return d


def _prefetch_query(event: AnomalyEvent) -> str:
    phrases = []
    for c in event.contributions[:3]:
        default = f"{c.signal.replace('_', ' ')} {'rising' if c.direction == 'up' else 'falling'}"
        phrases.append(SEARCH_PHRASES.get((c.signal, c.direction), default))
    return " ".join(phrases)


def _safety_query(event: AnomalyEvent) -> str:
    """Lockout/tagout plus the procedures that fit the top symptom (P101-SAF-01, P101-PR-xx)."""
    top = event.contributions[:1]
    symptom = SEARCH_PHRASES.get((top[0].signal, top[0].direction), "") if top else ""
    return f"safety lockout tagout procedure {symptom}".strip()


def _run_prefetch(run: _Run) -> Diagnosis:
    mid = run.mid
    plan = [("get_sensor_summary", {"machine_id": mid, "signal": c.signal, "hours": 24})
            for c in run.event.contributions[:4]]
    plan += [("get_maintenance_history", {"machine_id": mid}),
             ("search_manual", {"query": _prefetch_query(run.event), "k": 3}),
             # the prompt asks for lockout/tagout and procedure ids: retrieve them, or citing them fails validation
             ("search_manual", {"query": _safety_query(run.event), "k": 3}),
             ("check_spare_parts", {"machine_id": mid})]
    payload = "\n".join(f"{name}({_short_args(args)}): {tools.tool_message_content(run.tool(name, args))}"
                        for name, args in plan)
    messages = [{"role": "system", "content": prompts.system_prompt(run.engine)},
                {"role": "user", "content": prompts.user_message(run.engine, run.event) + "\n\n"
                 + prompts.PREFETCH_NOTE + payload}]
    input_desc = f"system + anomaly event {run.event.id} + {len(plan)} tool results"
    for attempt in (1, 2):
        r = run.chat(messages, input_desc, json_mode=True)
        d, errors = run.check_answer(r.content, r.truncated)
        if not errors:
            return d
        if attempt == 1:
            messages += [r.raw_message, _fix_message(errors, prompts.PREFETCH_FIX_PROMPT)]
            input_desc = f"{len(errors)} validation problem(s) to fix"
    if d is None:
        raise _AgentFailed("no valid JSON answer after a retry: " + "; ".join(errors[:3]))
    return d  # keep it, verified=False, errors listed


# ---------- entry point ----------
def _short_error(e: Exception) -> str:
    """For alert.error (shown in the UI): drop the provider's raw JSON body; llm_calls.jsonl keeps it."""
    return str(e).split(" - {")[0][:160]


def _fallback(run: _Run, error: str) -> DiagnosisResult:
    try:
        d = fallback.rule_based(run.engine, run.event)
    except Exception as e:  # the fallback is the last line: it must not leave the alert in "diagnosing"
        d = fallback.minimal(run.event, f"{type(e).__name__}: {e}")
    run.step("validation", "fallback", input=error, output=validate.summary(d, d.validation_errors))
    return DiagnosisResult(diagnosis=d, trace=run.trace, calls=run.calls, used_fallback=True, error=error)


def diagnose(engine, event: AnomalyEvent, *, purpose: LlmPurpose = "diagnosis",
             on_step: Callable[[TraceStep], None] | None = None) -> DiagnosisResult:
    run = _Run(engine, event, purpose, on_step)
    if llm.is_mock():
        return _fallback(run, "Mock mode (LLM_MOCK=1 or no API key). Rule-based fallback used.")
    mode = agent_mode()
    try:
        d = _run_prefetch(run) if mode == "prefetch" else _run_tools(run)
    except llm.LlmError as e:
        return _fallback(run, f"AMD API unavailable: {_short_error(e)}. Rule-based fallback used.")
    except Exception as e:  # never leave an alert stuck in "diagnosing"
        return _fallback(run, f"Agent error: {type(e).__name__}: {_short_error(e)}. Rule-based fallback used.")
    return DiagnosisResult(diagnosis=d, trace=run.trace, calls=run.calls, used_fallback=False, error=None)


# ---------- headless CLI ----------
def _engine_at_event(fault: str, seed: int):
    """Real engine with the fault injected at live start + 1 h, stepped to the first event.
    Falls back to the fake engine (bearing_wear only) until P1's Engine exists."""
    try:
        from backend.app.sim.engine import Engine
    except ImportError:
        from backend.tests.fake_engine import FakeEngine, fake_event
        if fault != "bearing_wear":
            raise SystemExit("P1's Engine is not available yet; the fake engine only has bearing_wear.")
        print("(P1's Engine not available: using backend/tests/fake_engine.py)")
        return FakeEngine(seed), fake_event()

    engine = Engine(seed=seed, only=["P-101"])
    engine.auto_pause_on_alert = False
    events: list[AnomalyEvent] = []
    engine.on_anomaly.append(events.append)
    engine.step(12)  # +1 h
    engine.inject("P-101", fault)
    for _ in range(12 * 24 * 7):  # at most 7 sim-days
        engine.step(1)
        if events:
            return engine, events[0]
    raise SystemExit(f"no anomaly event within 7 sim-days for {fault}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Run one diagnosis headless.")
    ap.add_argument("--fault", default="bearing_wear",
                    choices=["bearing_wear", "cavitation", "misalignment", "motor_overheat"])
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    engine, event = _engine_at_event(args.fault, args.seed)
    print(f"Event {event.id} on {event.machine_id} at {event.detected_at:%Y-%m-%d %H:%M} "
          f"(top: {event.contributions[0].signal}); mode={agent_mode()}, mock={llm.is_mock()}")

    def show(s: TraceStep) -> None:
        tok = f" {s.prompt_tokens}+{s.completion_tokens} tok" if s.prompt_tokens is not None else ""
        out = s.output if isinstance(s.output, str) else json.dumps(s.output, default=str)
        print(f"{s.i:>3} {s.kind:<10} {s.name:<24} {s.latency_ms:>6} ms{tok}  {out[:150]}")

    res = diagnose(engine, event, on_step=show)
    d = res.diagnosis
    print("\n" + d.model_dump_json(indent=2))
    llm_ms = sum(c.latency_ms for c in res.calls)
    print(f"\nfault={d.fault} (injected {args.fault}) confidence={d.confidence} verified={d.verified} "
          f"fallback={res.used_fallback} llm_calls={len(res.calls)} llm_latency={llm_ms} ms")
    if res.error:
        print("error:", res.error)


if __name__ == "__main__":
    main()
