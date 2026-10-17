// Frontend-only record of which work-order steps were ticked, and at what plant time.
// The backend has no field for it, so it lives in a persisted store (lib/persistedStore.ts).
import type { Alert } from "../types";
import { createPersistedStore } from "./persistedStore";

type Log = Record<string, (string | null)[]>;

const store = createPersistedStore<(string | null)[]>("maintenance-copilot.step-log.v1", 50);

const keyOf = (a: Alert) => `${a.id}@${a.created_at}`;

/** One entry per work-order step: the plant time it was ticked, or null. */
export function ticksOf(l: Log, a: Alert): (string | null)[] {
  const saved = l[keyOf(a)] ?? [];
  return Array.from({ length: a.work_order?.steps.length ?? 0 }, (_, i) => saved[i] ?? null);
}

export function setStepDone(a: Alert, step: number, at: string | null) {
  const ticks = ticksOf(store.get(), a);
  ticks[step] = at;
  store.set(keyOf(a), ticks);
}

/** Mock fixtures only: start an alert with some steps ticked, unless the user already ticked it. */
export function seedSteps(a: Alert, ticks: (string | null)[]) {
  store.seed(keyOf(a), ticks);
}

/** The whole log; re-renders when a step is ticked. Read one alert with `ticksOf(log, alert)`. */
export function useStepLog(): Log {
  return store.use();
}
