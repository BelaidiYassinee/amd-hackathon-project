import { useEffect, useRef } from "react";

/**
 * Global single-key shortcuts (demo recording). Keys are matched on `event.key`, e.g. " ", "i", "Escape".
 * Ignored while typing in a form field or when a modifier is held.
 */
export function useHotkeys(handlers: Record<string, () => void>) {
  // Always call the latest handlers without re-binding the listener every render.
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))) return;

      const handler = ref.current[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!handler) return;
      e.preventDefault();
      // A focused button would also "click" on Space/Enter; drop focus so only the shortcut fires.
      if (target?.tagName === "BUTTON") target.blur();
      handler();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
