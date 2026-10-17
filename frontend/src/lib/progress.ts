// Follow-up of an incident after the guided flow: did the assigned person do the job, and on time?
import type { Alert, Person } from "../types";

export type Tone = "violet" | "amber" | "red" | "sky" | "emerald" | "zinc";

export const TONE: Record<Tone, { text: string; bg: string; border: string; edge: string; dot: string; bar: string }> = {
  violet: { text: "text-violet-300", bg: "bg-violet-500/10", border: "border-violet-500/30", edge: "border-violet-400", dot: "bg-violet-400", bar: "bg-violet-400" },
  amber: { text: "text-amber-300", bg: "bg-amber-400/10", border: "border-amber-400/30", edge: "border-amber-400", dot: "bg-amber-400", bar: "bg-amber-400" },
  red: { text: "text-red-300", bg: "bg-red-500/10", border: "border-red-500/40", edge: "border-red-500", dot: "bg-red-500", bar: "bg-red-500" },
  sky: { text: "text-sky-300", bg: "bg-sky-500/10", border: "border-sky-500/30", edge: "border-sky-400", dot: "bg-sky-400", bar: "bg-sky-400" },
  emerald: { text: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/30", edge: "border-emerald-400", dot: "bg-emerald-500", bar: "bg-emerald-400" },
  zinc: { text: "text-zinc-400", bg: "bg-white/[0.04]", border: "border-white/10", edge: "border-zinc-500", dot: "bg-zinc-500", bar: "bg-zinc-500" },
};

export type Stage = "investigating" | "waiting" | "escalated" | "in_progress" | "overdue" | "done" | "done_late" | "rejected";

export const STAGE: Record<Stage, { label: string; tone: Tone }> = {
  investigating: { label: "AI investigating", tone: "violet" },
  waiting: { label: "Waiting for acknowledgement", tone: "amber" },
  escalated: { label: "Escalated", tone: "red" },
  in_progress: { label: "In progress", tone: "sky" },
  overdue: { label: "Overdue", tone: "red" },
  done: { label: "Completed", tone: "emerald" },
  done_late: { label: "Completed late", tone: "amber" },
  rejected: { label: "Rejected", tone: "zinc" },
};

const H = 3_600_000;
const ms = (iso: string) => Date.parse(iso);

/** Hours between two ISO times (b - a). */
export const hoursBetween = (a: string, b: string) => (ms(b) - ms(a)) / H;

/** 0.4 -> "24 min", 3.25 -> "3.3 h", 50 -> "2.1 d" */
export function duration(h: number): string {
  const v = Math.abs(h);
  if (v * 60 < 1) return "under 1 min";
  if (v < 1) return `${Math.round(v * 60)} min`;
  if (v < 48) return `${+v.toFixed(1)} h`;
  return `${+(v / 24).toFixed(1)} d`;
}

// Frontend rule (the backend has no due date): plant hours from acknowledgement to the target, by priority.
const DUE_H = { P1: 4, P2: 24, P3: 72 };

/** When the work order should be done, or null before anyone owns it. */
export function dueAt(a: Alert): string | null {
  const wo = a.work_order;
  if (!wo || !a.ack) return null;
  return new Date(ms(a.ack.at) + DUE_H[wo.priority] * H).toISOString();
}

/** `ticks`: from the step log (lib/stepLog.ts), one plant time or null per step. */
export function stepsDone(a: Alert, ticks: (string | null)[]): { done: number; total: number } {
  const wo = a.work_order;
  if (!wo) return { done: 0, total: a.diagnosis?.fix_steps.length ?? 0 };
  return { done: ticks.filter(Boolean).length, total: wo.steps.length };
}

/** Where the incident stands, judged at plant time `now`. */
export function stage(a: Alert, now: string): Stage {
  const due = dueAt(a);
  switch (a.state) {
    case "diagnosing":
      return "investigating";
    case "open":
      return "waiting";
    case "escalated":
      return "escalated";
    case "acknowledged":
      return due && ms(now) > ms(due) ? "overdue" : "in_progress";
    case "resolved":
      return due && a.resolution && ms(a.resolution.at) > ms(due) ? "done_late" : "done";
    case "rejected":
      return "rejected";
  }
}

/** Who owns the job: whoever acknowledged it, else the person the alert was routed to. */
export function ownerName(a: Alert, people: Person[] | null): string {
  const id = a.work_order?.assignee_id ?? a.ack?.person_id;
  return (id && people?.find((p) => p.id === id)?.name) || a.assignee?.name || "the technician";
}

/** One plain sentence: who has to do what, or how it ended. */
export function verdict(a: Alert, now: string, people: Person[] | null, ticks: (string | null)[]): string {
  const who = ownerName(a, people);
  const { done, total } = stepsDone(a, ticks);
  const due = dueAt(a);
  const notified = a.notifications.find((n) => n.reason === "primary");
  const escalation = a.notifications.find((n) => n.reason === "escalation");
  switch (stage(a, now)) {
    case "investigating":
      return "The AI agent is diagnosing the fault. Nobody has been notified yet.";
    case "waiting":
      return `${who} was notified${notified ? ` ${duration(hoursBetween(notified.sent_at, now))} ago` : ""} and has not acknowledged yet.`;
    case "escalated":
      return `${who} did not acknowledge in time. Escalated to ${escalation?.person_name ?? "the supervisor"}.`;
    case "in_progress":
      return `${who} is on it: ${done} of ${total} steps done${due ? `, due in ${duration(hoursBetween(now, due))}` : ""}.`;
    case "overdue":
      return `${who} is ${duration(hoursBetween(due!, now))} past the target, with ${done} of ${total} steps done.`;
    case "done":
    case "done_late": {
      const late = due && a.resolution ? hoursBetween(due, a.resolution.at) : 0;
      const timing = late > 0 ? `${duration(late)} late` : due ? "on time" : "";
      const ticked = done < total ? ` Only ${done} of ${total} steps were ticked.` : ` All ${total} steps done.`;
      return `Fixed by ${who}${timing ? ` ${timing}` : ""}.${a.work_order ? ticked : ""}`;
    }
    case "rejected":
      return `Rejected as a false alarm by ${who}.`;
  }
}

/** Incidents that still need someone to act. */
export function isActive(a: Alert): boolean {
  return a.state !== "resolved" && a.state !== "rejected";
}
