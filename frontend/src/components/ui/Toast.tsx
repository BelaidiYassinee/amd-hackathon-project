import type { ReactNode } from "react";

/** Fixed bottom-center notice. Render it conditionally; it has no timer of its own. */
export function Toast({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full border border-amber-500/60 bg-slate-900 px-4 py-2 text-sm text-amber-300 shadow-2xl">
        {children}
      </div>
    </div>
  );
}
