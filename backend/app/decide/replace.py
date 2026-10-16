"""Repair vs. replace: 5-year total cost of ownership, duty-point fit, and an AI justification.

The numbers come from transparent formulas (brief 02, Task 6). The AI only writes the 3-sentence
justification, and every number in it is machine-checked against the table; if the check fails
twice, or the AMD API is unavailable, a template sentence is used instead.
"""
from __future__ import annotations

import json
import re
import threading
from datetime import date

from backend.app.agent import data_shim as data  # TODO: `from backend.app import data` once P4's data.py is on main
from backend.app.agent import llm
from backend.app.models import DiagnosedFault, ReplaceAnalysis, ReplaceOption

REPAIR_LABELS = {
    "bearing_wear": "bearing replacement",
    "cavitation": "suction-side fix",
    "misalignment": "realignment + coupling",
    "motor_overheat": "motor cooling repair",
    "other": "general repair",
}
EUR_FIELDS = ("capex_eur", "energy_eur_5y", "maintenance_eur_5y", "downtime_eur_5y", "tco_5y_eur")

JUSTIFY_SYSTEM = (
    "You explain a maintenance investment decision to a plant maintenance supervisor.\n"
    "Write exactly 3 sentences of plain text, no markdown, no lists.\n"
    "Use ONLY numbers that appear in the JSON you are given. Do not invent or estimate new numbers.\n"
    "Mention the recommended option, its 5-year cost versus repairing, the main reason (energy, downtime\n"
    "or reliability), the payback if given, and any cheaper option that does not fit the duty point.\n"
    "Write euro amounts like €142,559."
)

# A number claim. Digits glued to letters are names or units, not claims: CP-80, IE4, Gen2, P-101, m3/h.
_NUMBER = re.compile(r"(?<![A-Za-z\d.,])(?<![A-Za-z]-)\d[\d,]*(?:\.\d+)?")
_cache: dict[str, tuple[str, bool]] = {}
_cache_lock = threading.Lock()


class UnknownMachine(LookupError):
    pass


class NoDuty(ValueError):
    pass


# ---------- math ----------
def _option(option_id, kind, label, capex, energy, maint, downtime, eff, lead, fits, notes) -> dict:
    return {"option_id": option_id, "kind": kind, "label": label, "capex_eur": capex, "energy_eur_5y": energy,
            "maintenance_eur_5y": maint, "downtime_eur_5y": downtime, "tco_5y_eur": capex + energy + maint + downtime,
            "efficiency_pct": eff, "lead_time_days": lead, "fits_duty": fits, "fit_notes": notes}


def compute(engine, machine_id: str, fault: DiagnosedFault | None = None) -> ReplaceAnalysis:
    """The cost table, ranking and payback. `justification` is left empty."""
    if machine_id not in engine.machine_ids():
        raise UnknownMachine(machine_id)
    cfg = engine.machine_cfg(machine_id)
    duty = cfg.get("duty")
    if not duty:
        raise NoDuty(f"{machine_id} has no duty point in machines.yaml")
    fault = fault or "bearing_wear"

    cat = data.catalog()
    a = cat["assumptions"]
    est = cat["repair_estimates"][fault]
    H, D = a["horizon_years"], a["downtime_eur_per_h"]
    C = data.corrective_last_12m(machine_id, engine.sim_time)
    age = (engine.sim_time.date() - date.fromisoformat(cfg["installed"])).days / 365.25
    flow, head = duty["flow_m3h"], duty["head_m"]
    p_hyd_kw = flow * head / 367.2

    def energy_5y(eff_pct: float) -> float:
        return p_hyd_kw / (eff_pct / 100) * duty["hours_per_year"] * a["energy_eur_per_kwh"] * H

    one_off = {"repair": est["downtime_h"] * D}
    options = [_option(
        "repair", "repair", f"Repair current pump ({REPAIR_LABELS[fault]})",
        capex=est["parts_eur"] + est["labor_eur"],
        energy=energy_5y(est["efficiency_after_pct"]),
        maint=a["base_maintenance_eur_year"] * (1 + a["maintenance_factor_per_corrective"] * C) * H,
        downtime=a["failures_per_corrective_repair"] * C * a["hours_per_failure"] * D * H + one_off["repair"],
        eff=est["efficiency_after_pct"], lead=est["lead_time_days"], fits=True,
        notes=f"Keeps the {int(age)}-year-old pump; {C} corrective repairs in the last 12 months.",
    )]
    for c in cat["candidates"]:
        fits = c["rated_flow_m3h"] >= flow and c["rated_head_m"] >= head
        if fits:
            notes = f"Meets {flow:g} m3/h at {head:g} m (rated {c['rated_flow_m3h']:g} m3/h at {c['rated_head_m']:g} m)"
            notes += "; same footprint." if c["footprint_compatible"] else f"; {c['notes']}"
        else:
            notes = (f"Rated {c['rated_flow_m3h']:g} m3/h at {c['rated_head_m']:g} m: "
                     f"below the {flow:g} m3/h at {head:g} m duty.")
        one_off[c["id"]] = c["install_downtime_h"] * D
        options.append(_option(
            c["id"], "replace", c["label"],
            capex=c["price_eur"] + c["install_eur"],
            energy=energy_5y(c["efficiency_pct"]),
            maint=c["maintenance_eur_year"] * H,
            downtime=a["failures_per_year_new"] * a["hours_per_failure"] * D * H + one_off[c["id"]],
            eff=c["efficiency_pct"], lead=c["lead_time_days"], fits=fits, notes=notes,
        ))

    min_fit = min(o["tco_5y_eur"] for o in options if o["fits_duty"])
    for o in options:
        o["score"] = round(100 * min_fit / o["tco_5y_eur"], 1) if o["fits_duty"] else 0.0
    options.sort(key=lambda o: (not o["fits_duty"], o["tco_5y_eur"]))
    for rank, o in enumerate(options, 1):
        o["rank"] = rank

    best, repair = options[0], next(o for o in options if o["kind"] == "repair")
    payback = None
    if best["kind"] == "replace":
        def annual_op(o):
            return (o["energy_eur_5y"] + o["maintenance_eur_5y"] + o["downtime_eur_5y"] - one_off[o["option_id"]]) / H

        def upfront(o):
            return o["capex_eur"] + one_off[o["option_id"]]

        saving = annual_op(repair) - annual_op(best)
        if saving > 0:
            payback = round(12 * (upfront(best) - upfront(repair)) / saving, 1)

    for o in options:  # round EUR at the end; totals were computed from unrounded parts
        for f in EUR_FIELDS:
            o[f] = round(o[f])

    return ReplaceAnalysis(
        machine_id=machine_id, fault=fault, duty=dict(duty),
        assumptions=dict(a) | {"corrective_repairs_last_12m": C, "age_years": round(age, 1)},
        options=[ReplaceOption(**o) for o in options],
        recommendation=best["option_id"], payback_months=payback,
        justification="", justification_verified=False,
    )


# ---------- justification ----------
def _payload(an: ReplaceAnalysis) -> str:
    """Compact JSON the model is allowed to quote numbers from."""
    keep = ("option_id", "label", "kind", "capex_eur", "energy_eur_5y", "maintenance_eur_5y", "downtime_eur_5y",
            "tco_5y_eur", "efficiency_pct", "lead_time_days", "fits_duty", "fit_notes", "rank")
    return json.dumps({
        "machine_id": an.machine_id, "fault": an.fault, "recommendation": an.recommendation,
        "payback_months": an.payback_months, "duty": an.duty, "assumptions": an.assumptions,
        "options": [{k: getattr(o, k) for k in keep} for o in an.options],
    }, separators=(",", ":"))


def allowed_numbers(an: ReplaceAnalysis) -> list[float]:
    nums = [12.0, 5.0]
    for o in an.options:
        nums += [o.capex_eur, o.energy_eur_5y, o.maintenance_eur_5y, o.downtime_eur_5y, o.tco_5y_eur,
                 o.efficiency_pct, o.lead_time_days, o.score, o.rank]
    nums += list(an.duty.values()) + list(an.assumptions.values())
    age = an.assumptions.get("age_years")
    if age is not None:
        nums += [int(age), round(age)]  # "9-year-old" / "about 10 years"
    if an.payback_months is not None:
        nums += [an.payback_months, round(an.payback_months)]
    for field in ("tco_5y_eur", "capex_eur"):
        vals = [getattr(o, field) for o in an.options]
        nums += [abs(x - y) for i, x in enumerate(vals) for y in vals[i + 1:]]
    return [float(n) for n in nums]


def bad_numbers(text: str, an: ReplaceAnalysis) -> list[str]:
    """Numbers in `text` that do not trace to the table (within 1% or ±0.5, also in thousands)."""
    for name in sorted([o.label for o in an.options] + [an.machine_id], key=len, reverse=True):
        text = text.replace(name, " ")  # digits inside names ("CP-80", "P-101") are not claims
    allowed = allowed_numbers(an)
    bad = []
    for m in _NUMBER.finditer(text):
        x = float(m.group().replace(",", ""))
        ok = any(abs(x - v) <= max(0.5, 0.01 * abs(v)) or abs(x - v / 1000) <= max(0.5, 0.01 * abs(v / 1000))
                 for v in allowed)
        if not ok:
            bad.append(m.group())
    return bad


def template_justification(an: ReplaceAnalysis) -> str:
    best = an.options[0]
    repair = next(o for o in an.options if o.kind == "repair")
    unfit = next((o for o in an.options if not o.fits_duty), None)
    flow, head = an.duty["flow_m3h"], an.duty["head_m"]
    if best.kind == "repair":
        alt = next((o for o in an.options if o.kind == "replace" and o.fits_duty), None)
        text = f"Repairing is the cheapest option over 5 years at €{repair.tco_5y_eur:,.0f}"
        text += f"; the best replacement, {alt.label}, would cost €{alt.tco_5y_eur:,.0f}." if alt else "."
    else:
        text = (f"{best.label} has the lowest 5-year cost at €{best.tco_5y_eur:,.0f}, "
                f"against €{repair.tco_5y_eur:,.0f} to repair the current pump.")
        if an.payback_months is not None:
            text += f" It pays back the extra upfront cost in about {an.payback_months:.0f} months."
    if unfit:
        text += f" {unfit.label} is cheaper to buy but cannot meet the {flow:.0f} m3/h at {head:.0f} m duty."
    return text


def justify(an: ReplaceAnalysis) -> tuple[str, bool]:
    """(text, verified). One LLM call on AMD (+1 retry), else the template."""
    if llm.is_mock():
        return template_justification(an), True
    payload = _payload(an)
    with _cache_lock:
        if payload in _cache:
            return _cache[payload]
    messages = [{"role": "system", "content": JUSTIFY_SYSTEM}, {"role": "user", "content": payload}]
    result = template_justification(an), True
    try:
        for attempt in (1, 2):
            r = llm.chat(messages, purpose="replace_justification", temperature=0.2, max_tokens=300)
            text = " ".join((r.content or "").split())
            bad = bad_numbers(text, an)
            if text and not bad:
                result = text, True
                break
            messages += [r.raw_message, {"role": "user", "content":
                         f"These numbers are not in the JSON: {', '.join(bad) or '(empty answer)'}. "
                         "Rewrite the 3 sentences using only numbers from the JSON."}]
    except llm.LlmError:
        return result  # template; not cached, so the next request tries AMD again
    with _cache_lock:
        _cache[payload] = result
    return result


def analyze(engine, machine_id: str, fault: DiagnosedFault | None = None) -> ReplaceAnalysis:
    an = compute(engine, machine_id, fault)
    an.justification, an.justification_verified = justify(an)
    return an
