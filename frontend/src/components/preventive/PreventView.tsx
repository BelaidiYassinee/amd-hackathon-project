import "@google/model-viewer"; // registers <model-viewer> (also loaded by the Plant page)
import { useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, UserCheck } from "lucide-react";
import { api } from "../../api";
import type { Alert, PlantState } from "../../types";
import type { MachinePrevention } from "../../hooks/usePrevention";
import { usePoll } from "../../hooks/usePoll";
import { simTime } from "../../lib/format";
import { RISK } from "../../lib/preventive";
import { allRecords, recordOf, usePreventiveLog } from "../../lib/preventiveLog";
import { Kpi } from "../ui/Kpi";
import { Spinner } from "../ui/Spinner";
import { ManualModal } from "../alert/ManualModal";
import { MachineRiskCard } from "./MachineRiskCard";

/**
 * Act before a machine fails: every machine's early-warning level (from the AI detector's anomaly score and its
 * drifting signals) and its maintenance plan, with suggested actions to assign to a team member.
 */
export function PreventView({
  plant,
  alerts,
  machines,
  onOpenIncident,
  onViewInTeam,
}: {
  plant: PlantState | null;
  alerts: Alert[] | null;
  /** From usePrevention (App), so this page agrees with the Plant chips and the header badge. */
  machines: MachinePrevention[] | null;
  onOpenIncident: (alertId: string) => void;
  /** Open the Team page on this person. */
  onViewInTeam: (personId: string) => void;
}) {
  const people = usePoll(api.people, 10000);
  const log = usePreventiveLog();
  const [manual, setManual] = useState<string | null>(null);

  if (!plant || !machines) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-400">
        <Spinner /> Reading the machines…
      </div>
    );
  }

  const now = plant.sim_time;
  const cards = machines
    .map((x) => ({ m: x.machine, s: x.series, p: x.prevention }))
    .sort((a, b) => RISK[b.p.risk.level].rank - RISK[a.p.risk.level].rank);

  const atRisk = cards.filter((c) => ["rising", "watch", "act_now"].includes(c.p.risk.level));
  const overdue = cards.reduce((n, c) => n + c.p.pm.filter((x) => x.status === "overdue" || x.missedOn).length, 0);
  const records = allRecords(log);
  const assigned = records.filter((r) => !r.done_at).length;
  const done = records.filter((r) => r.done_at).length;
  const unassigned = cards.reduce((n, c) => n + c.p.suggestions.filter((s) => !recordOf(log, c.m.id, s.id)).length, 0);

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-8 pb-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex items-end justify-between gap-6 pt-2">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">Prevent</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {atRisk.length === 0
                ? "No machine is drifting. Keep the maintenance plan on track."
                : `${atRisk.length === 1 ? `${atRisk[0].m.name} is` : `${atRisk.length} machines are`} drifting from normal. Act before the AI has to raise an alert.`}
            </p>
          </div>
          <span className="shrink-0 text-right text-xs text-zinc-500">
            Early warning from the AI anomaly detector + maintenance plan
            <span className="block">Plant time {simTime(now)}</span>
          </span>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <Kpi icon={AlertTriangle} label="Machines at risk" value={atRisk.length} hint="Score rising or close to the alarm limit" tone={atRisk.length ? "amber" : "zinc"} />
          <Kpi icon={CalendarClock} label="Maintenance overdue" value={overdue} hint="Planned tasks late or skipped" tone={overdue ? "red" : "zinc"} />
          <Kpi icon={UserCheck} label="Actions assigned" value={assigned} hint={unassigned ? `${unassigned} suggested action${unassigned === 1 ? "" : "s"} without an owner` : "Every action has an owner"} tone="sky" />
          <Kpi icon={CheckCircle2} label="Actions done" value={done} hint="Since the start of this run" tone="emerald" />
        </div>

        <div className="grid grid-cols-2 items-start gap-6">
          {cards.map(({ m, s, p }) => (
            <MachineRiskCard
              key={m.id}
              machine={m}
              prevention={p}
              people={people.data}
              now={now}
              limit={s?.ewma_limit || 1}
              onOpenManual={setManual}
              onOpenIncident={() => m.active_alert_id && alerts?.some((a) => a.id === m.active_alert_id) && onOpenIncident(m.active_alert_id)}
              onViewInTeam={onViewInTeam}
            />
          ))}
        </div>
      </div>

      {manual && <ManualModal sectionId={manual} onClose={() => setManual(null)} />}
    </main>
  );
}
