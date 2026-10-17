// Frontend-only record of preventive actions: who they were assigned to, and when they were done (plant time).
// Each record keeps a copy of the action, so the Team page can still list it after the machine recovers.
import type { MachineSummary } from "../types";
import type { Suggestion } from "./preventive";
import { createPersistedStore } from "./persistedStore";

export interface ActionRecord {
  machine_id: string;
  machine_name: string;
  action_id: string;
  text: string;
  ref: string | null;
  reason: string;
  kind: Suggestion["kind"];
  assignee_id: string | null;
  assigned_at: string | null;
  done_at: string | null;
}

type Log = Record<string, ActionRecord>;

// v2: records carry the action itself. v1 records (assignment only) are left behind, not migrated.
const store = createPersistedStore<ActionRecord>("maintenance-copilot.preventive.v2", 200);

const keyOf = (machineId: string, actionId: string) => `${machineId}:${actionId}`;

/** The record of one suggested action, or null if it was never assigned. */
export function recordOf(l: Log, machineId: string, actionId: string): ActionRecord | null {
  return l[keyOf(machineId, actionId)] ?? null;
}

/** Every recorded action, oldest assignment first. */
export function allRecords(l: Log): ActionRecord[] {
  return Object.values(l);
}

export function assignAction(machine: MachineSummary, s: Suggestion, personId: string, now: string) {
  store.set(keyOf(machine.id, s.id), {
    machine_id: machine.id,
    machine_name: machine.name,
    action_id: s.id,
    text: s.text,
    ref: s.ref,
    reason: s.reason,
    kind: s.kind,
    assignee_id: personId,
    assigned_at: now,
    done_at: null, // a new assignment starts again
  });
}

export function setActionDone(machineId: string, actionId: string, at: string | null) {
  const r = recordOf(store.get(), machineId, actionId);
  if (r) store.set(keyOf(machineId, actionId), { ...r, done_at: at });
}

/** Mock fixtures only: start with an action already assigned (and maybe done), unless it already exists. */
export function seedAction(r: ActionRecord) {
  store.seed(keyOf(r.machine_id, r.action_id), r);
}

/** The whole log; re-renders when an action changes. Read one with `recordOf(log, machineId, actionId)`. */
export function usePreventiveLog(): Log {
  return store.use();
}
