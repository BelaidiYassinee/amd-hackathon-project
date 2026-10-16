import { useState } from "react";
import clsx from "clsx";
import { api } from "../../api";
import type { MachineSummary, SignalSpec } from "../../types";
import { usePoll } from "../../hooks/usePoll";
import { Card } from "../ui/Card";
import { Spinner } from "../ui/Spinner";
import { ChartStack, MarkerLegend } from "./ChartStack";

const RANGES = [6, 24, 48];
// The pump signals that move first for the demo faults; other machines show their first signals.
const PUMP_DEFAULT = ["vibration_hf", "vibration_rms", "bearing_temp"];

function pickSignals(machine: MachineSummary): SignalSpec[] {
  const names = machine.type.includes("pump") ? PUMP_DEFAULT : machine.signals.slice(0, 3).map((s) => s.name);
  return names.map((n) => machine.signals.find((s) => s.name === n)).filter((s): s is SignalSpec => !!s);
}

/** Live signals of one machine on the home screen. */
export function MachineChart({ machine }: { machine: MachineSummary }) {
  const [hours, setHours] = useState(24);
  const series = usePoll(() => api.series(machine.id, hours), 1000, [machine.id, hours]);

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 pt-4">
        <div className="text-sm font-medium text-zinc-200">Live signals · {machine.name}</div>
        <MarkerLegend series={series.data} />
        <div className="ml-auto flex rounded-lg bg-zinc-800/70 p-0.5">
          {RANGES.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(h)}
              className={clsx("rounded-md px-2.5 py-1 text-xs font-medium", hours === h ? "bg-zinc-600 text-white" : "text-zinc-400 hover:text-zinc-200")}
            >
              {h} h
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 px-3 py-3">
        {series.data ? (
          <ChartStack series={series.data} signals={pickSignals(machine)} highlight={null} fill />
        ) : (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-zinc-400">
            <Spinner /> Loading signals…
          </div>
        )}
      </div>
    </Card>
  );
}
