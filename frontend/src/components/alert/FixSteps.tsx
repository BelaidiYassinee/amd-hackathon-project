import clsx from "clsx";
import { Check } from "lucide-react";
import type { Alert } from "../../types";
import { simClock } from "../../lib/format";
import { setStepDone } from "../../lib/stepLog";
import { notify } from "../../lib/notify";
import { RefText } from "./RefText";

/**
 * Numbered checklist. Each tick is stamped with the plant time in the step log (lib/stepLog.ts),
 * so the Work orders page can follow it. Before the alert is acknowledged there is no work order yet: read-only.
 */
export function FixSteps({
  alert,
  ticks,
  now,
  onOpenManual,
}: {
  alert: Alert;
  /** From the step log: one plant time or null per step. */
  ticks: (string | null)[];
  now: string | null;
  onOpenManual: (id: string) => void;
}) {
  const steps = alert.diagnosis?.fix_steps ?? [];
  const editable = alert.state === "acknowledged" && alert.work_order != null && now != null;

  function toggle(i: number) {
    if (!editable) return;
    setStepDone(alert, i, ticks[i] ? null : now);
    if (!ticks[i]) notify(`Step ${i + 1} done`, steps[i]);
  }

  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const at = ticks[i];
        const done = !!at;
        return (
          // The whole row toggles, except the manual chips inside the text (they are buttons of their own).
          <li
            key={i}
            onClick={(e) => !(e.target as HTMLElement).closest("button") && toggle(i)}
            className={clsx(
              "flex items-start gap-3 rounded-xl border px-3.5 py-3 text-sm transition-colors",
              done ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.03]",
              editable && "cursor-pointer hover:border-white/25 hover:bg-white/[0.06]",
            )}
          >
            <button
              type="button"
              disabled={!editable}
              onClick={() => toggle(i)}
              aria-pressed={done}
              aria-label={`Step ${i + 1} done`}
              className={clsx(
                "mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold tabular-nums transition-colors disabled:cursor-default",
                done ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/20 text-zinc-500",
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </button>
            <span className={clsx("min-w-0 flex-1 leading-snug", done ? "text-zinc-500 line-through decoration-zinc-600" : "text-zinc-200")}>
              <RefText text={s} onOpenManual={onOpenManual} />
            </span>
            {at && <span className="shrink-0 text-xs tabular-nums text-emerald-400/80">{simClock(at)}</span>}
          </li>
        );
      })}
    </ol>
  );
}
