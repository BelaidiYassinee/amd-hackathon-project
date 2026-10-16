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
    recent: list[LlmCall]