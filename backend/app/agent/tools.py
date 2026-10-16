"""Agent tools: what the diagnosis model can look at (sensors, history, manual, spare parts).

Each tool is fn(engine, **args) -> dict | list and never raises: problems come back as
{"error": "..."} with a hint (e.g. the valid signal names) so the model can recover.
run_tool() dispatches a model tool call and records every ref the model was shown in `seen`,
which validate.py uses to reject evidence the agent never actually retrieved.
"""
from __future__ import annotations

import inspect
import json
import re
from datetime import date, datetime, timezone
from functools import lru_cache

from rank_bm25 import BM25Okapi

from backend.app.agent import data_shim as data  # TODO: `from backend.app import data` once P4's data.py is on main

MAX_RESULT_CHARS = 3000
# get_manual_sections returns whole sections on purpose (the 6 troubleshooting sections are ~8.5k chars)
RESULT_CHARS = {"get_manual_sections": 12000}

TOOLS = [
    {"type": "function", "function": {
        "name": "get_sensor_summary",
        "description": "Statistics and trend of one sensor signal of a machine over the last N hours, compared with its learned healthy baseline and its alarm limits.",
        "parameters": {"type": "object", "properties": {
            "machine_id": {"type": "string"},
            "signal": {"type": "string", "description": "Exact signal name, e.g. vibration_hf"},
            "hours": {"type": "number", "description": "Look-back window in hours, 1-48", "default": 24}},
            "required": ["machine_id", "signal"]}}},
    {"type": "function", "function": {
        "name": "get_maintenance_history",
        "description": "Machine facts (model, installation date, age) and its maintenance records newest first, plus the number of corrective repairs in the last 12 months.",
        "parameters": {"type": "object", "properties": {
            "machine_id": {"type": "string"},
            "limit": {"type": "integer", "default": 10}},
            "required": ["machine_id"]}}},
    {"type": "function", "function": {
        "name": "search_manual",
        "description": "Search the equipment manual (troubleshooting guides, procedures, safety rules). Returns the best matching sections with their section ids.",
        "parameters": {"type": "object", "properties": {
            "query": {"type": "string", "description": "Symptoms or keywords, e.g. 'high frequency vibration rising bearing temperature'"},
            "k": {"type": "integer", "default": 3}},
            "required": ["query"]}}},
    {"type": "function", "function": {
        "name": "check_spare_parts",
        "description": "Spare parts that fit this machine, with stock level, store location and lead time.",
        "parameters": {"type": "object", "properties": {
            "machine_id": {"type": "string"},
            "keyword": {"type": "string", "description": "Optional filter, e.g. 'bearing'"}},
            "required": ["machine_id"]}}},
]


# ---------- helpers ----------
def _r(x: float) -> float:
    return round(float(x), 3)


def _iso(t: datetime | None) -> str | None:
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if t else None


def _clamp(value, lo: float, hi: float, default: float, cast=float):
    try:
        return cast(min(hi, max(lo, cast(value))))
    except (TypeError, ValueError):
        return cast(default)


def _check_machine(engine, machine_id) -> tuple[str, dict | None]:
    """Normalized machine id, or an error dict if unknown."""
    mid = str(machine_id).strip().upper()
    if mid not in engine.machine_ids():
        return mid, {"error": f"unknown machine '{machine_id}'", "valid_machines": engine.machine_ids()}
    return mid, None


def projected_hours_to_alarm(latest: float, slope: float, alarm_high: float | None,
                             alarm_low: float | None) -> float | None:
    """Hours until the legacy alarm limit is reached at the current slope (0 if already beyond)."""
    if (alarm_high is not None and latest > alarm_high) or (alarm_low is not None and latest < alarm_low):
        return 0.0
    if alarm_high is not None and slope > 0:
        return round((alarm_high - latest) / slope, 1)
    if alarm_low is not None and slope < 0:
        return round((latest - alarm_low) / -slope, 1)
    return None


# ---------- tools ----------
def get_sensor_summary(engine, machine_id: str, signal: str, hours: float = 24) -> dict:
    mid, err = _check_machine(engine, machine_id)
    if err:
        return err
    specs = {s.name: s for s in engine.signal_specs(mid)}
    name = str(signal).strip().lower()
    if name == "load_pct":
        return {"error": "load_pct is the production load (context), not a sensor", "valid_signals": list(specs)}
    if name not in specs:
        return {"error": f"unknown signal '{signal}' for {mid}", "valid_signals": list(specs)}
    hours = _clamp(hours, 1, 48, 24)

    samples = [s for s in engine.samples(mid, hours) if name in s.values]
    if not samples:
        return {"error": f"no samples for {name} in the last {hours} h"}
    vals = [s.values[name] for s in samples]
    spec = specs[name]
    base = engine.baseline(mid).get(name)
    contrib = next((c for c in engine.contributions(mid) if c.signal == name), None)
    slope = contrib.slope_per_h if contrib else 0.0

    hourly: dict[datetime, list[float]] = {}
    for s in samples:
        hourly.setdefault(s.t.replace(minute=0, second=0, microsecond=0), []).append(s.values[name])

    return {
        "machine_id": mid, "signal": name, "label": spec.label, "unit": spec.unit,
        "baseline_typical": _r(base.typical) if base else None,
        "baseline_sigma": _r(base.sigma) if base else None,
        "alarm_high": spec.alarm_high, "alarm_low": spec.alarm_low,
        "latest": _r(vals[-1]), "mean": _r(sum(vals) / len(vals)), "min": _r(min(vals)), "max": _r(max(vals)),
        "slope_per_h": _r(slope),
        "z_latest": _r(contrib.z) if contrib else None,
        "ewma_score": _r(contrib.score) if contrib else None,
        "deviating_since": _iso(contrib.deviating_since) if contrib else None,
        "projected_hours_to_alarm": projected_hours_to_alarm(vals[-1], slope, spec.alarm_high, spec.alarm_low),
        "hourly_means": [{"t": _iso(t), "v": _r(sum(v) / len(v))} for t, v in hourly.items()],
    }


def get_maintenance_history(engine, machine_id: str, limit: int = 10) -> dict:
    mid, err = _check_machine(engine, machine_id)
    if err:
        return err
    cfg = engine.machine_cfg(mid)
    limit = _clamp(limit, 1, 50, 10, int)
    installed = str(cfg["installed"])[:10] if cfg.get("installed") else None  # an unquoted YAML date is a date
    age = (engine.sim_time.date() - date.fromisoformat(installed)).days / 365.25 if installed else None
    return {
        "machine": {"id": mid, "name": cfg.get("name"), "model": cfg.get("model"), "area": cfg.get("area"),
                    "installed": installed, "age_years": round(age, 1) if age is not None else None,
                    "design_life_years": cfg.get("design_life_years")},
        "corrective_last_12m": data.corrective_last_12m(mid, engine.sim_time),
        "records": [r.model_dump() for r in data.maintenance(mid)[:limit]],
    }


_STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "if", "in", "is", "it", "its",
    "of", "on", "or", "the", "than", "that", "then", "this", "to", "was", "when", "while", "with",
}


def tokenize(text: str) -> list[str]:
    """Lowercase, keep [a-z0-9_], split; `vibration_hf` also yields `vibration` and `hf`."""
    tokens = []
    for word in re.sub(r"[^a-z0-9_]", " ", text.lower()).split():
        if word in _STOP_WORDS:
            continue
        tokens.append(word)
        if "_" in word:
            tokens += [p for p in word.split("_") if p and p not in _STOP_WORDS]
    return tokens


@lru_cache
def _manual_index() -> tuple[list, BM25Okapi]:
    sections = list(data.manual_sections().values())
    return sections, BM25Okapi([tokenize(f"{s.title} {s.text}") for s in sections])


def search_manual(engine, query: str, k: int = 3) -> list | dict:
    tokens = tokenize(str(query))
    if not tokens:
        return {"error": "empty query: describe the symptoms, e.g. 'high frequency vibration rising'"}
    k = _clamp(k, 1, 5, 3, int)
    sections, bm25 = _manual_index()
    scores = bm25.get_scores(tokens)
    best = sorted(range(len(sections)), key=lambda i: scores[i], reverse=True)[:k]
    return [{"section_id": sections[i].id, "title": sections[i].title, "text": sections[i].text[:1200],
             "score": _r(scores[i])} for i in best]


def _section_kind(section_id: str) -> str:
    """P101-TS-03 -> TS"""
    parts = section_id.split("-")
    return parts[1] if len(parts) > 2 else ""


def get_manual_sections(engine, kinds: list[str]) -> list | dict:
    """Every manual section of the given kinds (TS troubleshooting, PR procedure, SAF safety), in full and in
    manual order. Prefetch mode uses this instead of search_manual: a keyword ranking can leave out the right
    troubleshooting section (it never returned P101-TS-03 for misalignment), so the model gets all of them."""
    sections = list(data.manual_sections().values())
    valid = sorted({_section_kind(s.id) for s in sections} - {""})
    wanted = {str(k).strip().upper() for k in ([kinds] if isinstance(kinds, str) else kinds)}
    if not wanted or not wanted <= set(valid):
        return {"error": f"unknown section kind(s): {kinds}", "valid_kinds": valid}
    return [{"section_id": s.id, "title": s.title, "text": s.text} for s in sections if _section_kind(s.id) in wanted]


def check_spare_parts(engine, machine_id: str, keyword: str | None = None) -> list | dict:
    mid, err = _check_machine(engine, machine_id)
    if err:
        return err
    fields = ("part_no", "name", "in_stock", "location", "lead_time_days", "unit_cost_eur")
    fitting = [{f: p.get(f) for f in fields} for p in data.parts(mid)]
    if not keyword or not str(keyword).strip():
        return fitting
    words = [w for w in tokenize(str(keyword)) if len(w) >= 3] or [str(keyword).strip().lower()]
    matches = [p for p in fitting if any(w in f"{p['part_no']} {p['name']}".lower() for w in words)]
    if matches:
        return matches
    return {"note": f"keyword '{keyword}' matched nothing; showing all parts that fit {mid}", "parts": fitting}


# ---------- executor ----------
_FUNCS = {
    "get_sensor_summary": get_sensor_summary,
    "get_maintenance_history": get_maintenance_history,
    "search_manual": search_manual,
    "check_spare_parts": check_spare_parts,
    "get_manual_sections": get_manual_sections,  # prefetch mode only: not offered in TOOLS
}


def tool_message_content(result: dict | list, name: str = "") -> str:
    """The JSON sent back to the model, truncated to MAX_RESULT_CHARS (or the tool's RESULT_CHARS)."""
    limit = RESULT_CHARS.get(name, MAX_RESULT_CHARS)
    text = json.dumps(result, ensure_ascii=False, separators=(",", ":"), default=str)
    return text if len(text) <= limit else text[:limit] + "...(truncated)"


def _remember(name: str, args: dict, result, shown: str, seen: set[str]) -> None:
    """Add every ref that actually made it into the (truncated) text the model sees."""
    if name == "get_sensor_summary" and "signal" in args:
        seen.add(str(args["signal"]).strip())
    if isinstance(result, dict) and "error" in result:
        return
    if name == "get_maintenance_history":
        ids = [r["id"] for r in result.get("records", [])]
    elif name in ("search_manual", "get_manual_sections"):
        ids = [s["section_id"] for s in result]
    elif name == "check_spare_parts":
        ids = [p["part_no"] for p in (result["parts"] if isinstance(result, dict) else result)]
    else:
        ids = []
    seen.update(i for i in ids if i in shown)


def run_tool(engine, name: str, args: dict, seen: set[str]) -> dict | list:
    fn = _FUNCS.get(name)
    if fn is None:
        return {"error": f"unknown tool '{name}'", "valid_tools": list(_FUNCS)}
    params = inspect.signature(fn).parameters
    args = {k: v for k, v in (args or {}).items() if k in params and k != "engine"}  # drop unknown extras
    missing = [p.name for p in params.values()
               if p.name != "engine" and p.default is inspect.Parameter.empty and p.name not in args]
    if missing:
        result = {"error": f"{name} needs argument(s): {', '.join(missing)}"}
    else:
        try:
            result = fn(engine, **args)
        except Exception as e:  # a tool must never break the agent loop
            result = {"error": f"{name} failed: {type(e).__name__}: {e}"}
    _remember(name, args, result, tool_message_content(result, name), seen)
    return result
