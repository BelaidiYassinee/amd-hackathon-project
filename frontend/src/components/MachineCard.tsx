import clsx from "clsx";
import { BellRing } from "lucide-react";
import type { MachineSummary } from "../types";
import { STATUS_LABEL, fmtValue, statusColor } from "../lib/format";

function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={clsx("h-7 w-full", className)}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function MachineCard({
  machine,
  selected,
  onSelect,
}: {
  machine: MachineSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const c = statusColor(machine.status);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "w-full rounded-xl border bg-slate-900 p-3 text-left transition-colors hover:border-slate-600",
        selected ? "border-slate-500 ring-2 ring-sky-500/70" : "border-slate-800",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">{machine.name}</div>
          <div className="truncate text-xs text-slate-400">
            {machine.id} · {machine.area}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {machine.active_alert_id && <BellRing className="h-4 w-4 text-red-500" aria-label="Active alert" />}
          <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", c.bg, c.text)}>
            <span className={clsx("h-1.5 w-1.5 rounded-full", c.dot)} />
            {STATUS_LABEL[machine.status]}
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-end gap-3">
        <div className="shrink-0">
          <div className={clsx("text-3xl font-bold leading-none tabular-nums", c.text)}>{machine.health}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">Health</div>
        </div>
        <Sparkline values={machine.sparkline} className={c.text} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        {machine.signals.slice(0, 2).map((s) => (
          <div key={s.name} className="min-w-0">
            <div className="truncate text-slate-500">{s.label}</div>
            <div className="tabular-nums text-slate-200">{fmtValue(machine.latest[s.name], s.unit)}</div>
          </div>
        ))}
      </div>
    </button>
  );
}
