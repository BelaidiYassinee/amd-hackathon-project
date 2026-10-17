// Small keyed stores for frontend-only records (the backend has no fields for them).
// Saved in this browser's localStorage (memory only in mock mode), shared across tabs, cleared on a new demo run.
import { useSyncExternalStore } from "react";
import type { Alert } from "../types";

const PERSIST = import.meta.env.VITE_MOCK !== "1";

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: keep the data for this session only.
  }
}

export interface PersistedStore<V> {
  get(): Record<string, V>;
  /** Replace one entry; it moves to the end, so it counts as the newest. `null` removes it. */
  set(key: string, value: V | null): void;
  /** Mock fixtures only: start an entry without saving it, unless it already exists. */
  seed(key: string, value: V): void;
  clear(): void;
  /** The whole store; re-renders when it changes. */
  use(): Record<string, V>;
}

const all: PersistedStore<unknown>[] = [];

/** `maxKeys`: forget the oldest entries, so the store never grows without bound. */
export function createPersistedStore<V>(storageKey: string, maxKeys: number): PersistedStore<V> {
  const load = (): Record<string, V> => {
    if (!PERSIST) return {};
    try {
      const parsed = JSON.parse(safeGet(storageKey) ?? "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  let data = load();
  const listeners = new Set<() => void>();

  const write = (next: Record<string, V>) => {
    const keys = Object.keys(next);
    data = keys.length > maxKeys ? Object.fromEntries(keys.slice(-maxKeys).map((k) => [k, next[k]])) : next;
    if (PERSIST) safeSet(storageKey, JSON.stringify(data));
    listeners.forEach((f) => f());
  };

  const subscribe = (onChange: () => void) => {
    listeners.add(onChange);
    // Another tab changed it.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      data = load();
      onChange();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onStorage);
    };
  };

  const store: PersistedStore<V> = {
    get: () => data,
    set(key, value) {
      const { [key]: _old, ...rest } = data;
      write(value === null ? rest : { ...rest, [key]: value });
    },
    seed(key, value) {
      if (!(key in data)) data = { ...data, [key]: value };
    },
    clear() {
      if (Object.keys(data).length > 0) write({});
    },
    use: () => useSyncExternalStore(subscribe, () => data),
  };
  all.push(store as PersistedStore<unknown>);
  return store;
}

// The plant clock last seen, to notice a new simulation run.
const RUN = "maintenance-copilot.plant-time";
let lastPlantTime: string | null = PERSIST ? safeGet(RUN) : null;
// Alerts in the previous poll of this session (null before the first one).
let lastAlertCount: number | null = null;

/**
 * Call on every poll. A demo reset (or a backend restart) starts a new run: alert ids restart at ALT-0001, and the
 * simulator is deterministic, so even the creation times repeat. Clear every store when the plant clock goes
 * backwards (a reset restarts it), or when alerts disappear (only a reset removes them). An empty alert list on its
 * own is not a reset: a healthy plant has no alerts, and the user's assignments must survive it.
 */
export function syncRun(alerts: Alert[] | null, plantTime: string | undefined) {
  if (!alerts || !plantTime) return;
  const clockBack = lastPlantTime != null && plantTime < lastPlantTime;
  const alertsGone = lastAlertCount != null && lastAlertCount > 0 && alerts.length === 0;
  if (clockBack || alertsGone) all.forEach((s) => s.clear());
  lastPlantTime = plantTime;
  lastAlertCount = alerts.length;
  if (PERSIST) safeSet(RUN, plantTime);
}
