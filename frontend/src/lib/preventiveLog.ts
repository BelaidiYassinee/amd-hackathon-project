// Frontend-only record of preventive actions: who they were assigned to, and when they were done (plant time).
import { createPersistedStore } from "./persistedStore";

export interface ActionRecord {
  assignee_id: string | null;
  assigned_at: string | null;
  done_at: string | null;
}

type Log = Record<string, ActionRecord>;

const store = createPersistedStore<ActionRecord>("maintenance-copilot.preventive.v1", 200);

const keyOf = (machineId: string, actionId: string) => `${machineId}:${actionId}`;
const EMPTY: ActionRecord = { assignee_id: null, assigned_at: null, done_at: null };

export function recordOf(l: Log, machineId: string, actionId: string): ActionRecord {
  return l[keyOf(machineId, actionId)] ?? EMPTY;
}

export function assignAction(machineId: string, actionId: string, personId: string | null, now: string) {
  const r = recordOf(store.get(), machineId, actionId);
  store.set(keyOf(machineId, actionId), { ...r, assignee_id: personId, assigned_at: personId ? now : null });
}

export function setActionDone(machineId: string, actionId: string, at: string | null) {
  const r = recordOf(store.get(), machineId, actionId);
  store.set(keyOf(machineId, actionId), { ...r, done_at: at });
}

/** The whole log; re-renders when an action changes. Read one with `recordOf(log, machineId, actionId)`. */
export function usePreventiveLog(): Log {
  return store.use();
}
