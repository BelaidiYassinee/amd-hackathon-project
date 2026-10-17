import { useState } from "react";
import clsx from "clsx";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Clock, ListTodo, RotateCcw, Sparkles, Users } from "lucide-react";
import { api } from "../../api";
import type { Alert, Person, PlantState } from "../../types";
import { usePoll } from "../../hooks/usePoll";
import { roleLabel, simTime } from "../../lib/format";
import { setActionDone, usePreventiveLog } from "../../lib/preventiveLog";
import { setOrderPlaced, useDecisionLog } from "../../lib/decisionLog";
import { notify } from "../../lib/notify";
import { useStepLog } from "../../lib/stepLog";
import { STATUS_ORDER, isOpen, teamTasks, type TaskSource, type TaskStatus, type TeamTask } from "../../lib/team";
import { TONE, type Tone } from "../../lib/progress";
import { Button } from "../ui/Button";
import { Kpi } from "../ui/Kpi";
import { Spinner } from "../ui/Spinner";
import { WorkOrdersView } from "../workorders/WorkOrdersView";

export type TeamMode = "person" | "incident";
const MODES: { id: TeamMode; label: string }[] = [
  { id: "person", label: "By person" },
  { id: "incident", label: "By incident" },
];

type Filter = "all" | "on_shift" | "with_tasks";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "on_shift", label: "On shift" },
  { id: "with_tasks", label: "With tasks" },
];

const SOURCE: Record<TaskSource, { label: string; tone: Tone }> = {
  work_order: { label: "Incident", tone: "sky" },
  acknowledge: { label: "Acknowledge", tone: "violet" },
  preventive: { label: "Preventive", tone: "amber" },
  order: { label: "Purchase", tone: "emerald" },
};

const GROUP: Record<TaskStatus, { label: string; tone: Tone }> = {
  overdue: { label: "Overdue", tone: "red" },
  todo: { label: "To do", tone: "zinc" },
  in_progress: { label: "In progress", tone: "sky" },
  done: { label: "Done", tone: "emerald" },
};

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/**
 * Who does what. "By person": every task of every team member (work orders, alerts to acknowledge, purchases,
 * preventive actions). "By incident": every alert with its owner, progress and verdict (the former Work orders page).
 */
export function TeamView({
  plant,
  alerts,
  mode,
  onMode,
  selectedId,
  onSelect,
  incidentId,
  onSelectIncident,
  onOpenIncident,
}: {
  plant: PlantState | null;
  alerts: Alert[] | null;
  mode: TeamMode;
  onMode: (m: TeamMode) => void;
  selectedId: string | null;
  onSelect: (personId: string) => void;
  incidentId: string | null;
  onSelectIncident: (alertId: string) => void;
  onOpenIncident: (alertId: string) => void;
}) {
  const people = usePoll(api.people, 10000);
  const stepLog = useStepLog();
  const preventiveLog = usePreventiveLog();
  const decisionLog = useDecisionLog();
  const [filter, setFilter] = useState<Filter>("all");

  if (!plant || !alerts || !people.data) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-400">
        <Spinner /> Loading the team…
      </div>
    );
  }

  const now = plant.sim_time;
  const tasks = teamTasks(alerts, stepLog, preventiveLog, decisionLog, now);
  const tasksOf = (id: string) => tasks.filter((t) => t.person_id === id);
  const openCount = (id: string) => tasksOf(id).filter(isOpen).length;

  const members = [...people.data].sort(
    (a, b) => Number(b.on_shift) - Number(a.on_shift) || openCount(b.id) - openCount(a.id) || a.name.localeCompare(b.name),
  );
  const shown = members.filter((p) => (filter === "on_shift" ? p.on_shift : filter === "with_tasks" ? tasksOf(p.id).length > 0 : true));
  const selected = members.find((p) => p.id === selectedId) ?? members.find((p) => openCount(p.id) > 0) ?? members[0];

  const open = tasks.filter(isOpen).length;
  const overdue = tasks.filter((t) => t.status === "overdue").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const onShift = people.data.filter((p) => p.on_shift).length;
  // The backend routes an alert to a person only once the diagnosis is done: until then nobody owns it.
  const diagnosing = alerts.filter((a) => a.state === "diagnosing");

  return (
    <main className="flex min-h-0 flex-1 flex-col px-8 pb-8">
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6">
        <div className="flex items-end justify-between gap-6 pt-2">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-50">Team</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {mode === "person"
                ? "Every task of every team member: incidents, purchases and preventive actions."
                : "Every incident after the alert: who owns it, what is done, and whether it was fixed on time."}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock className="h-3.5 w-3.5" /> Plant time {simTime(now)}
            </span>
            <div role="tablist" aria-label="Team view" className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === m.id}
                  onClick={() => onMode(m.id)}
                  className={clsx(
                    "rounded-full px-3.5 py-1 text-sm font-medium transition-colors",
                    mode === m.id ? "bg-white/10 text-zinc-50" : "text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {diagnosing.map((a) => (
          <div key={a.id} className={clsx("glass flex items-center gap-3 rounded-2xl px-5 py-3 text-sm", TONE.violet.border, TONE.violet.bg)}>
            <Sparkles className={clsx("h-4 w-4 shrink-0", TONE.violet.text)} />
            <span className="text-zinc-200">
              The AI is still diagnosing <span className="font-medium text-zinc-50">{a.machine_name}</span> ({a.trace.length} steps so far). It
              will be routed to a technician when the diagnosis is done.
            </span>
            <Spinner className={clsx("ml-auto shrink-0", TONE.violet.text)} />
          </div>
        ))}

        {mode === "incident" ? (
          <WorkOrdersView plant={plant} alerts={alerts} selectedId={incidentId} onSelect={onSelectIncident} onOpenIncident={onOpenIncident} />
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4">
              <Kpi icon={ListTodo} label="Open tasks" value={open} hint="Not done yet, across the team" tone="sky" />
              <Kpi icon={AlertTriangle} label="Overdue" value={overdue} hint="Past the target, or escalated" tone={overdue ? "red" : "zinc"} />
              <Kpi icon={CheckCircle2} label="Done" value={done} hint="Since the start of this run" tone="emerald" />
              <Kpi icon={Users} label="On shift" value={`${onShift} / ${people.data.length}`} hint="Team members working now" tone="violet" />
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
              {/* Members */}
              <section className="flex min-h-0 flex-col">
                <div className="mb-3 flex items-center gap-1 self-start rounded-full border border-white/10 bg-white/[0.03] p-1">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      className={clsx(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        filter === f.id ? "bg-white/10 text-zinc-50" : "text-zinc-400 hover:text-zinc-200",
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {shown.length === 0 && <li className="px-1 py-6 text-sm text-zinc-500">Nobody here.</li>}
                  {shown.map((p) => (
                    <li key={p.id}>
                      <MemberRow person={p} tasks={tasksOf(p.id)} selected={p.id === selected?.id} onClick={() => onSelect(p.id)} />
                    </li>
                  ))}
                </ul>
              </section>

              {/* Selected member */}
              {selected && (
                <MemberDetail key={selected.id} person={selected} tasks={tasksOf(selected.id)} anyTasks={tasks.length > 0} now={now} onOpenIncident={onOpenIncident} />
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Avatar({ name, onShift }: { name: string; onShift: boolean }) {
  return (
    <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-zinc-200">
      {initials(name)}
      <span
        className={clsx("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-zinc-900", onShift ? "bg-emerald-500" : "bg-zinc-600")}
        aria-label={onShift ? "On shift" : "Off shift"}
      />
    </span>
  );
}

function MemberRow({ person: p, tasks, selected, onClick }: { person: Person; tasks: TeamTask[]; selected: boolean; onClick: () => void }) {
  const open = tasks.filter(isOpen).length;
  const overdue = tasks.filter((t) => t.status === "overdue").length;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "glass flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors",
        selected ? "!border-sky-400/50 !bg-white/[0.07]" : "hover:!border-white/20 hover:!bg-white/[0.06]",
        !p.on_shift && "opacity-70",
      )}
    >
      <Avatar name={p.name} onShift={p.on_shift} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-zinc-100">{p.name}</span>
        <span className="block truncate text-xs text-zinc-500">
          {roleLabel(p.role)} · Shift {p.shift}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs tabular-nums">
        {open > 0 ? <span className="text-zinc-200">{open} open</span> : <span className="text-zinc-600">No open tasks</span>}
        {overdue > 0 && <span className="block text-red-300">{overdue} overdue</span>}
      </span>
    </button>
  );
}

function MemberDetail({
  person: p,
  tasks,
  anyTasks,
  now,
  onOpenIncident,
}: {
  person: Person;
  tasks: TeamTask[];
  anyTasks: boolean;
  now: string;
  onOpenIncident: (alertId: string) => void;
}) {
  return (
    <section className="glass flex min-h-0 animate-fade-in flex-col overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 border-b border-white/5 px-6 py-5">
        <Avatar name={p.name} onShift={p.on_shift} />
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-zinc-50">{p.name}</h2>
          <p className="text-xs text-zinc-500">
            {roleLabel(p.role)} · Shift {p.shift} ·{" "}
            <span className={p.on_shift ? "text-emerald-400" : "text-zinc-500"}>{p.on_shift ? "on shift" : "off shift"}</span>
          </p>
        </div>
        <span className="ml-auto text-xs tabular-nums text-zinc-500">
          {tasks.filter(isOpen).length} open · {tasks.length} total
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {tasks.length === 0 ? (
          <div className="py-10 text-center text-sm text-zinc-500">
            <ClipboardList className="mx-auto mb-2 h-6 w-6 text-zinc-600" />
            No tasks assigned.
            {!anyTasks && (
              <p className="mx-auto mt-1 max-w-sm text-xs">
                Tasks come from incidents (acknowledged on the Work orders flow) and from preventive actions assigned on the Prevent page.
              </p>
            )}
          </div>
        ) : (
          STATUS_ORDER.map((status) => {
            const group = tasks.filter((t) => t.status === status);
            if (group.length === 0) return null;
            return (
              <div key={status}>
                <div className={clsx("eyebrow mb-2", status !== "todo" && TONE[GROUP[status].tone].text)}>
                  {GROUP[status].label} · {group.length}
                </div>
                <ul className="space-y-2">
                  {group.map((t) => (
                    <TaskRow key={t.id} task={t} now={now} onOpenIncident={onOpenIncident} />
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function TaskRow({ task: t, now, onOpenIncident }: { task: TeamTask; now: string; onOpenIncident: (alertId: string) => void }) {
  const src = TONE[SOURCE[t.source].tone];
  const done = t.status === "done";
  return (
    <li className={clsx("rounded-xl border px-4 py-3", done ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-white/10 bg-white/[0.03]")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px]">
            <span className={clsx("rounded-full px-2 py-px font-medium", src.bg, src.text)}>{SOURCE[t.source].label}</span>
            <span className="text-zinc-500">
              {t.machine_name} · <span className="font-mono">{t.machine_id}</span>
            </span>
          </div>
          <div className={clsx("mt-1.5 text-sm leading-snug", done ? "text-zinc-400" : "text-zinc-100")}>{t.title}</div>
          <div className="mt-0.5 text-xs text-zinc-500">{t.detail}</div>
        </div>

        <div className="shrink-0">
          {t.order_key ? (
            done ? (
              <Button variant="ghost" size="sm" onClick={() => setOrderPlaced(t.order_key!, null)} title="Mark as not ordered">
                <RotateCcw className="h-3.5 w-3.5" /> Undo
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => {
                  setOrderPlaced(t.order_key!, now);
                  notify("Order placed", `${t.title.replace("Place the order: ", "")} · ${t.machine_id}`);
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Order placed
              </Button>
            )
          ) : t.action_id ? (
            done ? (
              <Button variant="ghost" size="sm" onClick={() => setActionDone(t.machine_id, t.action_id!, null)} title="Mark as not done">
                <RotateCcw className="h-3.5 w-3.5" /> Undo
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => {
                  setActionDone(t.machine_id, t.action_id!, now);
                  notify("Marked as done", `${t.title} · ${t.machine_id}`);
                }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark done
              </Button>
            )
          ) : (
            t.alert_id && (
              <Button size="sm" onClick={() => onOpenIncident(t.alert_id!)}>
                Open incident <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )
          )}
        </div>
      </div>

      {t.progress && t.progress.total > 0 && (
        <div className="mt-2.5 flex items-center gap-3">
          <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              className={clsx("block h-full rounded-full transition-[width] duration-500", TONE[GROUP[t.status].tone === "zinc" ? "sky" : GROUP[t.status].tone].bar)}
              style={{ width: `${(t.progress.done / t.progress.total) * 100}%` }}
            />
          </span>
          <span className="text-[11px] tabular-nums text-zinc-500">
            {t.progress.done}/{t.progress.total} steps
          </span>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] tabular-nums text-zinc-500">
        {t.assigned_at && <span>Assigned {simTime(t.assigned_at)}</span>}
        {t.due_at && !done && (
          <span className={t.status === "overdue" ? "text-red-300" : undefined}>
            {t.status === "overdue" ? "Was due" : "Due"} {simTime(t.due_at)}
          </span>
        )}
        {t.done_at && <span className="text-emerald-400/80">Done {simTime(t.done_at)}</span>}
      </div>
    </li>
  );
}
