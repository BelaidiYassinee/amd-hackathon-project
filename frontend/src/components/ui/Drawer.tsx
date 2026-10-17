import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

/** Right-side glass drawer over the blurred page. Closes on Esc or backdrop click. */
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
    <div className="glass-backdrop fixed inset-0 z-40 flex animate-fade-in justify-end p-3" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        style={{ width }}
        className="glass-panel flex h-full max-w-full animate-slide-in flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/5 px-6 py-5">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-zinc-100">{title}</div>
            {subtitle && <div className="mt-1 text-sm text-zinc-400">{subtitle}</div>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </aside>
    </div>
  );
}
