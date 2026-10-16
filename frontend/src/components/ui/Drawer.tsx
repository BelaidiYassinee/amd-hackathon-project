import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/** Right-side drawer over a dim backdrop. Closes on Esc or backdrop click. */
export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  width = 560,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className="flex h-full max-w-full flex-col border-l border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <div className="font-semibold text-slate-100">{title}</div>
            {subtitle && <div className="mt-1 text-sm text-slate-400">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
