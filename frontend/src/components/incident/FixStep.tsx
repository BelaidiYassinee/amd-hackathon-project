import { AlertTriangle } from "lucide-react";
import type { Alert, Person } from "../../types";
import { AlertActions } from "../alert/AlertActions";
import { FixSteps } from "../alert/FixSteps";
import { PartsList } from "../alert/PartsList";
import { RefText } from "../alert/RefText";
import { stepsDone } from "../../lib/progress";
import { ticksOf, useStepLog } from "../../lib/stepLog";

/** Step 4: the procedure on the left; parts, safety and "mark as fixed" on the right. */
export function FixStep({
  alert,
  people,
  now,
  onChanged,
  onOpenManual,
}: {
  alert: Alert;
  people: Person[] | null;
  /** Plant time, stamped on each ticked step. */
  now: string | null;
  onChanged: () => void;
  onOpenManual: (id: string) => void;
}) {
  const d = alert.diagnosis!;
  const notYetOwned = alert.state === "open" || alert.state === "escalated";
  const ticks = ticksOf(useStepLog(), alert);
  const { done, total } = stepsDone(alert, ticks);

  return (
    <div className="grid h-full min-h-0 grid-cols-[3fr_2fr] gap-8">
      <div className="min-h-0 overflow-y-auto pr-1">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-200">Procedure</span>
          {alert.work_order && (
            <>
              <span className="h-1.5 w-28 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-emerald-400 transition-[width] duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
              </span>
              <span className="text-xs tabular-nums text-zinc-400">
                {done} / {total} done
              </span>
            </>
          )}
          {notYetOwned && <span className="text-xs text-zinc-500">Acknowledge first to tick the steps</span>}
        </div>
        <FixSteps alert={alert} ticks={ticks} now={now} onOpenManual={onOpenManual} />
      </div>

      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto">
        <div>
          <div className="mb-2 text-sm font-medium text-zinc-200">Parts</div>
          <PartsList parts={d.parts} />
        </div>
        {d.safety.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-medium text-zinc-200">Safety</div>
            <ul className="space-y-1.5">
              {d.safety.map((s) => (
                <li key={s} className="flex items-start gap-2 text-sm text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <span>
                    <RefText text={s} onOpenManual={onOpenManual} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-auto">
          {notYetOwned ? (
            <p className="text-xs text-zinc-500">Acknowledge the alert in the Assign step to start the work order.</p>
          ) : (
            <AlertActions mode="resolve" alert={alert} people={people} onChanged={onChanged} />
          )}
        </div>
      </div>
    </div>
  );
}
