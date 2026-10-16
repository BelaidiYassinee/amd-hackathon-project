import clsx from "clsx";
import { Clock, Wrench } from "lucide-react";
import type { AmdStats, PlantState } from "../../types";
import { simTime, speedLabel } from "../../lib/format";
import { AmdChip } from "./AmdChip";
import { DemoControls } from "./DemoControls";

export function TopBar({
  plant,
  amd,
  amdFailed,
  onOpenAmd,
  onPlantChanged,
}: {
  plant: PlantState | null;
  amd: AmdStats | null;
  amdFailed: boolean;
  onOpenAmd: () => void;
  onPlantChanged: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-950 px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600/20 text-sky-400">
          <Wrench className="h-4 w-4" />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate font-semibold text-slate-100">Maintenance Copilot</div>
          <div className="truncate text-xs text-slate-400">Track 1 · Intelligent Industry</div>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-sm tabular-nums text-slate-100">
          <Clock className="h-4 w-4 text-slate-400" />
          {plant ? simTime(plant.sim_time) : "–"}
        </div>
        {plant && (
          <span className={clsx("text-xs font-medium tabular-nums", plant.paused ? "text-amber-300" : "text-emerald-400")}>
            {plant.paused ? "⏸ Paused" : `▶ ${speedLabel(plant.speed)}`}
          </span>
        )}
      </div>

      <AmdChip stats={amd} failed={amdFailed} onClick={onOpenAmd} />

      <div className="ml-auto">
        <DemoControls plant={plant} onChanged={onPlantChanged} />
      </div>
    </header>
  );
}
