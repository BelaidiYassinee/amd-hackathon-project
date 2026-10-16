import clsx from "clsx";
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import type { Alert, Diagnosis } from "../../types";
import { actionLabel, severityColor } from "../../lib/format";
import { Pill } from "../ui/Pill";

/** Fault, severity/category/action chips, confidence, time to failure, summary and verification badge. */
export function DiagnosisCard({ diagnosis: d, error }: { diagnosis: Diagnosis; error: Alert["error"] }) {
  const pct = Math.round(d.confidence * 100);
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold leading-snug text-slate-50">{d.fault_label}</h2>

      <div className="flex flex-wrap gap-1.5">
        <Pill className={severityColor(d.severity)}>Severity: {d.severity}</Pill>
        <Pill className="bg-slate-800 text-slate-300">{d.category}</Pill>
        <Pill className={clsx(d.action === "stop_now" ? "bg-red-600 text-white" : "bg-sky-500/15 text-sky-300")}>{actionLabel(d.action)}</Pill>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>Confidence</span>
            <span className="tabular-nums text-slate-200">{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {d.est_time_to_failure_h != null && (
          <div className="shrink-0 text-right">
            <div className="text-lg font-semibold tabular-nums text-amber-300">~{Math.round(d.est_time_to_failure_h)} h</div>
            <div className="text-[11px] text-slate-400">to failure</div>
          </div>
        )}
      </div>

      <p className="text-sm leading-relaxed text-slate-300">{d.summary}</p>

      {d.verified ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          All {d.evidence.length} evidence items checked against plant data
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
          <div className="flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4 shrink-0" /> Unverified
          </div>
          {d.validation_errors.length > 0 && (
            <ul className="mt-1 list-disc pl-6 text-xs text-amber-200/80">
              {d.validation_errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
