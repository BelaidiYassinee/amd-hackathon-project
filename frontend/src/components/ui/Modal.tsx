import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/** Centered dialog over a dim backdrop. Closes on Esc or backdrop click. */
export function Modal({
  title,
  onClose,
  children,
  className,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={clsx("flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-3">
          <div className="min-w-0 font-semibold text-slate-100">{title}</div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
