import { useState } from "react";
import clsx from "clsx";
import { ArrowRight, CalendarClock, CheckCircle2, Gauge, UserCheck } from "lucide-react";
import type { MachineSummary, Person } from "../../types";
import { roleLabel, simTime } from "../../lib/format";
import type { Suggestion } from "../../lib/preventive";
import { assignAction, recordOf, usePreventiveLog } from "../../lib/preventiveLog";
import { Button } from "../ui/Button";

/**
 * Suggested preventive actions for one machine. Pick a person, then press Assign: the task lands on the Team page.
 * Choosing in the list alone assigns nothing.
 */
export function SuggestedActions({
  machine,
  suggestions,
  people,
  now,
  onOpenManual,
  onViewInTeam,
}: {
  machine: MachineSummary;
  suggestions: Suggestion[];
  people: Person[] | null;
  now: string;
  onOpenManual: (sectionId: string) => void;
  /** Open the Team page on this person. */
  onViewInTeam: (personId: string) => void;
}) {
  const log = usePreventiveLog();
  return (
    <ul className="space-y-2">
      {suggestions.map((s) => {
        const r = recordOf(log, machine.id, s.id);
        return (
          <ActionRow
            key={s.id}
            machine={machine}
            suggestion={s}
            assigneeId={r?.assignee_id ?? null}
            assignedAt={r?.assigned_at ?? null}
            doneAt={r?.done_at ?? null}
            people={people}
            now={now}
            onOpenManual={onOpenManual}
            onViewInTeam={onViewInTeam}
          />
        );
      })}
    </ul>
  );
}

function ActionRow({
  machine,
  suggestion: s,
  assigneeId,
  assignedAt,
  doneAt,
  people,
  now,
  onOpenManual,
  onViewInTeam,
}: {
  machine: MachineSummary;
  suggestion: Suggestion;
  assigneeId: string | null;
  assignedAt: string | null;
  doneAt: string | null;
  people: Person[] | null;
  now: string;
  onOpenManual: (sectionId: string) => void;
  onViewInTeam: (personId: string) => void;
}) {
  // The picker is local until Assign is pressed.
  const [choice, setChoice] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const name = people?.find((p) => p.id === assigneeId)?.name ?? assigneeId;
  const options = (people ?? []).filter((p) => p.on_shift || p.id === assigneeId);
  const Icon = s.kind === "plan" ? CalendarClock : Gauge;
  const picking = !assigneeId || reassigning;

  function assign() {
    if (!choice) return;
    assignAction(machine, s, choice, now);
    setChoice("");
    setReassigning(false);
  }

  return (
    <li
      className={clsx(
        "rounded-xl border px-3.5 py-3",
        doneAt ? "border-emerald-500/25 bg-emerald-500/[0.06]" : assigneeId ? "border-sky-500/25 bg-sky-500/[0.05]" : "border-white/10 bg-white/[0.03]",
      )}
    >
      <div className="text-sm leading-snug text-zinc-100">
        {s.text}
        {s.ref && (
          <button
            type="button"
            onClick={() => onOpenManual(s.ref!)}
            className="ml-1.5 rounded bg-sky-500/15 px-1 font-mono text-[11px] text-sky-300 hover:bg-sky-500/25"
          >
            {s.ref}
          </button>
        )}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
        <Icon className="h-3 w-3" />
        {s.reason}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        {picking ? (
          <>
            <select
              aria-label={`Who should do "${s.text}"`}
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className={clsx("field h-8 min-w-0 flex-1 px-2 text-xs", !choice && "text-zinc-400")}
            >
              <option value="">Choose a person…</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {roleLabel(p.role)}
                </option>
              ))}
            </select>
            <Button variant="primary" size="sm" disabled={!choice} onClick={assign}>
              <UserCheck className="h-3.5 w-3.5" /> Assign
            </Button>
            {reassigning && (
              <Button variant="ghost" size="sm" onClick={() => setReassigning(false)}>
                Cancel
              </Button>
            )}
          </>
        ) : doneAt ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Done by <span className="font-medium">{name}</span> · {simTime(doneAt)}
            </span>
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
              Assigned to <span className="font-semibold text-zinc-50">{name}</span>
              {assignedAt && <span className="text-zinc-500"> · {simTime(assignedAt)}</span>}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setReassigning(true)}>
              Reassign
            </Button>
          </>
        )}
        {assigneeId && !reassigning && (
          <button type="button" onClick={() => onViewInTeam(assigneeId)} className="flex shrink-0 items-center gap-1 text-xs text-sky-300 hover:text-sky-200">
            View in Team <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </li>
  );
}
