import { ArrowDown, ArrowUp } from "lucide-react";
import type { AnomalyEvent, SignalSpec } from "../../types";
import { signalLabel, simClock } from "../../lib/format";

/** "Detected 09:40 · deviating since 08:55" + the top 3 contributing signals as chips. */
export function EventSummary({ event, signals }: { event: AnomalyEvent; signals: SignalSpec[] }) {
  return (
    <div>
      <div className="text-sm text-slate-300">
        Detected <span className="font-semibold tabular-nums text-slate-100">{simClock(event.detected_at)}</span>
        <span className="text-slate-500"> · </span>
        deviating since <span className="font-semibold tabular-nums text-slate-100">{simClock(event.first_deviation_at)}</span>
        <span className="text-slate-500"> · {event.id}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {event.contributions.slice(0, 3).map((c) => (
          <span key={c.signal} className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
            {signalLabel(signals, c.signal)}
            {c.direction === "up" ? <ArrowUp className="h-3 w-3 text-red-400" /> : <ArrowDown className="h-3 w-3 text-sky-400" />}
            <span className="tabular-nums text-slate-400">z {c.z.toFixed(1)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
