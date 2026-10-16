import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/** Titled block inside a panel; optionally collapsible. */
export function Section({
  title,
  icon,
  right,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const heading = (
    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
      {icon}
      {title}
    </span>
  );
  return (
    <section className="border-t border-slate-800 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        {collapsible ? (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 hover:text-slate-200">
            {heading}
            <ChevronDown className={clsx("h-3.5 w-3.5 text-slate-500 transition-transform", !open && "-rotate-90")} />
          </button>
        ) : (
          heading
        )}
        {right}
      </div>
      {(!collapsible || open) && children}
    </section>
  );
}
