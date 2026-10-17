import clsx from "clsx";
import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/** Centered glass dialog over the blurred page. Closes on Esc or backdrop click. */
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
    <div className="glass-backdrop fixed inset-0 z-50 flex animate-fade-in items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={clsx("glass-panel flex max-h-[85vh] w-full max-w-2xl animate-pop-in flex-col overflow-hidden rounded-2xl", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/5 px-6 py-4">
          <div className="min-w-0 font-semibold text-zinc-100">{title}</div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
