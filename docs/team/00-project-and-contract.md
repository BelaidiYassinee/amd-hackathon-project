# 00: Project, architecture, and API contract (shared by everyone)

> **Send this file to your AI model together with your own brief (01–04).**
> This file is the single source of truth. The **API contract** (§7) and the **engine interface** (§8) are binding: do not change them without telling the whole team. Any change must land in `backend/app/models.py` **and** `frontend/src/types.ts` in the same commit.

---

## 1. What we are building

**Working name:** *Operion* (P4 picks the final name).

**Hackathon:** AMD Developer Hackathon Act III (lablab.ai), **Track 1: Intelligent Industry**.

**One-liner:** an AI Operion that catches a machine fault early, explains it with evidence, alerts the right on-shift technician with fix steps, and helps decide between repairing and replacing the machine.

**Users:**
- **Maintenance technicians**, who receive the alert and do the fix.
- **The maintenance supervisor**, who gets escalations and makes the repair-vs-replace decision.
- The setting is a mid-size manufacturing plant.

**What it improves:**
- **Less unplanned downtime.** Faults are found hours or days earlier than with fixed threshold alarms.
- **Faster, more consistent troubleshooting.** The diagnosis comes with evidence and step-by-step instructions.
- **Better spending decisions.** Repair vs. replace is compared on 5-year total cost of ownership.

### Mentor feedback (we follow it exactly)

> Narrow the scope for the demo. Focus on one strong end-to-end workflow: simulate a machine developing a fault, detect and explain the anomaly, alert the right person, and recommend a maintenance action based on the available evidence. Show a simple repair-versus-replacement comparison as an additional feature. Clearly demonstrate how AMD technology powers a meaningful part of the solution: what the AI actually does, what data supports its diagnosis, and how the product helps a factory make a better decision. A small, working, well-explained prototype beats a broad dashboard.

### Hackathon rules that shape every decision

- **AMD requirement:** a meaningful part of the workload must run on AMD infrastructure. For us that is **all LLM inference, on the AMD Radeon API** (`https://developer.amd.com.cn/radeon/api/v1`, model `DeepSeek-V4-Flash`, OpenAI-compatible). `test.py` in the repo already calls it.
- **Judging criteria:** Application of Technology · Business Value · Originality · Presentation.
- **Submission:** title, short and long description, track, tags, cover image, demo video, slide deck, public GitHub repo, and a live app URL.
- **Deadline:** submit by **Sun Oct 18, 12:00 GMT+1** (the hard deadline is 16:00).
- **Never commit API keys.** Keys go in `.env`, which is git-ignored.

---

## 2. The one workflow (this is also the demo)

1. **Plant overview.** Four machines are all green: P-101 coolant pump, P-102 process water pump, C-201 air compressor, and M-301 conveyor drive.
2. **Fault injection.** The presenter clicks **Inject fault → P-101 → bearing wear**. The simulated clock runs fast (default 30 simulated minutes per real second), so about two days of degradation play out in about 90 seconds.
3. **Early detection.** The detector learned each signal's normal behaviour. It sees the **high-frequency vibration energy** drifting up and raises an **anomaly event** about 1–2 simulated hours after onset. The old-style **fixed threshold alarm** (vibration RMS > 7.1 mm/s) would only fire about 40 simulated hours after onset. The chart shows both markers. That gap is the **lead time**.
4. **Diagnosis agent on AMD.** The simulation auto-pauses and the agent investigates. It runs a tool-calling loop on the AMD Radeon API: sensor summaries, maintenance history, manual search, and spare-parts check. It returns:
   - the fault, with a confidence level and alternative causes
   - an **evidence list**, where every item links to real data (signal, maintenance record, manual section, part)
   - severity, an estimated time to failure, fix steps, parts with live stock, and safety notes

   The backend **validates every evidence reference** against real data before the alert goes out. The UI shows the full **agent trace** and AMD inference stats (model, latency, tokens/s).
5. **Alert routing.** The alert goes to the **on-shift mechanical technician** (from the roster, by fault category, plant area, and shift). The supervisor is copied when the case is critical or replacement is suggested. The technician clicks **Acknowledge**, which creates a work order. If nobody acknowledges within 120 simulated minutes, the alert **escalates** to the on-shift supervisor.
6. **Repair vs. replace (secondary).** P-101 is 9 years old with 3 corrective repairs in the last 12 months. The tool compares repairing it against 3 catalog pumps on 5-year total cost: purchase/repair, energy, maintenance, and downtime. It checks each candidate against the post's duty point (120 m³/h at 42 m), recommends one with a payback period, and the AI writes a 3-sentence justification whose numbers are machine-checked against the table.
7. **Results.** An eval over 40 simulated fault scenarios plus 10 healthy runs measures detection lead time against the threshold alarm, false alarms, diagnosis accuracy, and AMD latency.

**The story in one line:** *the numbers come from a transparent detector, the reasoning comes from the AI agent on AMD, and every claim is backed by checkable evidence.*

---

## 3. Architecture

```
React SPA (Vite + TS + Tailwind + Recharts)        polls /api every 1–3 s
        │  same origin in prod; Vite proxy /api → :8000 in dev
        ▼
FastAPI (ONE process, ONE uvicorn worker, in-memory state, also serves frontend/dist)
  ├─ sim/       Engine: accelerated clock, 4 machines, fault injection, markers      (P1)
  ├─ detect/    load-regressed robust z-score + EWMA drift + threshold baseline      (P1)
  ├─ decide/    repair-vs-replace TCO + fit scoring (+1 LLM call for justification)  (P2)
  ├─ agent/     LLM client + call log, tools, diagnosis loop, evidence validation    (P2)
  │               └──► AMD Radeon API (OpenAI-compatible)  ← all AI reasoning runs here
  ├─ alerts/    alert lifecycle, routing to on-shift person, escalation, Telegram    (P4)
  └─ data/      machines.yaml (P1); roster, maintenance log, parts, manual + loaders (P4); catalog (P2)
```

**How the pieces talk:**

```
state.run_loop() ── every 100 ms ──► engine.step(n)
engine.step: generate samples → detector.update → threshold monitor
   ├─ anomaly confirmed → engine auto-pauses (if enabled) → calls on_anomaly hooks(event)
   │     └─ alerts.service.on_anomaly: create Alert(state="diagnosing"), engine.set_active_alert,
   │        schedule pipeline in a worker thread:
   │        diagnose(engine, event) [LLM tool loop on AMD] → validate → route → notify → state="open"
   ├─ threshold alarm fires → on_threshold hooks(machine_id, t, signal) → alert.lead_time_h
   └─ every step → on_tick hooks(sim_time) → escalation check
UI: POST /api/alerts/{id}/ack → work order;  POST /api/alerts/{id}/resolve → engine.clear_fault
```

**Deployment:** one Docker image. Node builds `frontend/dist`, then a Python image runs uvicorn and serves both the API and the SPA. It is hosted on Hugging Face Spaces (Docker SDK, port 7860); P4 owns the image and the Space. Run **one worker only**, because all state lives in memory.

---

## 4. Repo layout and file ownership

Only edit files you own. If you need a change in someone else's file, ask them in the team chat.

```
amd-hackathon-project/
├─ backend/
│  ├─ __init__.py                      P1
│  ├─ requirements.txt                 P1 (others may append lines; tell P1)
│  ├─ app/
│  │  ├─ __init__.py                   P1
│  │  ├─ main.py                       P1  (content fixed in §9)
│  │  ├─ state.py                      P1  (global engine, reset hooks, realtime loop)
│  │  ├─ config.py                     P1  (paths, loads machines.yaml)
│  │  ├─ models.py                     P1 commits it VERBATIM from §7.1 (contract)
│  │  ├─ data.py                       P4  (loaders for roster, maintenance, parts, manual, catalog)
│  │  ├─ sim/engine.py                 P1
│  │  ├─ sim/machines.py               P1
│  │  ├─ sim/faults.py                 P1
│  │  ├─ detect/detector.py            P1
│  │  ├─ detect/threshold.py           P1
│  │  ├─ decide/replace.py             P2
│  │  ├─ api/plant.py                  P1  (health, plant, series, demo/*)
│  │  ├─ api/decide.py                 P2  (replace-analysis; P1 commits the stub)
│  │  ├─ api/alerts.py                 P4  (alerts, people, manual, maintenance, amd/stats; P1 commits the stub)
│  │  ├─ agent/llm.py                  P2
│  │  ├─ agent/tools.py                P2
│  │  ├─ agent/prompts.py              P2
│  │  ├─ agent/validate.py             P2
│  │  ├─ agent/fallback.py             P2
│  │  ├─ agent/diagnose.py             P2
│  │  ├─ alerts/service.py             P4
│  │  ├─ alerts/routing.py             P4
│  │  └─ alerts/notify.py              P4
│  ├─ data/
│  │  ├─ machines.yaml                 P1
│  │  ├─ roster.json                   P1 commits from §10 (then P4 maintains)
│  │  ├─ spare_parts.json              P1 commits from §10 (then P4 maintains)
│  │  ├─ catalog.json                  P1 commits from §10 (then P2 maintains)
│  │  ├─ maintenance_log.json          P4 (P1 commits a placeholder in the skeleton)
│  │  └─ manuals/pump_p101.md          P4 (P1 commits a placeholder in the skeleton)
│  └─ tests/                           each owner writes tests for their own modules
├─ eval/
│  ├─ __init__.py                      P1
│  ├─ scenarios.py                     P1  (scenario list + headless runner)
│  ├─ detection_eval.py                P1
│  ├─ diagnosis_eval.py                P2
│  ├─ run_eval.py                      P1  (orchestrates, writes report.md/json)
│  └─ report.md                        generated
├─ scripts/check_radeon.py             P2
├─ frontend/                           P3  (src/types.ts is VERBATIM from §7.2)
├─ Dockerfile, .dockerignore           P4
├─ .env.example                        P1 (§11)
├─ .gitignore                          P1
├─ README.md                           P4 adds the Space front matter; the pitch person writes the rest after the freeze
└─ docs/team/                          briefs; tell the team when you change one
```

`test.py` is replaced by `agent/llm.py`. P2 deletes `test.py` once `llm.py` works.

---

## 5. Conventions

- **Python 3.11+, Pydantic v2, FastAPI.** Use type hints everywhere and `from __future__ import annotations`. Run from the repo root (`uvicorn backend.app.main:app`), so imports are `from backend.app.models import Alert`.
- **Simulated time:**
  - Values are timezone-aware UTC `datetime` objects. JSON shows them as ISO 8601 with a `Z` suffix, e.g. `"2026-10-15T09:40:00Z"`.
  - Simulated time is "plant time"; display it as-is.
  - The live clock starts at **`2026-10-15T06:00:00Z`**, and 72 h of healthy history is pre-generated before that.
  - The sample interval is **5 simulated minutes**.
- **Units:** mm/s, g, °C, A, bar, m³/h, %, EUR, and hours (floats). Money is always EUR.
- **IDs:**

| Object | Format |
|---|---|
| Machines | `P-101`, `P-102`, `C-201`, `M-301` |
| Events | `EVT-0001` |
| Alerts | `ALT-0001` |
| Work orders | `WO-2026-0412` and up |
| Maintenance records | `WO-YYYY-NNNN` / `PM-YYYY-NNNN` |
| Manual sections | `P101-XX-NN` |
| Parts | e.g. `BRG-6309-C3` |
| People | e.g. `tech-a1` |

- **Fault names (exact strings):** `bearing_wear`, `cavitation`, `misalignment`, `motor_overheat`. Diagnoses may also return `other`.
- **Signal names (exact strings):**
  - Pumps: `vibration_rms`, `vibration_hf`, `bearing_temp`, `motor_temp`, `motor_current`, `discharge_pressure`, `flow`.
  - All machines also carry the context value `load_pct` in samples. It is not a sensor and is never an evidence ref.
- **Branches:** each person works on a branch (`p1-detection`, `p2-agent`, `p3-frontend`, `p4-alerts`) and merges to `main` at every checkpoint (§12), at least twice a day. Pull `main` often. File ownership keeps conflicts rare.
- **Commits:** small, with a clear message. Never commit `.env`, `node_modules/`, `frontend/dist/`, `backend/logs/`, or `.venv/`.
- **Secrets:** `RADEON_API_KEY` and `TELEGRAM_BOT_TOKEN` go only in `.env` locally and in Hugging Face Space secrets in prod.
- **Content:** all brands, models, and people in seed data are **fictional**. Don't copy text from real manuals.

---

## 6. Run it locally

```bash
# backend (repo root)
python -m venv .venv
.venv\Scripts\activate            # Windows   (macOS/Linux: source .venv/bin/activate)
pip install -r backend/requirements.txt
copy .env.example .env            # then put your RADEON_API_KEY in .env
uvicorn backend.app.main:app --reload --port 8000
# → http://localhost:8000/docs

# frontend (second terminal)
cd frontend
npm install
npm run dev                       # http://localhost:5173, proxies /api to :8000
npm run dev:mock                  # UI only, using fixtures (no backend needed)
```

- Set `LLM_MOCK=1` in `.env` to run the whole backend **without** calling the AMD API. You get a rule-based diagnosis and no token cost. Use it for UI work.
- Use the real API for the demo, the eval, and the video.

---

## 7. API contract

### 7.1 `backend/app/models.py` (P1 commits this verbatim)

```python
"""API contract shared by backend and frontend.
Any change here must be announced to the team and mirrored in frontend/src/types.ts."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

MachineStatus = Literal["ok", "watch", "alert", "down"]
FaultType = Literal["bearing_wear", "cavitation", "misalignment", "motor_overheat"]
DiagnosedFault = Literal["bearing_wear", "cavitation", "misalignment", "motor_overheat", "other"]
Severity = Literal["low", "medium", "high", "critical"]
Action = Literal["monitor", "schedule_repair", "stop_now", "consider_replacement"]
Category = Literal["mechanical", "electrical", "process"]
AlertState = Literal["diagnosing", "open", "acknowledged", "escalated", "resolved", "rejected"]
EvidenceKind = Literal["sensor", "history", "manual", "parts"]
Role = Literal["mechanical_technician", "electrical_technician", "process_engineer", "maintenance_supervisor"]
MarkerKind = Literal["fault_injected", "ai_detected", "threshold_alarm", "failure", "acknowledged", "resolved"]
LlmPurpose = Literal["diagnosis", "alert_message", "replace_justification", "eval", "check"]


# ---------- plant & signals ----------
class SignalSpec(BaseModel):
    name: str
    label: str
    unit: str
    alarm_high: float | None = None
    alarm_low: float | None = None


class MachineSummary(BaseModel):
    id: str
    name: str
    type: str
    area: str
    model: str
    status: MachineStatus
    health: int = Field(ge=0, le=100)
    active_alert_id: str | None = None
    injected_fault: FaultType | None = None  # demo ground truth; UI shows it only in demo controls
    signals: list[SignalSpec]
    latest: dict[str, float]                 # signal name -> latest value (no load_pct)
    sparkline: list[int]                     # last 60 health values, oldest first


class PlantState(BaseModel):
    sim_time: datetime
    speed: int                               # samples per real second (1 sample = 5 sim minutes)
    paused: bool
    auto_pause_on_alert: bool
    machines: list[MachineSummary]
    open_alerts: int                         # alerts in diagnosing/open/escalated


class SeriesPoint(BaseModel):
    t: datetime
    values: dict[str, float]                 # every signal + "load_pct"
    score: float                             # max |EWMA z| across signals at t


class Marker(BaseModel):
    kind: MarkerKind
    t: datetime
    label: str
    signal: str | None = None                # threshold_alarm: which signal crossed


class Series(BaseModel):
    machine_id: str
    signals: list[SignalSpec]
    ewma_limit: float
    points: list[SeriesPoint]                # oldest first
    markers: list[Marker]


# ---------- detection ----------
class Contribution(BaseModel):
    signal: str
    score: float                             # |EWMA of residual z|
    z: float                                 # latest residual z
    slope_per_h: float                       # raw signal units per hour (last 3 h)
    direction: Literal["up", "down"]
    deviating_since: datetime | None = None


class AnomalyEvent(BaseModel):
    id: str
    machine_id: str
    detected_at: datetime
    first_deviation_at: datetime
    score: float
    contributions: list[Contribution]        # ALL signals, sorted by score desc


# ---------- diagnosis ----------
class Evidence(BaseModel):
    kind: EvidenceKind
    ref: str                                 # signal name | maintenance record id | manual section id | part number
    detail: str                              # one sentence: what this evidence shows


class Alternative(BaseModel):
    fault: str
    why_less_likely: str


class PartLine(BaseModel):
    part_no: str
    name: str
    qty: int = 1
    in_stock: int | None = None              # always overwritten by backend from spare_parts.json
    lead_time_days: int | None = None        # always overwritten by backend


class Diagnosis(BaseModel):
    fault: DiagnosedFault
    fault_label: str
    confidence: float = Field(ge=0, le=1)
    summary: str
    alternatives: list[Alternative] = []
    evidence: list[Evidence]
    severity: Severity
    est_time_to_failure_h: float | None = None
    action: Action
    category: Category
    fix_steps: list[str]
    parts: list[PartLine] = []
    safety: list[str] = []
    verified: bool = False                   # set by backend: all evidence refs resolved
    validation_errors: list[str] = []


class TraceStep(BaseModel):
    i: int
    kind: Literal["llm", "tool", "validation"]
    name: str                                # "chat.completions" | tool name | "validate" | "fallback"
    input: Any = None
    output: Any = None
    latency_ms: int = 0
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


# ---------- people & alerts ----------
class Person(BaseModel):
    id: str
    name: str
    role: Role
    shift: Literal["A", "B", "C"]            # A 06-14, B 14-22, C 22-06 (sim time)
    areas: list[str]                         # area names or "all"
    on_shift: bool = False                   # computed at request time


class Notification(BaseModel):
    person_id: str
    person_name: str
    role: Role
    channel: Literal["in_app", "telegram"]
    reason: Literal["primary", "cc", "escalation"]
    sent_at: datetime
    delivered: bool
    message: str


class Ack(BaseModel):
    person_id: str
    at: datetime
    decision: Literal["accepted", "rejected"]
    note: str | None = None


class WorkOrder(BaseModel):
    id: str
    created_at: datetime
    machine_id: str
    title: str
    priority: Literal["P1", "P2", "P3"]
    assignee_id: str
    steps: list[str]
    parts: list[PartLine]
    status: Literal["open", "done"]


class Resolution(BaseModel):
    at: datetime
    actual_fault: DiagnosedFault
    diagnosis_correct: bool
    note: str | None = None


class Alert(BaseModel):
    id: str
    machine_id: str
    machine_name: str
    state: AlertState
    created_at: datetime
    event: AnomalyEvent
    diagnosis: Diagnosis | None = None       # None while state == "diagnosing"
    trace: list[TraceStep] = []              # grows live while diagnosing
    error: str | None = None                 # e.g. "AMD API timeout, rule-based fallback used"
    assignee: Person | None = None
    notifications: list[Notification] = []
    ack: Ack | None = None
    work_order: WorkOrder | None = None
    resolution: Resolution | None = None
    threshold_alarm_at: datetime | None = None   # when the legacy fixed-threshold alarm fired
    threshold_signal: str | None = None
    lead_time_h: float | None = None             # threshold_alarm_at - event.detected_at, hours


# ---------- requests ----------
class InjectRequest(BaseModel):
    machine_id: str
    fault: FaultType
    severity: float = Field(1.0, ge=0.3, le=2.0)
    duration_h: float | None = None          # None = fault default


class ControlRequest(BaseModel):
    paused: bool | None = None
    speed: int | None = Field(None, ge=1, le=60)
    auto_pause_on_alert: bool | None = None


class ResetRequest(BaseModel):
    seed: int = 7


class AckRequest(BaseModel):
    person_id: str
    decision: Literal["accepted", "rejected"]
    note: str | None = None


class ResolveRequest(BaseModel):
    actual_fault: DiagnosedFault
    note: str | None = None


class ReplaceRequest(BaseModel):
    fault: DiagnosedFault | None = None      # the UI sends the diagnosed fault; None = "bearing_wear"


# ---------- reference data ----------
class ManualSection(BaseModel):
    id: str
    title: str
    text: str


class MaintenanceRecord(BaseModel):
    id: str
    machine_id: str
    date: str                                # YYYY-MM-DD
    type: Literal["preventive", "corrective", "inspection", "missed_pm"]
    title: str
    description: str
    parts: list[str] = []
    cost_eur: float = 0
    downtime_h: float = 0
    technician_id: str | None = None


# ---------- repair vs replace ----------
class ReplaceOption(BaseModel):
    option_id: str                           # "repair" or catalog candidate id
    kind: Literal["repair", "replace"]
    label: str
    capex_eur: float
    energy_eur_5y: float
    maintenance_eur_5y: float
    downtime_eur_5y: float
    tco_5y_eur: float
    efficiency_pct: float
    lead_time_days: int
    fits_duty: bool
    fit_notes: str
    score: float                             # 0-100, 0 if it does not fit
    rank: int                                # 1 = best


class ReplaceAnalysis(BaseModel):
    machine_id: str
    fault: DiagnosedFault
    duty: dict[str, float]                   # flow_m3h, head_m, hours_per_year
    assumptions: dict[str, float]
    options: list[ReplaceOption]             # sorted by rank
    recommendation: str                      # option_id of rank 1
    payback_months: float | None             # recommended replacement vs repair; None if repair wins
    justification: str
    justification_verified: bool             # every number in the text traces to the table


# ---------- AMD inference ----------
class LlmCall(BaseModel):
    id: str
    at: datetime                             # wall clock UTC
    purpose: LlmPurpose
    model: str
    endpoint: str                            # host only, e.g. "developer.amd.com.cn"
    latency_ms: int
    prompt_tokens: int
    completion_tokens: int
    tokens_per_s: float                      # completion_tokens / latency (end to end)
    ok: bool
    error: str | None = None


class AmdStats(BaseModel):
    provider: str                            # "AMD Radeon API"
    model: str
    endpoint: str
    mock: bool
    calls: int
    errors: int
    total_prompt_tokens: int
    total_completion_tokens: int
    avg_latency_ms: float
    avg_tokens_per_s: float
    recent: list[LlmCall]                    # newest first, max 20
```

### 7.2 `frontend/src/types.ts` (P3 commits this verbatim)

```ts
// Mirror of backend/app/models.py. Keep in sync. Datetimes are ISO strings (UTC, "Z").
export type MachineStatus = "ok" | "watch" | "alert" | "down";
export type FaultType = "bearing_wear" | "cavitation" | "misalignment" | "motor_overheat";
export type DiagnosedFault = FaultType | "other";
export type Severity = "low" | "medium" | "high" | "critical";
export type Action = "monitor" | "schedule_repair" | "stop_now" | "consider_replacement";
export type Category = "mechanical" | "electrical" | "process";
export type AlertState = "diagnosing" | "open" | "acknowledged" | "escalated" | "resolved" | "rejected";
export type EvidenceKind = "sensor" | "history" | "manual" | "parts";
export type Role = "mechanical_technician" | "electrical_technician" | "process_engineer" | "maintenance_supervisor";
export type MarkerKind = "fault_injected" | "ai_detected" | "threshold_alarm" | "failure" | "acknowledged" | "resolved";
export type LlmPurpose = "diagnosis" | "alert_message" | "replace_justification" | "eval" | "check";

export interface SignalSpec { name: string; label: string; unit: string; alarm_high: number | null; alarm_low: number | null; }
export interface MachineSummary {
  id: string; name: string; type: string; area: string; model: string;
  status: MachineStatus; health: number; active_alert_id: string | null; injected_fault: FaultType | null;
  signals: SignalSpec[]; latest: Record<string, number>; sparkline: number[];
}
export interface PlantState { sim_time: string; speed: number; paused: boolean; auto_pause_on_alert: boolean; machines: MachineSummary[]; open_alerts: number; }
export interface SeriesPoint { t: string; values: Record<string, number>; score: number; }
export interface Marker { kind: MarkerKind; t: string; label: string; signal: string | null; }
export interface Series { machine_id: string; signals: SignalSpec[]; ewma_limit: number; points: SeriesPoint[]; markers: Marker[]; }

export interface Contribution { signal: string; score: number; z: number; slope_per_h: number; direction: "up" | "down"; deviating_since: string | null; }
export interface AnomalyEvent { id: string; machine_id: string; detected_at: string; first_deviation_at: string; score: number; contributions: Contribution[]; }

export interface Evidence { kind: EvidenceKind; ref: string; detail: string; }
export interface Alternative { fault: string; why_less_likely: string; }
export interface PartLine { part_no: string; name: string; qty: number; in_stock: number | null; lead_time_days: number | null; }
export interface Diagnosis {
  fault: DiagnosedFault; fault_label: string; confidence: number; summary: string;
  alternatives: Alternative[]; evidence: Evidence[]; severity: Severity; est_time_to_failure_h: number | null;
  action: Action; category: Category; fix_steps: string[]; parts: PartLine[]; safety: string[];
  verified: boolean; validation_errors: string[];
}
export interface TraceStep { i: number; kind: "llm" | "tool" | "validation"; name: string; input: unknown; output: unknown; latency_ms: number; prompt_tokens: number | null; completion_tokens: number | null; }

export interface Person { id: string; name: string; role: Role; shift: "A" | "B" | "C"; areas: string[]; on_shift: boolean; }
export interface Notification { person_id: string; person_name: string; role: Role; channel: "in_app" | "telegram"; reason: "primary" | "cc" | "escalation"; sent_at: string; delivered: boolean; message: string; }
export interface Ack { person_id: string; at: string; decision: "accepted" | "rejected"; note: string | null; }
export interface WorkOrder { id: string; created_at: string; machine_id: string; title: string; priority: "P1" | "P2" | "P3"; assignee_id: string; steps: string[]; parts: PartLine[]; status: "open" | "done"; }
export interface Resolution { at: string; actual_fault: DiagnosedFault; diagnosis_correct: boolean; note: string | null; }
export interface Alert {
  id: string; machine_id: string; machine_name: string; state: AlertState; created_at: string;
  event: AnomalyEvent; diagnosis: Diagnosis | null; trace: TraceStep[]; error: string | null;
  assignee: Person | null; notifications: Notification[]; ack: Ack | null; work_order: WorkOrder | null;
  resolution: Resolution | null; threshold_alarm_at: string | null; threshold_signal: string | null; lead_time_h: number | null;
}

export interface InjectRequest { machine_id: string; fault: FaultType; severity?: number; duration_h?: number | null; }
export interface ControlRequest { paused?: boolean; speed?: number; auto_pause_on_alert?: boolean; }
export interface ResetRequest { seed?: number; }
export interface AckRequest { person_id: string; decision: "accepted" | "rejected"; note?: string | null; }
export interface ResolveRequest { actual_fault: DiagnosedFault; note?: string | null; }
export interface ReplaceRequest { fault?: DiagnosedFault | null; }

export interface ManualSection { id: string; title: string; text: string; }
export interface MaintenanceRecord {
  id: string; machine_id: string; date: string; type: "preventive" | "corrective" | "inspection" | "missed_pm";
  title: string; description: string; parts: string[]; cost_eur: number; downtime_h: number; technician_id: string | null;
}

export interface ReplaceOption {
  option_id: string; kind: "repair" | "replace"; label: string; capex_eur: number; energy_eur_5y: number;
  maintenance_eur_5y: number; downtime_eur_5y: number; tco_5y_eur: number; efficiency_pct: number;
  lead_time_days: number; fits_duty: boolean; fit_notes: string; score: number; rank: number;
}
export interface ReplaceAnalysis {
  machine_id: string; fault: DiagnosedFault; duty: Record<string, number>; assumptions: Record<string, number>;
  options: ReplaceOption[]; recommendation: string; payback_months: number | null; justification: string; justification_verified: boolean;
}

export interface LlmCall { id: string; at: string; purpose: LlmPurpose; model: string; endpoint: string; latency_ms: number; prompt_tokens: number; completion_tokens: number; tokens_per_s: number; ok: boolean; error: string | null; }
export interface AmdStats {
  provider: string; model: string; endpoint: string; mock: boolean; calls: number; errors: number;
  total_prompt_tokens: number; total_completion_tokens: number; avg_latency_ms: number; avg_tokens_per_s: number; recent: LlmCall[];
}
```

### 7.3 Endpoints

All endpoints are under `/api`. Errors use FastAPI's default `{"detail": "..."}`, with 404 for an unknown id and 409 for an invalid state change.

| Method | Path | Body | Returns | Owner |
|---|---|---|---|---|
| GET | `/api/health` | – | `{"ok": true, "sim_time": "..."}` | P1 |
| GET | `/api/plant` | – | `PlantState` | P1 |
| GET | `/api/machines/{id}/series?hours=48&max_points=600` | – | `Series` (downsampled, oldest first) | P1 |
| POST | `/api/demo/inject` | `InjectRequest` | `PlantState` | P1 |
| POST | `/api/demo/control` | `ControlRequest` | `PlantState` | P1 |
| POST | `/api/demo/reset` | `ResetRequest` | `PlantState` (alerts cleared too) | P1 |
| POST | `/api/machines/{id}/replace-analysis` | `ReplaceRequest` | `ReplaceAnalysis` | P2 |
| GET | `/api/alerts` | – | `Alert[]`, newest first | P4 |
| GET | `/api/alerts/{id}` | – | `Alert` | P4 |
| POST | `/api/alerts/{id}/ack` | `AckRequest` | `Alert` (accepted → work order; rejected → state rejected) | P4 |
| POST | `/api/alerts/{id}/resolve` | `ResolveRequest` | `Alert` (machine back to healthy) | P4 |
| GET | `/api/people` | – | `Person[]` with `on_shift` computed | P4 |
| GET | `/api/manual/{section_id}` | – | `ManualSection` | P4 |
| GET | `/api/maintenance/{machine_id}` | – | `MaintenanceRecord[]`, newest first | P4 |
| GET | `/api/amd/stats` | – | `AmdStats` | P4 |

**Polling cadence (P3):**
- `/api/plant` every 1 s
- the selected machine's series every 1 s
- `/api/alerts` every 1.5 s
- `/api/amd/stats` every 3 s

### 7.4 Alert state machine

```
diagnosing ──(diagnosis done or fallback)──► open
open ──ack accepted──► acknowledged ──resolve──► resolved
open ──ack rejected──► rejected        (machine suppressed 12 sim-hours)
open ──120 sim-min without ack──► escalated ──ack accepted──► acknowledged
escalated ──ack rejected──► rejected
open / escalated ──resolve──► resolved
```

**Machine status (computed by P1's engine):**

| Status | When |
|---|---|
| `down` | The fault reached 100% and the machine tripped |
| `alert` | `active_alert_id` is set |
| `watch` | Max score ≥ 0.6 × `ewma_limit` |
| `ok` | Otherwise |

---

## 8. Engine interface (Python, P1 provides, P2 and P4 consume)

The live app and the eval use the **same** `Engine` class. The eval runs it headless and steps it manually.

```python
# backend/app/sim/engine.py  (P1)
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable
from backend.app.models import AnomalyEvent, Contribution, FaultType, Marker, MarkerKind, SignalSpec

@dataclass
class Sample:
    t: datetime
    values: dict[str, float]        # every signal + "load_pct"
    score: float                    # max |EWMA z| over signals
    scores: dict[str, float]        # per-signal |EWMA z|
    health: int

@dataclass
class BaselineStat:
    intercept: float                # value = intercept + load_slope * load_pct + residual
    load_slope: float
    resid_median: float
    sigma: float                    # 1.4826 * MAD of residuals
    typical: float                  # expected value at load_pct = 75

class Engine:
    sim_time: datetime
    speed: int
    paused: bool
    auto_pause_on_alert: bool
    ewma_limit: float
    on_anomaly: list[Callable[[AnomalyEvent], None]]
    on_threshold: list[Callable[[str, datetime, str], None]]   # (machine_id, t, signal)
    on_tick: list[Callable[[datetime], None]]                  # called once per step() call

    def __init__(self, seed: int = 7, only: list[str] | None = None, noise_mult: float = 1.0): ...
    # --- read ---
    def machine_ids(self) -> list[str]: ...
    def machine_cfg(self, machine_id: str) -> dict: ...          # the machines.yaml entry
    def signal_specs(self, machine_id: str) -> list[SignalSpec]: ...
    def samples(self, machine_id: str, hours: float | None = None) -> list[Sample]: ...  # oldest first
    def baseline(self, machine_id: str) -> dict[str, BaselineStat]: ...
    def contributions(self, machine_id: str) -> list[Contribution]: ...   # current, sorted desc
    def threshold_alarm(self, machine_id: str) -> tuple[datetime, str] | None: ...
    def is_failed(self, machine_id: str) -> bool: ...
    def markers(self, machine_id: str) -> list[Marker]: ...
    def plant_state(self) -> "PlantState": ...
    # --- write ---
    def step(self, n: int = 1) -> None: ...
    def inject(self, machine_id: str, fault: FaultType, severity: float = 1.0, duration_h: float | None = None) -> None: ...
    def clear_fault(self, machine_id: str) -> None: ...          # repair done: healthy again, detector state reset
    def suppress(self, machine_id: str, hours: float) -> None: ... # no new events for this machine for N sim-hours
    def set_active_alert(self, machine_id: str, alert_id: str | None) -> None: ...
    def add_marker(self, machine_id: str, kind: MarkerKind, t: datetime, label: str) -> None: ...
```

```python
# backend/app/state.py  (P1)
engine: Engine                                       # the live engine
RESET_HOOKS: list[Callable[[Engine], None]] = []     # P4 appends alerts.service.attach at import time
def get_engine() -> Engine: ...
def reset(seed: int = 7) -> Engine: ...              # new Engine, then calls every RESET_HOOK(engine)
async def run_loop() -> None: ...                    # every 100 ms: if not paused, step(speed * 0.1 samples, accumulated)
```

**Hook rules:**
- Hooks run synchronously inside `engine.step()` and must return fast.
- P4's `on_anomaly` schedules the slow LLM work with `asyncio.get_running_loop().create_task(asyncio.to_thread(...))` when an event loop is running.
- When the engine emits an anomaly and `auto_pause_on_alert` is true, the engine sets `paused = True` **before** calling the hooks.
- The engine never emits a new event for a machine that has an active alert, is suppressed, or is down.

### 8.1 LLM client interface (P2 provides; used by P2's repair-vs-replace and P4's alert messages and `/api/amd/stats`)

```python
# backend/app/agent/llm.py  (P2)
from dataclasses import dataclass
from backend.app.models import AmdStats, LlmCall, LlmPurpose

class LlmError(Exception): ...                       # raised after the retry also failed

@dataclass
class ChatResult:
    content: str | None              # assistant text, <think>…</think> blocks stripped
    tool_calls: list[dict]           # [{"id": str, "name": str, "arguments": dict}]
    raw_message: dict                # assistant message, ready to append to the conversation
    call: LlmCall                    # also recorded in the stats ring buffer + llm_calls.jsonl

def chat(messages: list[dict], *, purpose: LlmPurpose, tools: list[dict] | None = None,
         json_mode: bool = False, temperature: float = 0.2, max_tokens: int = 1500) -> ChatResult: ...
def is_mock() -> bool: ...           # True when LLM_MOCK=1 (no network calls; callers use their fallback)
def stats() -> AmdStats: ...
```

`chat()` is synchronous and thread-safe. Callers in async code wrap it in `asyncio.to_thread`. The rule for callers: **if `is_mock()` is true or `LlmError` is raised, use your deterministic fallback**.

---

## 9. `backend/app/main.py` (P1 commits this, nobody else edits it)

```python
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

from backend.app import state  # noqa: E402
from backend.app.api import alerts, decide, plant  # noqa: E402  (importing alerts registers its reset hook)


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.reset()
    task = asyncio.create_task(state.run_loop())
    yield
    task.cancel()


app = FastAPI(title="Operion", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"]
)
app.include_router(plant.router, prefix="/api")
app.include_router(alerts.router, prefix="/api")
app.include_router(decide.router, prefix="/api")

dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="web")
```

In the skeleton, P1 also commits **stubs** `backend/app/api/alerts.py` and `backend/app/api/decide.py` (`router = APIRouter()` and nothing else) so the app starts. P4 then owns `alerts.py` and P2 owns `decide.py`.

---

## 10. Shared seed data (P1 commits these files in the skeleton, exactly as below)

### 10.1 `backend/data/roster.json`

```json
[
  {"id": "tech-a1", "name": "Sara Benali",     "role": "mechanical_technician",  "shift": "A", "areas": ["Cooling loop", "Utilities"]},
  {"id": "tech-a2", "name": "Luca Moretti",    "role": "electrical_technician",  "shift": "A", "areas": ["all"]},
  {"id": "eng-a1",  "name": "Nadia Haddad",    "role": "process_engineer",       "shift": "A", "areas": ["all"]},
  {"id": "sup-a1",  "name": "Karim Ouali",     "role": "maintenance_supervisor", "shift": "A", "areas": ["all"]},
  {"id": "tech-a3", "name": "Paolo Ferri",     "role": "mechanical_technician",  "shift": "A", "areas": ["Packaging line"]},
  {"id": "tech-b1", "name": "Youssef Amrani",  "role": "mechanical_technician",  "shift": "B", "areas": ["all"]},
  {"id": "tech-b2", "name": "Elena Conti",     "role": "electrical_technician",  "shift": "B", "areas": ["all"]},
  {"id": "eng-b1",  "name": "Marco Bianchi",   "role": "process_engineer",       "shift": "B", "areas": ["all"]},
  {"id": "sup-b1",  "name": "Omar Tazi",       "role": "maintenance_supervisor", "shift": "B", "areas": ["all"]},
  {"id": "tech-c1", "name": "Ines Ferreira",   "role": "mechanical_technician",  "shift": "C", "areas": ["all"]},
  {"id": "tech-c2", "name": "Hamza Idrissi",   "role": "electrical_technician",  "shift": "C", "areas": ["all"]},
  {"id": "sup-c1",  "name": "Giulia Romano",   "role": "maintenance_supervisor", "shift": "C", "areas": ["all"]}
]
```

All names are fictional. Shift C has no process engineer, so process alerts at night go to the on-shift supervisor.

### 10.2 `backend/data/spare_parts.json`

```json
[
  {"part_no": "BRG-6309-C3",  "name": "Deep groove ball bearing 6309 C3 (drive end)",     "fits": ["P-101", "P-102"], "in_stock": 2,  "location": "Store B-14", "unit_cost_eur": 85,   "lead_time_days": 3},
  {"part_no": "BRG-6308-C3",  "name": "Deep groove ball bearing 6308 C3 (non-drive end)", "fits": ["P-101", "P-102"], "in_stock": 1,  "location": "Store B-14", "unit_cost_eur": 72,   "lead_time_days": 3},
  {"part_no": "GREASE-EP2",   "name": "Lithium bearing grease EP2, 400 g cartridge",      "fits": ["P-101", "P-102", "M-301"], "in_stock": 12, "location": "Store A-02", "unit_cost_eur": 9, "lead_time_days": 2},
  {"part_no": "SEAL-M80",     "name": "Mechanical seal 45 mm, carbon/SiC",                "fits": ["P-101", "P-102"], "in_stock": 0,  "location": "Store B-15", "unit_cost_eur": 410,  "lead_time_days": 9},
  {"part_no": "CPL-ELEM-80",  "name": "Flexible coupling elastomer element",              "fits": ["P-101", "P-102"], "in_stock": 3,  "location": "Store B-16", "unit_cost_eur": 64,   "lead_time_days": 4},
  {"part_no": "IMP-CP80",     "name": "Impeller 260 mm, cast iron",                       "fits": ["P-101"],          "in_stock": 0,  "location": "-",          "unit_cost_eur": 1950, "lead_time_days": 21},
  {"part_no": "STR-DN125",    "name": "Suction strainer basket DN125",                    "fits": ["P-101", "P-102"], "in_stock": 1,  "location": "Store C-03", "unit_cost_eur": 140,  "lead_time_days": 5},
  {"part_no": "FAN-MTR-30",   "name": "Motor cooling fan, 30 kW frame",                   "fits": ["P-101"],          "in_stock": 1,  "location": "Store E-01", "unit_cost_eur": 95,   "lead_time_days": 4},
  {"part_no": "SHIM-KIT-80",  "name": "Stainless alignment shim kit",                     "fits": ["P-101", "P-102", "M-301"], "in_stock": 4, "location": "Store B-16", "unit_cost_eur": 38, "lead_time_days": 2},
  {"part_no": "FLT-AIR-C201", "name": "Compressor air intake filter",                     "fits": ["C-201"],          "in_stock": 2,  "location": "Store D-07", "unit_cost_eur": 56,   "lead_time_days": 3},
  {"part_no": "OIL-SEP-C201", "name": "Compressor oil separator element",                 "fits": ["C-201"],          "in_stock": 1,  "location": "Store D-07", "unit_cost_eur": 180,  "lead_time_days": 6},
  {"part_no": "BELT-M301",    "name": "Conveyor drive V-belt set",                        "fits": ["M-301"],          "in_stock": 2,  "location": "Store F-02", "unit_cost_eur": 74,   "lead_time_days": 3}
]
```

### 10.3 `backend/data/catalog.json` (inputs for repair vs. replace)

```json
{
  "assumptions": {
    "energy_eur_per_kwh": 0.18,
    "downtime_eur_per_h": 1200,
    "horizon_years": 5,
    "hours_per_failure": 6,
    "base_maintenance_eur_year": 1500,
    "failures_per_year_new": 0.2,
    "failures_per_corrective_repair": 0.5,
    "maintenance_factor_per_corrective": 0.25
  },
  "repair_estimates": {
    "bearing_wear":   {"parts_eur": 450, "labor_eur": 950, "downtime_h": 8, "efficiency_after_pct": 60, "lead_time_days": 0},
    "cavitation":     {"parts_eur": 140, "labor_eur": 300, "downtime_h": 3, "efficiency_after_pct": 60, "lead_time_days": 0},
    "misalignment":   {"parts_eur": 102, "labor_eur": 600, "downtime_h": 4, "efficiency_after_pct": 60, "lead_time_days": 0},
    "motor_overheat": {"parts_eur": 95,  "labor_eur": 700, "downtime_h": 6, "efficiency_after_pct": 60, "lead_time_days": 0},
    "other":          {"parts_eur": 500, "labor_eur": 800, "downtime_h": 6, "efficiency_after_pct": 60, "lead_time_days": 0}
  },
  "candidates": [
    {"id": "AF-CP80-G2", "label": "AquaFlow CP-80 Gen2 (IE4 motor)", "price_eur": 14500, "install_eur": 1800, "install_downtime_h": 12,
     "efficiency_pct": 74, "rated_flow_m3h": 130, "rated_head_m": 44, "maintenance_eur_year": 900, "lead_time_days": 10,
     "footprint_compatible": true, "notes": "Same footprint and flanges as the current pump; drop-in replacement."},
    {"id": "HX-NB100", "label": "Hydrix NB-100", "price_eur": 11200, "install_eur": 4200, "install_downtime_h": 24,
     "efficiency_pct": 68, "rated_flow_m3h": 180, "rated_head_m": 46, "maintenance_eur_year": 1100, "lead_time_days": 5,
     "footprint_compatible": false, "notes": "Oversized for this duty, so it runs left of its best-efficiency point; needs a new baseplate and piping adapters (included in install cost)."},
    {"id": "VT-ECO75", "label": "Vortan Eco-75", "price_eur": 7900, "install_eur": 2000, "install_downtime_h": 12,
     "efficiency_pct": 61, "rated_flow_m3h": 110, "rated_head_m": 38, "maintenance_eur_year": 1200, "lead_time_days": 7,
     "footprint_compatible": true, "notes": "Cheapest to buy, but cannot reach 120 m3/h at 42 m."}
  ]
}
```

All brands and models are fictional. The math and the expected results (the test oracle) are in P1's brief.

### 10.4 Manual section IDs (P4 writes the text; everyone may reference these IDs)

| ID | Title |
|---|---|
| `P101-OV-01` | Overview and specifications |
| `P101-TS-01` | Troubleshooting: bearing wear |
| `P101-TS-02` | Troubleshooting: cavitation |
| `P101-TS-03` | Troubleshooting: shaft misalignment |
| `P101-TS-04` | Troubleshooting: motor overheating |
| `P101-TS-05` | Troubleshooting: impeller imbalance |
| `P101-TS-06` | Troubleshooting: mechanical seal leak |
| `P101-PR-01` | Procedure: bearing replacement |
| `P101-PR-02` | Procedure: laser shaft alignment |
| `P101-PR-03` | Procedure: lubrication (re-greasing) |
| `P101-PR-04` | Procedure: suction side inspection and strainer cleaning |
| `P101-PR-05` | Procedure: motor cooling and insulation checks |
| `P101-SAF-01` | Safety: lockout/tagout before any work |

**File format:** `backend/data/manuals/pump_p101.md`. Each section starts with a heading line of exactly this form: `## [P101-TS-01] Troubleshooting: bearing wear`. The section text runs until the next `## [` heading.

### 10.5 Key maintenance records for P-101 (the demo story depends on these exact IDs)

| id | date | type | title |
|---|---|---|---|
| `WO-2025-0871` | 2025-08-19 | corrective | Drive-end bearing replaced after noise complaint |
| `WO-2025-1104` | 2025-11-06 | corrective | Coupling element replaced |
| `WO-2026-0153` | 2026-02-12 | corrective | Mechanical seal replaced (leak) |
| `WO-2026-0418` | 2026-05-21 | corrective | Shaft alignment corrected after vibration complaint |
| `PM-2026-0702` | 2026-07-08 | missed_pm | Scheduled bearing re-greasing skipped (production priority) |
| `WO-2026-0901` | 2026-09-03 | inspection | Quarterly vibration route: overall 2.1 mm/s, OK |

Relative to the live sim date 2026-10-15, P-101 has **3 corrective repairs in the last 12 months** (2025-11-06, 2026-02-12, and 2026-05-21). The bearing was last replaced **14 months ago**, and the last re-greasing was **skipped**. P-101 was installed on **2017-03-14** (9 years old).

---

## 11. `.env.example` (P1 commits)

```
# AMD Radeon API (all LLM inference runs here)
RADEON_API_KEY=
LLM_BASE_URL=https://developer.amd.com.cn/radeon/api/v1
LLM_MODEL=DeepSeek-V4-Flash
LLM_TIMEOUT_S=60
# 1 = no API calls, rule-based diagnosis (for UI work)
LLM_MOCK=0
# tools = native tool calling; prefetch = backend gathers evidence, one JSON call
AGENT_MODE=tools
# where llm_calls.jsonl and feedback.jsonl go (Docker sets /tmp/logs)
LOG_DIR=backend/logs
# Optional Telegram alerts (stretch goal)
TELEGRAM_BOT_TOKEN=
# person_id:chat_id pairs, comma-separated, e.g. tech-a1:123456789,sup-a1:987654321
TELEGRAM_CHAT_IDS=
PORT=7860
```

---

## 12. Timeline and checkpoints (all times GMT+1)

These checkpoints cover the build only. Pitch and submission are not part of the 4-way split: one person takes `later-pitch-and-submission.md` after the feature freeze.

| When | Checkpoint | Who |
|---|---|---|
| **Fri 16 Oct, 10:00** | Backend skeleton on `main`: models.py, main.py, stubs, seed data; `uvicorn` starts and `/api/health` answers | P1 |
| Fri 11:00 | Radeon API capability check posted in chat; `AGENT_MODE` decided | P2 |
| **Fri 12:00** | `data.py`, manual and maintenance log on `main` | P4 |
| Fri 12:00 | `llm.py` on `main`; `types.ts` + mocks on `main`, UI renders the overview from mocks | P2, P3 |
| Fri 15:00 | Live engine: `/api/plant`, `/series`, `/demo/*` work with real simulated data | P1 |
| Fri 15:00 | `diagnose()` runs headless on the real engine and returns a validated Diagnosis | P2 |
| **Fri 19:00** | **Integration:** inject → detect → alert → diagnosis on AMD → UI shows it | all |
| Fri 20:00 | `npm run build` passes on `main` | P3 |
| **Fri 23:00** | **Full loop works on the deployed URL** (HF Spaces) | P4 |
| Sat 17 Oct, 11:00 | Repair-vs-replace endpoint live | P2 |
| Sat 12:00 | Eval report with final numbers on `main`; QA pass on the deployed URL | P1, P2, P4 |
| **Sat 14:00** | **Feature freeze.** Only bug fixes after this; the pitch person takes over | all |

## 13. Definition of done (whole project)

1. `uvicorn backend.app.main:app` starts. `POST /api/demo/inject {"machine_id":"P-101","fault":"bearing_wear"}` produces an alert within about 90 s at default speed. The alert's diagnosis is `verified: true` and is assigned to the on-shift mechanical technician.
2. `/api/amd/stats` shows real calls to `DeepSeek-V4-Flash` at `developer.amd.com.cn` with non-zero latency and tokens.
3. `python -m eval.run_eval` writes `eval/report.md`. Pass bars:
   - detection lead time > 0 in at least 90% of fault scenarios
   - top-1 diagnosis accuracy ≥ 80%
   - at most 1 healthy run with a false alarm
4. The full demo works in a browser on the deployed URL from a second device: inject, detect, trace, alert, acknowledge, work order, resolve, repair vs. replace, plus the escalation path (resume without acknowledging).
5. A fresh clone with `.env.example` copied to `.env` and only `RADEON_API_KEY` set builds and runs with `docker build -t mc . && docker run -p 7860:7860 --env-file .env mc`.

---

## 14. Example payloads

These examples are consistent with each other and with the seed data. P3 uses them as mock fixtures; P1, P2 and P4 use them as the expected shape.

> ⚠️ Latency, token, and score values in these examples are **illustrative, not measurements**. Never put them in the pitch. Real numbers come from `/api/amd/stats` and `eval/report.md`.

**Scenario behind the examples:**
- The live clock started at 06:00.
- At 08:00, `bearing_wear` was injected into P-101 (severity 1.0, duration 48 h).
- The detector confirmed an anomaly at 09:40.
- The engine auto-paused, and the agent produced the diagnosis below.

### 14.1 `GET /api/plant`

The `sparkline` arrays are shortened here; the real ones have 60 values. The P-102, C-201, and M-301 entries follow the same shape as P-101 (see P1's `machines.yaml` for their signals).

```json
{
  "sim_time": "2026-10-15T09:40:00Z",
  "speed": 6,
  "paused": true,
  "auto_pause_on_alert": true,
  "open_alerts": 1,
  "machines": [
    {
      "id": "P-101", "name": "Coolant pump P-101", "type": "centrifugal_pump", "area": "Cooling loop", "model": "AquaFlow CP-80",
      "status": "alert", "health": 46, "active_alert_id": "ALT-0001", "injected_fault": "bearing_wear",
      "signals": [
        {"name": "vibration_rms", "label": "Vibration RMS", "unit": "mm/s", "alarm_high": 7.1, "alarm_low": null},
        {"name": "vibration_hf", "label": "HF vibration energy", "unit": "g", "alarm_high": null, "alarm_low": null},
        {"name": "bearing_temp", "label": "Bearing temperature", "unit": "°C", "alarm_high": 85, "alarm_low": null},
        {"name": "motor_temp", "label": "Motor winding temperature", "unit": "°C", "alarm_high": 120, "alarm_low": null},
        {"name": "motor_current", "label": "Motor current", "unit": "A", "alarm_high": 62, "alarm_low": null},
        {"name": "discharge_pressure", "label": "Discharge pressure", "unit": "bar", "alarm_high": null, "alarm_low": 3.3},
        {"name": "flow", "label": "Flow", "unit": "m³/h", "alarm_high": null, "alarm_low": 100}
      ],
      "latest": {"vibration_rms": 1.93, "vibration_hf": 0.37, "bearing_temp": 56.8, "motor_temp": 73.9, "motor_current": 52.9, "discharge_pressure": 4.17, "flow": 121.6},
      "sparkline": [100, 100, 99, 100, 98, 96, 91, 84, 77, 68, 57, 46]
    },
    {
      "id": "C-201", "name": "Air compressor C-201", "type": "screw_compressor", "area": "Utilities", "model": "Kompra SK-45",
      "status": "ok", "health": 97, "active_alert_id": null, "injected_fault": null,
      "signals": [
        {"name": "vibration_rms", "label": "Vibration RMS", "unit": "mm/s", "alarm_high": 7.1, "alarm_low": null},
        {"name": "discharge_pressure", "label": "Discharge pressure", "unit": "bar", "alarm_high": null, "alarm_low": 6.5},
        {"name": "motor_current", "label": "Motor current", "unit": "A", "alarm_high": 92, "alarm_low": null},
        {"name": "oil_temp", "label": "Oil temperature", "unit": "°C", "alarm_high": 100, "alarm_low": null},
        {"name": "motor_temp", "label": "Motor winding temperature", "unit": "°C", "alarm_high": 125, "alarm_low": null}
      ],
      "latest": {"vibration_rms": 2.18, "discharge_pressure": 7.52, "motor_current": 77.4, "oil_temp": 78.9, "motor_temp": 80.6},
      "sparkline": [98, 97, 99, 98, 97, 98, 99, 97, 98, 97, 98, 97]
    }
  ]
}
```

### 14.2 `GET /api/machines/P-101/series?hours=48`

Shortened to 3 points; the real response has up to 600.

```json
{
  "machine_id": "P-101",
  "signals": [
    {"name": "vibration_rms", "label": "Vibration RMS", "unit": "mm/s", "alarm_high": 7.1, "alarm_low": null},
    {"name": "vibration_hf", "label": "HF vibration energy", "unit": "g", "alarm_high": null, "alarm_low": null}
  ],
  "ewma_limit": 1.5,
  "points": [
    {"t": "2026-10-15T09:30:00Z", "values": {"vibration_rms": 1.88, "vibration_hf": 0.36, "bearing_temp": 56.5, "motor_temp": 73.6, "motor_current": 52.7, "discharge_pressure": 4.18, "flow": 121.2, "load_pct": 79.4}, "score": 1.41},
    {"t": "2026-10-15T09:35:00Z", "values": {"vibration_rms": 1.95, "vibration_hf": 0.37, "bearing_temp": 56.6, "motor_temp": 73.8, "motor_current": 52.8, "discharge_pressure": 4.17, "flow": 121.5, "load_pct": 79.8}, "score": 1.53},
    {"t": "2026-10-15T09:40:00Z", "values": {"vibration_rms": 1.93, "vibration_hf": 0.37, "bearing_temp": 56.8, "motor_temp": 73.9, "motor_current": 52.9, "discharge_pressure": 4.17, "flow": 121.6, "load_pct": 80.1}, "score": 1.62}
  ],
  "markers": [
    {"kind": "fault_injected", "t": "2026-10-15T08:00:00Z", "label": "Demo: bearing wear injected", "signal": null},
    {"kind": "ai_detected", "t": "2026-10-15T09:40:00Z", "label": "AI detected anomaly (EVT-0001)", "signal": null}
  ]
}
```

Later, when the legacy alarm fires, the engine adds a marker like this:

```json
{"kind": "threshold_alarm", "t": "2026-10-17T02:20:00Z", "label": "Legacy alarm: Vibration RMS 7.2 mm/s > 7.1", "signal": "vibration_rms"}
```

### 14.3 `GET /api/alerts/ALT-0001` (state `open`)

```json
{
  "id": "ALT-0001",
  "machine_id": "P-101",
  "machine_name": "Coolant pump P-101",
  "state": "open",
  "created_at": "2026-10-15T09:40:00Z",
  "event": {
    "id": "EVT-0001",
    "machine_id": "P-101",
    "detected_at": "2026-10-15T09:40:00Z",
    "first_deviation_at": "2026-10-15T08:55:00Z",
    "score": 1.62,
    "contributions": [
      {"signal": "vibration_hf", "score": 1.62, "z": 3.9, "slope_per_h": 0.048, "direction": "up", "deviating_since": "2026-10-15T08:55:00Z"},
      {"signal": "vibration_rms", "score": 0.41, "z": 1.1, "slope_per_h": 0.021, "direction": "up", "deviating_since": null},
      {"signal": "bearing_temp", "score": 0.22, "z": 0.6, "slope_per_h": 0.05, "direction": "up", "deviating_since": null},
      {"signal": "motor_current", "score": 0.12, "z": 0.3, "slope_per_h": 0.01, "direction": "up", "deviating_since": null},
      {"signal": "motor_temp", "score": 0.1, "z": -0.2, "slope_per_h": 0.0, "direction": "down", "deviating_since": null},
      {"signal": "flow", "score": 0.08, "z": 0.1, "slope_per_h": 0.1, "direction": "up", "deviating_since": null},
      {"signal": "discharge_pressure", "score": 0.05, "z": -0.1, "slope_per_h": 0.0, "direction": "down", "deviating_since": null}
    ]
  },
  "diagnosis": {
    "fault": "bearing_wear",
    "fault_label": "Drive-end bearing wear (early stage)",
    "confidence": 0.82,
    "summary": "High-frequency vibration energy on P-101 has been rising steadily since 08:55 while overall vibration and temperatures are still near normal. This is the early signature of a bearing defect described in the manual, and it fits the history: the drive-end bearing is 14 months old and the last re-greasing was skipped.",
    "alternatives": [
      {"fault": "misalignment", "why_less_likely": "Misalignment raises overall vibration together with bearing temperature and motor current (P101-TS-03); here only high-frequency energy has moved."},
      {"fault": "other", "why_less_likely": "Impeller imbalance (P101-TS-05) raises overall vibration at running speed but not high-frequency bearing energy."}
    ],
    "evidence": [
      {"kind": "sensor", "ref": "vibration_hf", "detail": "HF vibration energy is 3.9 sigma above its learned baseline and rising about 0.05 g per hour since 08:55."},
      {"kind": "sensor", "ref": "vibration_rms", "detail": "Overall vibration is still in the normal range (1.9 mm/s), which matches an early-stage bearing defect rather than imbalance or misalignment."},
      {"kind": "manual", "ref": "P101-TS-01", "detail": "Manual: high-frequency energy rising first, before overall vibration and bearing temperature, is the early sign of bearing wear; typical progression to seizure is about 2 days at full load."},
      {"kind": "history", "ref": "PM-2026-0702", "detail": "The scheduled bearing re-greasing in July was skipped."},
      {"kind": "history", "ref": "WO-2025-0871", "detail": "Drive-end bearing last replaced 14 months ago."},
      {"kind": "parts", "ref": "BRG-6309-C3", "detail": "Replacement drive-end bearing is in stock (2 units, Store B-14)."}
    ],
    "severity": "medium",
    "est_time_to_failure_h": 46,
    "action": "consider_replacement",
    "category": "mechanical",
    "fix_steps": [
      "Confirm the reading with the handheld vibration analyser on the drive-end bearing housing (P101-TS-01).",
      "Re-grease both bearings now per P101-PR-03 to slow the damage.",
      "Plan a stop within the next 24 hours and switch the cooling duty to the standby arrangement.",
      "Isolate the pump: lockout/tagout of the motor and close suction and discharge valves (P101-SAF-01).",
      "Replace the drive-end bearing 6309 C3 following P101-PR-01; replace the non-drive-end bearing if worn.",
      "Check shaft alignment after reassembly (P101-PR-02) and record readings.",
      "Restart, run 30 minutes and confirm HF vibration energy is back near baseline."
    ],
    "parts": [
      {"part_no": "BRG-6309-C3", "name": "Deep groove ball bearing 6309 C3 (drive end)", "qty": 1, "in_stock": 2, "lead_time_days": 3},
      {"part_no": "GREASE-EP2", "name": "Lithium bearing grease EP2, 400 g cartridge", "qty": 1, "in_stock": 12, "lead_time_days": 2}
    ],
    "safety": [
      "Lock out and tag out the motor before opening the bearing housing (P101-SAF-01).",
      "Bearing housing can be above 60 °C: wear gloves."
    ],
    "verified": true,
    "validation_errors": []
  },
  "trace": [
    {"i": 1, "kind": "llm", "name": "chat.completions", "input": "system + anomaly event EVT-0001", "output": "tool_calls: get_sensor_summary(vibration_hf), get_sensor_summary(vibration_rms), get_sensor_summary(bearing_temp)", "latency_ms": 1850, "prompt_tokens": 1420, "completion_tokens": 96},
    {"i": 2, "kind": "tool", "name": "get_sensor_summary", "input": {"machine_id": "P-101", "signal": "vibration_hf", "hours": 24}, "output": {"latest": 0.37, "baseline_typical": 0.3, "z_latest": 3.9, "slope_per_h": 0.048, "projected_hours_to_alarm": null}, "latency_ms": 2, "prompt_tokens": null, "completion_tokens": null},
    {"i": 3, "kind": "tool", "name": "get_sensor_summary", "input": {"machine_id": "P-101", "signal": "vibration_rms", "hours": 24}, "output": {"latest": 1.93, "z_latest": 1.1, "projected_hours_to_alarm": 246.0}, "latency_ms": 2, "prompt_tokens": null, "completion_tokens": null},
    {"i": 4, "kind": "tool", "name": "get_sensor_summary", "input": {"machine_id": "P-101", "signal": "bearing_temp", "hours": 24}, "output": {"latest": 56.8, "z_latest": 0.6, "projected_hours_to_alarm": 564.0}, "latency_ms": 2, "prompt_tokens": null, "completion_tokens": null},
    {"i": 5, "kind": "llm", "name": "chat.completions", "input": "3 tool results", "output": "tool_calls: get_maintenance_history(P-101), search_manual('high frequency vibration rising bearing')", "latency_ms": 1620, "prompt_tokens": 2310, "completion_tokens": 71},
    {"i": 6, "kind": "tool", "name": "get_maintenance_history", "input": {"machine_id": "P-101", "limit": 10}, "output": {"corrective_last_12m": 3, "records": ["WO-2026-0901", "PM-2026-0702", "WO-2026-0418", "..."]}, "latency_ms": 1, "prompt_tokens": null, "completion_tokens": null},
    {"i": 7, "kind": "tool", "name": "search_manual", "input": {"query": "high frequency vibration rising bearing", "k": 3}, "output": [{"section_id": "P101-TS-01", "score": 7.2}, {"section_id": "P101-PR-03", "score": 4.1}, {"section_id": "P101-TS-03", "score": 2.9}], "latency_ms": 3, "prompt_tokens": null, "completion_tokens": null},
    {"i": 8, "kind": "llm", "name": "chat.completions", "input": "2 tool results", "output": "tool_calls: check_spare_parts(P-101, bearing)", "latency_ms": 1210, "prompt_tokens": 3650, "completion_tokens": 40},
    {"i": 9, "kind": "tool", "name": "check_spare_parts", "input": {"machine_id": "P-101", "keyword": "bearing"}, "output": [{"part_no": "BRG-6309-C3", "in_stock": 2}, {"part_no": "BRG-6308-C3", "in_stock": 1}], "latency_ms": 1, "prompt_tokens": null, "completion_tokens": null},
    {"i": 10, "kind": "llm", "name": "chat.completions", "input": "1 tool result", "output": "final JSON diagnosis (bearing_wear, 0.82)", "latency_ms": 4980, "prompt_tokens": 3820, "completion_tokens": 742},
    {"i": 11, "kind": "validation", "name": "validate", "input": "6 evidence refs, 2 parts", "output": "ok: all refs resolved; stock overwritten from inventory", "latency_ms": 1, "prompt_tokens": null, "completion_tokens": null}
  ],
  "error": null,
  "assignee": {"id": "tech-a1", "name": "Sara Benali", "role": "mechanical_technician", "shift": "A", "areas": ["Cooling loop", "Utilities"], "on_shift": true},
  "notifications": [
    {"person_id": "tech-a1", "person_name": "Sara Benali", "role": "mechanical_technician", "channel": "in_app", "reason": "primary", "sent_at": "2026-10-15T09:40:00Z", "delivered": true,
     "message": "P-101 coolant pump: early drive-end bearing wear (medium, ~46 h to failure). First step: confirm with handheld analyser and re-grease now. Open the dashboard to acknowledge."},
    {"person_id": "sup-a1", "person_name": "Karim Ouali", "role": "maintenance_supervisor", "channel": "in_app", "reason": "cc", "sent_at": "2026-10-15T09:40:00Z", "delivered": true,
     "message": "FYI P-101: bearing wear detected; 3 corrective repairs in 12 months, repair-vs-replace review suggested."}
  ],
  "ack": null,
  "work_order": null,
  "resolution": null,
  "threshold_alarm_at": null,
  "threshold_signal": null,
  "lead_time_h": null
}
```

**After acknowledgement:** `state` becomes `acknowledged`, and these fields are filled:

```json
{
  "state": "acknowledged",
  "ack": {"person_id": "tech-a1", "at": "2026-10-15T09:40:00Z", "decision": "accepted", "note": null},
  "work_order": {"id": "WO-2026-0412", "created_at": "2026-10-15T09:40:00Z", "machine_id": "P-101",
    "title": "Drive-end bearing wear (early stage) - Coolant pump P-101", "priority": "P2", "assignee_id": "tech-a1",
    "steps": ["Confirm the reading with the handheld vibration analyser ...", "..."],
    "parts": [{"part_no": "BRG-6309-C3", "name": "Deep groove ball bearing 6309 C3 (drive end)", "qty": 1, "in_stock": 2, "lead_time_days": 3}],
    "status": "open"}
}
```

**When the legacy alarm fires later:** `"threshold_alarm_at": "2026-10-17T02:20:00Z", "threshold_signal": "vibration_rms", "lead_time_h": 40.7`.

### 14.4 `POST /api/machines/P-101/replace-analysis` with `{}`

These are the exact numbers produced by the formulas in P1's brief.

```json
{
  "machine_id": "P-101",
  "fault": "bearing_wear",
  "duty": {"flow_m3h": 120, "head_m": 42, "hours_per_year": 6000},
  "assumptions": {"energy_eur_per_kwh": 0.18, "downtime_eur_per_h": 1200, "horizon_years": 5, "hours_per_failure": 6,
                  "base_maintenance_eur_year": 1500, "failures_per_year_new": 0.2, "failures_per_corrective_repair": 0.5,
                  "maintenance_factor_per_corrective": 0.25, "corrective_repairs_last_12m": 3, "age_years": 9.6},
  "options": [
    {"option_id": "AF-CP80-G2", "kind": "replace", "label": "AquaFlow CP-80 Gen2 (IE4 motor)", "capex_eur": 16300, "energy_eur_5y": 100159, "maintenance_eur_5y": 4500, "downtime_eur_5y": 21600, "tco_5y_eur": 142559, "efficiency_pct": 74, "lead_time_days": 10, "fits_duty": true, "fit_notes": "Meets 120 m3/h at 42 m (rated 130 m3/h at 44 m); same footprint.", "score": 100.0, "rank": 1},
    {"option_id": "HX-NB100", "kind": "replace", "label": "Hydrix NB-100", "capex_eur": 15400, "energy_eur_5y": 108997, "maintenance_eur_5y": 5500, "downtime_eur_5y": 36000, "tco_5y_eur": 165897, "efficiency_pct": 68, "lead_time_days": 5, "fits_duty": true, "fit_notes": "Meets duty (rated 180 m3/h at 46 m) but oversized; new baseplate needed.", "score": 85.9, "rank": 2},
    {"option_id": "repair", "kind": "repair", "label": "Repair current pump (bearing replacement)", "capex_eur": 1400, "energy_eur_5y": 123529, "maintenance_eur_5y": 13125, "downtime_eur_5y": 63600, "tco_5y_eur": 201654, "efficiency_pct": 60, "lead_time_days": 0, "fits_duty": true, "fit_notes": "Keeps the 9-year-old pump; 3 corrective repairs in the last 12 months.", "score": 70.7, "rank": 3},
    {"option_id": "VT-ECO75", "kind": "replace", "label": "Vortan Eco-75", "capex_eur": 9900, "energy_eur_5y": 121504, "maintenance_eur_5y": 6000, "downtime_eur_5y": 21600, "tco_5y_eur": 159004, "efficiency_pct": 61, "lead_time_days": 7, "fits_duty": false, "fit_notes": "Rated 110 m3/h at 38 m: below the 120 m3/h at 42 m duty.", "score": 0.0, "rank": 4}
  ],
  "recommendation": "AF-CP80-G2",
  "payback_months": 15.0,
  "justification": "Replacing P-101 with the AquaFlow CP-80 Gen2 has the lowest 5-year cost at €142,559, against €201,654 for repairing the current pump. Most of the gap is energy (74% vs 60% efficiency) and downtime, since the current pump needed 3 corrective repairs in the last 12 months. The extra upfront cost pays back in about 15 months; the Vortan Eco-75 is cheaper to buy but cannot deliver 120 m3/h at 42 m.",
  "justification_verified": true
}
```

### 14.5 `GET /api/amd/stats` (illustrative values)

```json
{
  "provider": "AMD Radeon API",
  "model": "DeepSeek-V4-Flash",
  "endpoint": "developer.amd.com.cn",
  "mock": false,
  "calls": 6,
  "errors": 0,
  "total_prompt_tokens": 12840,
  "total_completion_tokens": 1214,
  "avg_latency_ms": 2290,
  "avg_tokens_per_s": 58.4,
  "recent": [
    {"id": "llm-0006", "at": "2026-10-15T14:02:31Z", "purpose": "alert_message", "model": "DeepSeek-V4-Flash", "endpoint": "developer.amd.com.cn", "latency_ms": 1100, "prompt_tokens": 1640, "completion_tokens": 72, "tokens_per_s": 65.5, "ok": true, "error": null},
    {"id": "llm-0005", "at": "2026-10-15T14:02:29Z", "purpose": "diagnosis", "model": "DeepSeek-V4-Flash", "endpoint": "developer.amd.com.cn", "latency_ms": 4980, "prompt_tokens": 3820, "completion_tokens": 742, "tokens_per_s": 149.0, "ok": true, "error": null}
  ]
}
```

`at` in `LlmCall` is wall-clock UTC, not simulated time.
