import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Polls `fetcher` every `intervalMs` using a setTimeout chain, so requests never overlap.
 * Skips the fetch while the tab is hidden, and keeps the last good data when a request fails.
 * `keepData`: keep showing the previous data while new deps load (same resource, e.g. a wider time window).
 */
export function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[] = [], { keepData = false } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const run = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // New deps usually mean a different resource: drop the old data so the UI never shows the wrong machine.
    if (!keepData) setData(null);

    const tick = async () => {
      if (document.visibilityState === "visible") await run();
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    };
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, run, ...deps]);

  return { data, error, refresh: run };
}
