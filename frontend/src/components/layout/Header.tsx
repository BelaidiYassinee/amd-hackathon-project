import clsx from "clsx";
import { Factory, Gauge, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import type { AmdStats, PlantState } from "../../types";
import type { Page } from "../../hooks/useRoute";
import { simClock, simTime } from "../../lib/format";
import { AmdChip } from "./AmdChip";
import { DemoMenu } from "./DemoMenu";

function Tab({
  icon: Icon,
  label,
  active,
  badge,
  badgeTone = "sky",
  onClick,
  title,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  badge?: number;
  badgeTone?: "sky" | "amber" | "red";
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={title}
      className={clsx(
        "flex h-8 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
        active ? "bg-white/10 text-zinc-50 shadow-inner shadow-white/5" : "text-zinc-400 hover:text-zinc-200",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {!!badge && (
        <span
          className={clsx(
            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
            badgeTone === "red" ? "bg-red-500 text-white" : badgeTone === "amber" ? "bg-amber-400/20 text-amber-300" : "bg-sky-500/20 text-sky-300",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export function Header({
  page,
  onNavigate,
  plant,
  needAction,
  earlyWarnings,
  openTasks,
  amd,
  amdFailed,
  onOpenAmd,
  onPlantChanged,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  plant: PlantState | null;
  /** Tasks or incidents waiting on someone: overdue, escalated, not acknowledged (turns the Team badge red). */
  needAction: number;
  /** Machines drifting towards an alert (badge on Prevent). */
  earlyWarnings: number;
  /** Team tasks not done yet (badge on Team). */
  openTasks: number;
  amd: AmdStats | null;
  amdFailed: boolean;
  onOpenAmd: () => void;
  onPlantChanged: () => void;
}) {
  const attention = plant?.machines.filter((m) => m.active_alert_id).length ?? 0;
  // Three columns, so the centred page tabs can never run into the controls on the right.
  return (
    <header className="relative z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-3">
      <button type="button" onClick={() => onNavigate("plant")} className="flex items-center gap-2.5 justify-self-start rounded-lg hover:opacity-90">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
          <Gauge className="h-4 w-4" />
        </span>
        <span className="font-semibold text-zinc-100">Maintenance Copilot</span>
      </button>

      <nav aria-label="Pages" className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md">
        <Tab icon={Factory} label="Plant" active={page === "plant"} badge={attention} badgeTone="red" onClick={() => onNavigate("plant")} title="The four machines, live" />
        <Tab
          icon={ShieldCheck}
          label="Prevent"
          active={page === "prevent"}
          badge={earlyWarnings}
          badgeTone="amber"
          onClick={() => onNavigate("prevent")}
          title="Act before a machine fails (p)"
        />
        <Tab
          icon={Users}
          label="Team"
          active={page === "team"}
          badge={openTasks}
          badgeTone={needAction > 0 ? "red" : "sky"}
          onClick={() => onNavigate("team")}
          title="Who does what: by person (m) or by incident (w)"
        />
      </nav>

      <div className="flex items-center gap-3 justify-self-end">
        {plant && (
          <span className="flex items-center gap-2 text-xs text-zinc-400" title={plant.paused ? "Simulation paused" : "Simulation running"}>
            <span className={clsx("h-2 w-2 rounded-full", plant.paused ? "bg-amber-400" : "animate-pulse bg-emerald-500")} />
            <span className="tabular-nums" title={`Plant time ${simTime(plant.sim_time)}`}>
              {simClock(plant.sim_time)}
            </span>
            <span className="text-zinc-600">{plant.paused ? "Paused" : "Live"}</span>
          </span>
        )}
        <AmdChip stats={amd} failed={amdFailed} onClick={onOpenAmd} />
        <DemoMenu plant={plant} onChanged={onPlantChanged} />
      </div>
    </header>
  );
}
