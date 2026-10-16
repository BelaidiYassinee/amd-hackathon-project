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
