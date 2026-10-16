import { useEffect, useRef } from "react";
import type { Alert } from "../types";

/**
 * Calls `onNew` when the alerts poll returns an alert id we haven't seen before,
 * so the demo jumps to a new alert hands-free. The first poll only seeds the set.
 */
export function useAutoSelect(alerts: Alert[] | null, onNew: (alert: Alert) => void) {
  const seen = useRef<Set<string> | null>(null);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  useEffect(() => {
    if (!alerts) return;
    if (seen.current === null) {
      seen.current = new Set(alerts.map((a) => a.id));
      return;
    }
    // A demo reset clears all alerts and ids restart at ALT-0001, so forget what we've seen.
    if (alerts.length === 0) {
      seen.current.clear();
      return;
    }
    // Alerts are newest first: the first unseen one is the newest new alert.
    const fresh = alerts.filter((a) => !seen.current!.has(a.id));
    fresh.forEach((a) => seen.current!.add(a.id));
    if (fresh.length > 0) onNewRef.current(fresh[0]);
  }, [alerts]);
}
