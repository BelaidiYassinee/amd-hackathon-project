import type { ReactNode } from "react";

/** Fixed bottom-center notice. Render it conditionally; it has no timer of its own. */
export function Toast({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-pop-in">
      <div className="glass-panel flex items-center gap-2 rounded-full !border-amber-500/40 px-4 py-2 text-sm text-amber-300">{children}</div>
    </div>
  );
}
