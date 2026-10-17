import { api } from "../../api";
import type { Alert, MachineSummary, SignalSpec } from "../../types";
import type { Highlight } from "../../lib/uiTypes";
import { usePoll } from "../../hooks/usePoll";
import { Spinner } from "../ui/Spinner";
import { ChartStack, MarkerLegend } from "./ChartStack";

/**
 * Chart for the Detect step: the signal that tipped off the AI, the signal the legacy alarm watches,
 * and the anomaly score. The window grows with sim time so both markers stay in view while fast-forwarding.
 */
export function IncidentChart({
  alert,
  machine,
  simTime,
  highlight,
}: {
  alert: Alert;
  machine: MachineSummary;
  simTime: string | undefined;
  highlight: Highlight | null;
}) {
  const since = Date.parse(alert.event.first_deviation_at);
  const now = simTime ? Date.parse(simTime) : since;
  const elapsedH = Math.max(0, (now - since) / 3_600_000);
  // Show some healthy baseline before the deviation (never more than the API's 48 h); step the window so it changes rarely.
  const hours = [6, 12, 24, 48].find((h) => h >= elapsedH * 1.6 + 2) ?? 48;
  const series = usePoll(() => api.series(machine.id, hours), 1000, [machine.id, hours], { keepData: true });

  const names = [alert.event.contributions[0]?.signal, alert.threshold_signal ?? "vibration_rms"];
  if (highlight && !names.includes(highlight.signal)) names.push(highlight.signal);
  const signals = [...new Set(names)]
    .map((n) => machine.signals.find((s) => s.name === n))
    .filter((s): s is SignalSpec => !!s);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <MarkerLegend series={series.data} />
      <div className="min-h-0 flex-1">
        {series.data ? (
          <ChartStack series={series.data} signals={signals} highlight={highlight} fill />
        ) : (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-zinc-400">
            <Spinner /> Loading signals…
          </div>
        )}
      </div>
    </div>
  );
}
