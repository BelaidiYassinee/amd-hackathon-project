import clsx from "clsx";
import type { ReactNode } from "react";
import type { MachineStatus } from "../../types";
import { STATUS_LABEL, statusColor } from "../../lib/format";

/** Small rounded label. Pass colour classes through `className`. */
export function Pill({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", className)}
    >
      {children}
    </span>
  );
}

/** Status is always shown as a colour AND a text label. */
export function StatusPill({ status }: { status: MachineStatus }) {
  const c = statusColor(status);
  return (
    <Pill className={clsx(c.bg, c.text)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", c.dot)} />
      {STATUS_LABEL[status]}
    </Pill>
  );
}
