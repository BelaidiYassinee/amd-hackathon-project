import { Timer } from "lucide-react";
import type { Alert, MachineSummary } from "../../types";
import { signalLabel, simTime } from "../../lib/format";

/** "AI warned 40.7 h before the legacy alarm": the headline number of the demo. */
export function LeadTimeBanner({ alert, machine }: { alert: Alert | null; machine: MachineSummary }) {
  if (!alert || alert.lead_time_h == null || !alert.threshold_alarm_at) return null;

  const spec = machine.signals.find((s) => s.name === alert.threshold_signal);
  const rule = spec?.alarm_high != null ? `> ${spec.alarm_high} ${spec.unit}` : spec?.alarm_low != null ? `< ${spec.alarm_low} ${spec.unit}` : "";
  const label = alert.threshold_signal ? signalLabel(machine.signals, alert.threshold_signal) : "Fixed threshold";

  return (
    <div className="flex items-center gap-4 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-5 py-3">
      <Timer className="h-8 w-8 shrink-0 text-emerald-400" />
      <div className="min-w-0">
        <div className="text-xl font-bold text-emerald-300">
          AI warned <span className="tabular-nums">{alert.lead_time_h.toFixed(1)} h</span> before the legacy alarm
        </div>
        <div className="truncate text-sm text-emerald-200/70">
          Legacy alarm: {label} {rule} at {simTime(alert.threshold_alarm_at)}
        </div>
      </div>
    </div>
  );
}
