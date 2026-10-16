import { useState } from "react";
import { ArrowDown, ArrowUp, BellOff, FastForward, Timer } from "lucide-react";
import { api } from "../../api";
import type { Alert, MachineSummary, PlantState } from "../../types";
import type { Highlight } from "../../lib/uiTypes";
import { hours, signalLabel } from "../../lib/format";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { IncidentChart } from "../chart/IncidentChart";

const FAST_SPEED = 30; // 2.5 sim-hours per second

/** Step 1: the AI caught the drift; the legacy alarm is still silent (or fired much later). */
export function DetectStep({
  alert,
  machine,
  plant,
  highlight,
  onPlantChanged,
}: {
  alert: Alert;
  machine: MachineSummary;
  plant: PlantState | null;
  highlight: Highlight | null;
  onPlantChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const e = alert.event;
  const caughtAfterH = (Date.parse(e.detected_at) - Date.parse(e.first_deviation_at)) / 3_600_000;
  const fastForwarding = plant && !plant.paused && plant.speed >= FAST_SPEED;

  async function fastForward() {
    setBusy(true);
    try {
      await api.control({ paused: false, speed: FAST_SPEED });
      onPlantChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-300">
        <span>
          Flagged <span className="font-semibold text-zinc-100">{hours(caughtAfterH)}</span> after the drift began, driven by
        </span>
        {e.contributions.slice(0, 2).map((c) => (
          <span key={c.signal} className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-200">
            {signalLabel(machine.signals, c.signal)}
            {c.direction === "up" ? <ArrowUp className="h-3 w-3 text-red-400" /> : <ArrowDown className="h-3 w-3 text-sky-400" />}
          </span>
        ))}
      </div>

      <IncidentChart alert={alert} machine={machine} simTime={plant?.sim_time} highlight={highlight} />

      {alert.lead_time_h != null ? (
        <div className="flex items-center gap-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-3">
          <Timer className="h-7 w-7 shrink-0 text-emerald-400" />
          <div>
            <div className="text-lg font-semibold text-emerald-300">
              The AI warned <span className="tabular-nums">{alert.lead_time_h.toFixed(1)} h</span> before the old alarm went off
            </div>
            <div className="text-sm text-emerald-200/70">That is the time a maintenance team gains to plan the repair.</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-800/40 px-5 py-3">
          <BellOff className="h-6 w-6 shrink-0 text-zinc-500" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-medium text-zinc-200">The old fixed-threshold alarm is still silent</div>
            <div className="text-zinc-400">A classic plant would not know anything is wrong yet.</div>
          </div>
          {fastForwarding ? (
            <span className="flex items-center gap-2 text-sm text-zinc-300">
              <Spinner /> Fast-forwarding, watching for the old alarm…
            </span>
          ) : (
            <Button onClick={fastForward} disabled={busy || !plant}>
              <FastForward className="h-4 w-4" /> Fast-forward to the old alarm
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
