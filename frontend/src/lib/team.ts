// Every task of every team member in one list: incident work orders, alerts waiting to be acknowledged,
// and preventive actions assigned on the Prevent page.
import type { Alert } from "../types";
import { dueAt } from "./progress";
import { allRecords, type ActionRecord } from "./preventiveLog";
import { ticksOf } from "./stepLog";

export type TaskSource = "work_order" | "preventive" | "acknowledge";
export type TaskStatus = "overdue" | "todo" | "in_progress" | "done";

export interface TeamTask {
  id: string; // "wo:<alertId>" | "prev:<machineId>:<actionId>" | "ack:<alertId>"
  source: TaskSource;
  person_id: string;
  machine_id: string;
  machine_name: string;
  title: string;
  /** Reason, fault or progress, in a few words. */
  detail: string;
  assigned_at: string | null;
  due_at: string | null;
  done_at: string | null;
  status: TaskStatus;
  progress?: { done: number; total: number };
  /** To open the incident (work orders and acknowledgements). */
  alert_id?: string;
  /** To mark a preventive action done. */
  action_id?: string;
}

/** Display order of the groups on a member's card. */
export const STATUS_ORDER: TaskStatus[] = ["overdue", "todo", "in_progress", "done"];

export function teamTasks(
  alerts: Alert[],
  stepLog: Record<string, (string | null)[]>,
  preventiveLog: Record<string, ActionRecord>,
  now: string,
): TeamTask[] {
  const tasks: TeamTask[] = [];

  for (const a of alerts) {
    const wo = a.work_order;
    if (a.state === "rejected") continue;

    // Somebody was notified and has not taken it yet: that is a task too.
    if ((a.state === "open" || a.state === "escalated") && a.assignee) {
      tasks.push({
        id: `ack:${a.id}`,
        source: "acknowledge",
        person_id: a.assignee.id,
        machine_id: a.machine_id,
        machine_name: a.machine_name,
        title: `Acknowledge: ${a.diagnosis?.fault_label ?? "new alert"}`,
        detail: a.state === "escalated" ? "Not acknowledged in time: escalated" : "Notified, waiting for acknowledgement",
        assigned_at: a.notifications.find((n) => n.person_id === a.assignee!.id)?.sent_at ?? a.created_at,
        due_at: null,
        done_at: null,
        status: a.state === "escalated" ? "overdue" : "todo",
        alert_id: a.id,
      });
    }

    if (wo) {
      const ticks = ticksOf(stepLog, a);
      const done = ticks.filter(Boolean).length;
      const due = dueAt(a);
      const resolved = a.state === "resolved";
      tasks.push({
        id: `wo:${a.id}`,
        source: "work_order",
        person_id: wo.assignee_id,
        machine_id: a.machine_id,
        machine_name: a.machine_name,
        title: wo.title,
        detail: `${wo.id} · ${wo.priority} · ${done} of ${wo.steps.length} steps done`,
        assigned_at: wo.created_at,
        due_at: due,
        done_at: a.resolution?.at ?? null,
        status: resolved ? "done" : due && Date.parse(now) > Date.parse(due) ? "overdue" : done > 0 ? "in_progress" : "todo",
        progress: { done, total: wo.steps.length },
        alert_id: a.id,
      });
    }
  }

  for (const r of allRecords(preventiveLog)) {
    if (!r.assignee_id) continue;
    tasks.push({
      id: `prev:${r.machine_id}:${r.action_id}`,
      source: "preventive",
      person_id: r.assignee_id,
      machine_id: r.machine_id,
      machine_name: r.machine_name,
      title: r.text,
      detail: r.reason,
      assigned_at: r.assigned_at,
      due_at: null,
      done_at: r.done_at,
      status: r.done_at ? "done" : "todo",
      action_id: r.action_id,
    });
  }
  return tasks;
}

/** Open tasks: anything not done yet. */
export const isOpen = (t: TeamTask) => t.status !== "done";
