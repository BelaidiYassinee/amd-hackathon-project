// Frontend-only record of which work-order steps were ticked, and at what plant time.
// The backend has no field for it, so it lives in this browser's localStorage (memory only in mock mode).
import { useSyncExternalStore } from "react";
import type { Alert } from "../types";

type Log = Record<string, (string | null)[]>;

const STORAGE = "maintenance-copilot.step-log.v1";
const MAX_ALERTS = 50; // forget the oldest alerts, so the log never grows without bound
const PERSIST = import.meta.env.VITE_MOCK !== "1";

function load(): Log {
  if (!PERSIST) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

let log: Log = load();
const listeners = new Set<() => void>();

const keyOf = (a: Alert) => `${a.id}@${a.created_at}`;

function write(next: Log) {
  const keys = Object.keys(next);
  log = keys.length > MAX_ALERTS ? Object.fromEntries(keys.slice(-MAX_ALERTS).map((k) => [k, next[k]])) : next;
  if (PERSIST) {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(log));
    } catch {
      // Storage full or blocked: keep the ticks for this session only.
    }
  }
  listeners.forEach((f) => f());
}

/** One entry per work-order step: the plant time it was ticked, or null. */
export function ticksOf(l: Log, a: Alert): (string | null)[] {
  const saved = l[keyOf(a)] ?? [];
  return Array.from({ length: a.work_order?.steps.length ?? 0 }, (_, i) => saved[i] ?? null);
}

export function setStepDone(a: Alert, step: number, at: string | null) {
  const ticks = ticksOf(log, a);
  ticks[step] = at;
  const { [keyOf(a)]: _old, ...rest } = log;
  write({ ...rest, [keyOf(a)]: ticks }); // re-insert last, so it counts as the newest
}

// The plant clock last seen, to notice a new simulation run.
const RUN = `${STORAGE}.plant-time`;
let lastPlantTime: string | null = PERSIST ? safeGet(RUN) : null;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Call on every poll. A demo reset (or a backend restart) starts a new run: alert ids restart at ALT-0001, and the
 * simulator is deterministic, so even the creation times repeat. Forget all ticks when the alert list comes back
 * empty or the plant clock goes backwards.
 */
export function syncRun(alerts: Alert[] | null, plantTime: string | undefined) {
  if (!alerts || !plantTime) return;
  const newRun = alerts.length === 0 || (lastPlantTime != null && plantTime < lastPlantTime);
  if (newRun && Object.keys(log).length > 0) write({});
  lastPlantTime = plantTime;
  if (PERSIST) {
    try {
      localStorage.setItem(RUN, plantTime);
    } catch {
      // Not stored: a reset is still caught by the empty alert list.
    }
  }
}

/** Mock fixtures only: start an alert with some steps ticked, unless the user already ticked it. */
export function seedSteps(a: Alert, ticks: (string | null)[]) {
  if (!(keyOf(a) in log)) log = { ...log, [keyOf(a)]: ticks };
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab ticked a step.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE) return;
    log = load();
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The whole log; re-renders when a step is ticked. Read one alert with `ticksOf(log, alert)`. */
export function useStepLog(): Log {
  return useSyncExternalStore(subscribe, () => log);
}
