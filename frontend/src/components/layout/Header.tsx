import clsx from "clsx";
import { ClipboardList, Factory, Gauge, type LucideIcon } from "lucide-react";
import type { AmdStats, PlantState } from "../../types";
import type { Page } from "../../hooks/useRoute";
import { simTime } from "../../lib/format";
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
  badgeTone?: "sky" | "red";
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
            badgeTone === "red" ? "bg-red-500 text-white" : "bg-sky-500/20 text-sky-300",
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
  activeWork,
  needAction,
  amd,
  amdFailed,
  onOpenAmd,
  onPlantChanged,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  plant: PlantState | null;
  /** Incidents still open (badge on Work orders). */
  activeWork: number;
  /** Of those, how many wait on someone (turns the badge red). */
  needAction: number;
  amd: AmdStats | null;
  amdFailed: boolean;
  onOpenAmd: () => void;
  onPlantChanged: () => void;
}) {
  const attention = plant?.machines.filter((m) => m.active_alert_id).length ?? 0;
  return (
    <header className="relative z-20 flex items-center gap-4 px-6 py-3">
      <button type="button" onClick={() => onNavigate("plant")} className="flex items-center gap-2.5 rounded-lg hover:opacity-90">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
          <Gauge className="h-4 w-4" />
        </span>
        <span className="font-semibold text-zinc-100">Maintenance Copilot</span>
      </button>

      <nav aria-label="Pages" className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur-md">
        <Tab icon={Factory} label="Plant" active={page === "plant"} badge={attention} badgeTone="red" onClick={() => onNavigate("plant")} title="The four machines, live" />
        <Tab
          icon={ClipboardList}
          label="Work orders"
          active={page === "work-orders"}
          badge={activeWork}
          badgeTone={needAction > 0 ? "red" : "sky"}
          onClick={() => onNavigate("work-orders")}
          title="Follow up every incident (w)"
        />
      </nav>

      <div className="ml-auto flex items-center gap-3">
        {plant && (
          <span className="flex items-center gap-2 text-xs text-zinc-400" title={plant.paused ? "Simulation paused" : "Simulation running"}>
            <span className={clsx("h-2 w-2 rounded-full", plant.paused ? "bg-amber-400" : "animate-pulse bg-emerald-500")} />
            <span className="tabular-nums">{simTime(plant.sim_time)}</span>
            <span className="text-zinc-600">{plant.paused ? "Paused" : "Live"}</span>
          </span>
        )}
        <AmdChip stats={amd} failed={amdFailed} onClick={onOpenAmd} />
        <DemoMenu plant={plant} onChanged={onPlantChanged} />
      </div>
    </header>
  );
}
