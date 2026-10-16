import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import type { MachineSummary } from "../../types";
import { STATUS_LABEL, statusColor } from "../../lib/format";

/** One machine: name, status (colour + word), health. */
export function MachineTile({
  machine,
  selected,
  onSelect,
  onOpenIncident,
}: {
  machine: MachineSummary;
  selected: boolean;
  onSelect: () => void;
  onOpenIncident?: () => void;
}) {
  const c = statusColor(machine.status);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={clsx(
        "cursor-pointer rounded-xl border bg-zinc-900 p-4 transition-colors hover:border-zinc-600",
        selected ? "border-zinc-500" : "border-zinc-800",
        machine.status === "alert" && "border-red-500/60",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-zinc-100">{machine.name}</span>
        <span className={clsx("flex shrink-0 items-center gap-1.5 text-xs font-medium", c.text)}>
          <span className={clsx("h-2 w-2 rounded-full", c.dot)} />
          {STATUS_LABEL[machine.status]}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <span className={clsx("text-3xl font-semibold tabular-nums", c.text)}>{machine.health}</span>
          <span className="ml-1 text-xs text-zinc-500">health</span>
        </div>
        {onOpenIncident && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenIncident();
            }}
            className="flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500"
          >
            Open incident <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
