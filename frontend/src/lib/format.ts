import type { Action, DiagnosedFault, MachineStatus, Role, Severity, SignalSpec } from "../types";

const eurFormat = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export const eur = (v: number) => eurFormat.format(v);

/** 40.7 -> "40.7 h", 0.5 -> "30 min" */
export function hours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toFixed(1)} h`;
}

// Simulated plant time is UTC: always format with timeZone "UTC", or the clock shifts by the local offset.
const dayFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });

/** "Thu 15 Oct · 09:40" */
export function simTime(iso: string): string {
  const d = new Date(iso);
  return `${dayFormat.format(d).replace(",", "")} · ${timeFormat.format(d)}`;
}

/** "09:40" */
export function simClock(iso: string | number): string {
  return timeFormat.format(new Date(iso));
}

/** Chart axis tick: "09:40", or "Thu 09:40" when the range spans more than a day. */
export function chartTick(ms: number, withDay: boolean): string {
  const d = new Date(ms);
  if (!withDay) return timeFormat.format(d);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(d);
  return `${day} ${timeFormat.format(d)}`;
}

const ROLE_LABELS: Record<Role, string> = {
  mechanical_technician: "Mechanical technician",
  electrical_technician: "Electrical technician",
  process_engineer: "Process engineer",
  maintenance_supervisor: "Maintenance supervisor",
};
export const roleLabel = (r: Role) => ROLE_LABELS[r] ?? r;

const ACTION_LABELS: Record<Action, string> = {
  monitor: "Monitor",
  schedule_repair: "Schedule repair",
  stop_now: "Stop the machine now",
  consider_replacement: "Repair now · review replacement",
};
export const actionLabel = (a: Action) => ACTION_LABELS[a] ?? a;

/** Tailwind classes for a status: text colour, background and dot. */
export function statusColor(s: MachineStatus): { text: string; bg: string; dot: string } {
  switch (s) {
    case "ok":
      return { text: "text-emerald-400", bg: "bg-emerald-500/15", dot: "bg-emerald-500" };
    case "watch":
      return { text: "text-amber-400", bg: "bg-amber-400/15", dot: "bg-amber-400" };
    case "alert":
      return { text: "text-red-400", bg: "bg-red-500/15", dot: "bg-red-500" };
    case "down":
      return { text: "text-zinc-400", bg: "bg-zinc-500/20", dot: "bg-zinc-500" };
  }
}

export const STATUS_LABEL: Record<MachineStatus, string> = { ok: "OK", watch: "Watch", alert: "Alert", down: "Down" };

export function severityColor(s: Severity): string {
  return {
    low: "bg-zinc-700 text-zinc-200",
    medium: "bg-amber-500/20 text-amber-300",
    high: "bg-orange-500/20 text-orange-300",
    critical: "bg-red-600/25 text-red-300",
  }[s];
}

/** Label for a signal name, falling back to the raw name. */
export function signalLabel(signals: SignalSpec[], name: string): string {
  return signals.find((s) => s.name === name)?.label ?? name;
}

export const FAULT_LABELS: Record<DiagnosedFault, string> = {
  bearing_wear: "Bearing wear",
  cavitation: "Cavitation",
  misalignment: "Misalignment",
  motor_overheat: "Motor overheat",
  other: "Other",
};

/** Speed is in samples per real second; 1 sample = 5 sim minutes. 6 -> "30 sim-min/s", 30 -> "2.5 sim-h/s". */
export function speedLabel(speed: number): string {
  const min = speed * 5;
  return min >= 60 ? `${+(min / 60).toFixed(1)} sim-h/s` : `${min} sim-min/s`;
}

export function fmtValue(v: number | undefined, unit = ""): string {
  if (v === undefined || Number.isNaN(v)) return "–";
  const digits = Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2;
  return `${v.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}
