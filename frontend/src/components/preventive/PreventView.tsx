import "@google/model-viewer"; // registers <model-viewer> (also loaded by the Plant page)
import { useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ShieldCheck, UserCheck } from "lucide-react";
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
import { SuggestedActions } from "./SuggestedActions";
import { EARLY_WARNING } from "../../hooks/usePrevention";

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

  // Only drifting machines get a card. Machines in an incident are handled in the incident flow; healthy ones only
  // show up below if planned maintenance is due.
  const atRisk = cards.filter((c) => EARLY_WARNING.has(c.p.risk.level));
  const others = cards.filter((c) => !EARLY_WARNING.has(c.p.risk.level) && c.p.risk.level !== "incident");
  const planned = others.map((c) => ({ ...c, items: c.p.suggestions.filter((x) => x.kind === "plan") })).filter((c) => c.items.length > 0);
  const watched = [...atRisk, ...others];
  const overdue = watched.reduce((n, c) => n + c.p.pm.filter((x) => x.status === "overdue" || x.missedOn).length, 0);
  const records = allRecords(log);
  const assigned = records.filter((r) => !r.done_at).length;
  const done = records.filter((r) => r.done_at).length;
  const unassigned = watched.reduce((n, c) => n + c.p.suggestions.filter((x) => !recordOf(log, c.m.id, x.id)).length, 0);

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

        {atRisk.length === 0 && (
          <div className="glass flex items-center gap-3 rounded-2xl px-6 py-5 text-sm text-zinc-300">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" />
            No machine is drifting right now. The AI keeps watching every signal and will flag a machine here before it fails.
          </div>
        )}

        <div className="grid grid-cols-2 items-start gap-6">
          {atRisk.map(({ m, s, p }) => (
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

        {planned.length > 0 && (
          <section className="glass rounded-2xl p-5">
            <div className="mb-1 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <CalendarClock className="h-4 w-4 text-amber-300" /> Planned maintenance due
            </div>
            <p className="mb-4 text-xs text-zinc-500">These machines run normally, but a planned task is late or due within 14 days.</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              {planned.map(({ m, items }) => (
                <div key={m.id}>
                  <div className="eyebrow mb-2">
                    {m.name} · {m.id}
                  </div>
                  <SuggestedActions
                    machine={m}
                    suggestions={items}
                    people={people.data}
                    now={now}
                    onOpenManual={setManual}
                    onViewInTeam={onViewInTeam}
                  />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {manual && <ManualModal sectionId={manual} onClose={() => setManual(null)} />}
    </main>
  );
}
