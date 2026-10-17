import clsx from "clsx";
import { CalendarClock, Check, Gauge } from "lucide-react";
import type { Person } from "../../types";
import { roleLabel, simTime } from "../../lib/format";
import type { Suggestion } from "../../lib/preventive";
import { assignAction, recordOf, setActionDone, usePreventiveLog } from "../../lib/preventiveLog";

/**
 * Suggested preventive actions for one machine. Assign each to someone, then tick it when done.
 * Both are stamped with the plant time in the preventive log (browser only).
 */
export function ActionChecklist({
  machineId,
  suggestions,
  people,
  now,
  onOpenManual,
}: {
  machineId: string;
  suggestions: Suggestion[];
  people: Person[] | null;
  now: string;
  onOpenManual: (sectionId: string) => void;
}) {
  const log = usePreventiveLog();
  const name = (id: string | null) => people?.find((p) => p.id === id)?.name ?? id;

  return (
    <ul className="space-y-2">
      {suggestions.map((s) => {
        const r = recordOf(log, machineId, s.id);
        const done = !!r.done_at;
        const options = (people ?? []).filter((p) => p.on_shift || p.id === r.assignee_id);
        const Icon = s.kind === "plan" ? CalendarClock : Gauge;
        return (
          <li
            key={s.id}
            className={clsx(
              "flex items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
              done ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.03]",
            )}
          >
            <button
              type="button"
              disabled={!r.assignee_id}
              onClick={() => setActionDone(machineId, s.id, done ? null : now)}
              aria-pressed={done}
              aria-label={`Mark "${s.text}" as done`}
              title={r.assignee_id ? (done ? "Mark as not done" : "Mark as done") : "Assign it first"}
              className={clsx(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                done ? "border-emerald-400 bg-emerald-500 text-white" : "border-white/20 hover:border-white/40",
              )}
            >
              {done && <Check className="h-3.5 w-3.5" />}
            </button>

            <div className="min-w-0 flex-1">
              <div className={clsx("text-sm leading-snug", done ? "text-zinc-500 line-through decoration-zinc-600" : "text-zinc-100")}>
                {s.text}
                {s.ref && (
                  <button
                    type="button"
                    onClick={() => onOpenManual(s.ref!)}
                    className="ml-1.5 rounded bg-sky-500/15 px-1 font-mono text-[11px] text-sky-300 no-underline hover:bg-sky-500/25"
                  >
                    {s.ref}
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Icon className="h-3 w-3" />
                {s.reason}
                {done && r.done_at && <span className="text-emerald-400/80">· done {simTime(r.done_at)} by {name(r.assignee_id)}</span>}
              </div>
            </div>

            {!done && (
              <select
                aria-label={`Assign "${s.text}"`}
                value={r.assignee_id ?? ""}
                onChange={(e) => assignAction(machineId, s.id, e.target.value || null, now)}
                className={clsx("field h-8 w-40 shrink-0 px-2 text-xs", !r.assignee_id && "text-zinc-400")}
              >
                <option value="">Assign to…</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {roleLabel(p.role)}
                  </option>
                ))}
              </select>
            )}
          </li>
        );
      })}
    </ul>
  );
}
