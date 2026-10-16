import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Cpu } from "lucide-react";
import { api } from "../../api";
import type { Alert, MachineSummary, SignalSpec } from "../../types";
import type { Highlight } from "../../lib/uiTypes";
import { simClock } from "../../lib/format";
import { usePoll } from "../../hooks/usePoll";
import { Card } from "../ui/Card";
import { Spinner } from "../ui/Spinner";
import { AnomalyScoreChart } from "./AnomalyScoreChart";
import { SignalChart, type ChartRow } from "./SignalChart";
import { MARKER_STYLES } from "./markers";

const RANGES = [6, 24, 48];
const PUMP_DEFAULT = ["vibration_rms", "vibration_hf", "bearing_temp", "motor_current"];

/** Which signals to draw: active alert's top 4 contributors, else defaults; the highlighted signal is always included. */
function pickSignals(machine: MachineSummary, signals: SignalSpec[], alert: Alert | null, showAll: boolean, highlight: Highlight | null): SignalSpec[] {
  let names: string[];
  if (showAll) names = signals.map((s) => s.name);
  else if (alert && alert.id === machine.active_alert_id) names = alert.event.contributions.slice(0, 4).map((c) => c.signal);
  else if (machine.type.includes("pump")) names = PUMP_DEFAULT;
  else names = signals.slice(0, 4).map((s) => s.name);

  if (highlight && !names.includes(highlight.signal)) names = [...names, highlight.signal];
  return names.map((n) => signals.find((s) => s.name === n)).filter((s): s is SignalSpec => !!s);
}

export function MachineChart({
  machine,
  alert,
  paused,
  highlight,
}: {
  machine: MachineSummary;
  alert: Alert | null;
  paused: boolean;
  highlight: Highlight | null;
}) {
  const [hours, setHours] = useState(24);
  const [showAll, setShowAll] = useState(false);
  const series = usePoll(() => api.series(machine.id, hours), 1000, [machine.id, hours]);
  const highlightRef = useRef<HTMLDivElement>(null);

  const data = useMemo<ChartRow[]>(
    () => (series.data?.points ?? []).map((p) => ({ tms: Date.parse(p.t), ...p.values, score: p.score }) as ChartRow),
    [series.data],
  );

  // Series.signals can be shorter than the machine's list; prefer the machine's full spec.
  const allSignals = machine.signals.length ? machine.signals : (series.data?.signals ?? []);
  const shown = pickSignals(machine, allSignals, alert, showAll, highlight);
  const markers = series.data?.markers ?? [];
  const withDayTicks = hours > 24;

  // Scroll the highlighted signal into view when evidence is clicked.
  useEffect(() => {
    if (highlight) highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlight]);

  const investigating = paused && alert?.state === "diagnosing";

  return (
    <Card className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-100">{machine.name}</div>
          <div className="truncate text-xs text-slate-400">
            {machine.model} · {machine.area}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {markers.map((m) => {
            const s = MARKER_STYLES[m.kind];
            return (
              <span key={`${m.kind}-${m.t}`} className="flex items-center gap-1.5" title={m.label}>
                <span className="inline-block h-3 rounded-full" style={{ width: Math.max(2, s.width), background: s.color }} />
                {s.label ?? m.label} · {simClock(m.t)}
              </span>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" className="accent-sky-500" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show all signals
          </label>
          <div className="flex rounded-lg border border-slate-700 bg-slate-800 p-0.5">
            {RANGES.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHours(h)}
                className={clsx("rounded-md px-2.5 py-1 text-xs font-medium", hours === h ? "bg-slate-600 text-white" : "text-slate-400 hover:text-slate-200")}
              >
                {h} h
              </button>
            ))}
          </div>
        </div>
      </div>

      {investigating && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full border border-red-600/60 bg-slate-950/90 px-4 py-1.5 text-sm text-slate-100 shadow-lg">
            <Cpu className="h-4 w-4 text-red-500" />
            Paused · AI is investigating on AMD…
            <Spinner className="text-red-400" />
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!series.data ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-slate-400">
            <Spinner /> Loading signals…
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">No data in this range yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {shown.map((s, i) => {
              const hl = highlight?.signal === s.name ? { from: Date.parse(highlight.from), to: Date.parse(highlight.to) } : null;
              return (
                <SignalChart
                  key={s.name}
                  ref={hl ? highlightRef : undefined}
                  data={data}
                  signal={s}
                  markers={markers}
                  isTop={i === 0}
                  withDayTicks={withDayTicks}
                  highlight={hl}
                />
              );
            })}
            <AnomalyScoreChart data={data} limit={series.data.ewma_limit} markers={markers} withDayTicks={withDayTicks} />
          </div>
        )}
        {series.error && <div className="mt-2 text-xs text-amber-400">Series update failed, showing last data: {series.error.message}</div>}
      </div>
    </Card>
  );
}
