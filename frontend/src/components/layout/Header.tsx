import clsx from "clsx";
import { Gauge } from "lucide-react";
import type { AmdStats, PlantState } from "../../types";
import { AmdChip } from "./AmdChip";
import { DemoMenu } from "./DemoMenu";

export function Header({
  plant,
  amd,
  amdFailed,
  onHome,
  onOpenAmd,
  onPlantChanged,
}: {
  plant: PlantState | null;
  amd: AmdStats | null;
  amdFailed: boolean;
  onHome: () => void;
  onOpenAmd: () => void;
  onPlantChanged: () => void;
}) {
  return (
    <header className="flex items-center gap-4 px-6 py-3">
      <button type="button" onClick={onHome} className="flex items-center gap-2.5 rounded-lg hover:opacity-90">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
          <Gauge className="h-4 w-4" />
        </span>
        <span className="font-semibold text-zinc-100">Maintenance Copilot</span>
      </button>

      {plant && (
        <span className="flex items-center gap-1.5 text-xs text-zinc-500" title={plant.paused ? "Simulation paused" : "Simulation running"}>
          <span className={clsx("h-2 w-2 rounded-full", plant.paused ? "bg-amber-400" : "animate-pulse bg-emerald-500")} />
          {plant.paused ? "Paused" : "Live"}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <AmdChip stats={amd} failed={amdFailed} onClick={onOpenAmd} />
        <DemoMenu plant={plant} onChanged={onPlantChanged} />
      </div>
    </header>
  );
}
