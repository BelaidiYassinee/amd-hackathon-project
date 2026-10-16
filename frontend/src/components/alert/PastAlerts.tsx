import { CheckCircle2 } from "lucide-react";
import type { Alert } from "../../types";
import { Pill } from "../ui/Pill";

/** "No alert" state: a reassuring line and a compact list of past alerts across all machines. */
export function PastAlerts({ alerts, allClear, onSelect }: { alerts: Alert[]; allClear: boolean; onSelect: (a: Alert) => void }) {
  return (
    <div className="p-4">
      <div className="flex items-center gap-2 text-sm text-emerald-300">
        <CheckCircle2 className="h-5 w-5" />
        {allClear ? "All machines running normally" : "No alerts for this machine"}
      </div>
      <div className="mt-1 text-xs text-slate-500">The AI detector is watching every signal against its learned baseline.</div>

      <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Past alerts</div>
      {alerts.length === 0 ? (
        <div className="mt-2 text-sm text-slate-500">None yet.</div>
      ) : (
        <ul className="mt-2 divide-y divide-slate-800">
          {alerts.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onSelect(a)} className="flex w-full items-center gap-2 py-2 text-left text-sm hover:bg-slate-800/50">
                <span className="w-20 shrink-0 font-mono text-xs text-slate-400">{a.id}</span>
                <span className="w-12 shrink-0 text-slate-300">{a.machine_id}</span>
                <span className="min-w-0 flex-1 truncate text-slate-300">{a.diagnosis?.fault_label ?? "Diagnosing…"}</span>
                <Pill className="bg-slate-800 text-slate-400">{a.state}</Pill>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
