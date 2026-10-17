import "@google/model-viewer"; // registers <model-viewer> (also loaded by the Plant page)
import { useState } from "react";
import clsx from "clsx";
import { AlertTriangle, CalendarClock, CheckCircle2, UserCheck, type LucideIcon } from "lucide-react";
import { api } from "../../api";
import type { Alert, PlantState } from "../../types";
import type { MachinePrevention } from "../../hooks/usePrevention";
import { usePoll } from "../../hooks/usePoll";
import { simTime } from "../../lib/format";
import { RISK } from "../../lib/preventive";
import { recordOf, usePreventiveLog } from "../../lib/preventiveLog";
import { TONE, type Tone } from "../../lib/progress";
import { Spinner } from "../ui/Spinner";
import { ManualModal } from "../alert/ManualModal";
import { MachineRiskCard } from "./MachineRiskCard";

/**
 * Act before a machine fails: every machine's early-warning level (from the AI detector's anomaly score and its
 * drifting signals) and its maintenance plan, with suggested actions to assign and tick off.
 */
export function PreventView({
  plant,
  alerts,
  machines,
  onOpenIncident,
}: {
  plant: PlantState | null;
  alerts: Alert[] | null;
  /** From usePrevention (App), so this page agrees with the Plant chips and the header badge. */
  machines: MachinePrevention[] | null;
  onOpenIncident: (alertId: string) => void;
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
  const records = cards.flatMap((c) => c.p.suggestions.map((s) => recordOf(log, c.m.id, s.id)));
  const assigned = records.filter((r) => r.assignee_id && !r.done_at).length;
  const done = records.filter((r) => r.done_at).length;
  const open = records.filter((r) => !r.assignee_id && !r.done_at).length;

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
          <Kpi icon={UserCheck} label="Actions assigned" value={assigned} hint={open ? `${open} still unassigned` : "Every action has an owner"} tone="sky" />
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
            />
          ))}
        </div>
      </div>

      {manual && <ManualModal sectionId={manual} onClose={() => setManual(null)} />}
    </main>
  );
}

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: number; hint: string; tone: Tone }) {
  const t = TONE[tone];
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className={clsx("flex h-6 w-6 items-center justify-center rounded-lg", t.bg, t.text)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </div>
      <div className={clsx("mt-2 text-3xl font-semibold tabular-nums", tone === "zinc" ? "text-zinc-100" : t.text)}>{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>
    </div>
  );
}

