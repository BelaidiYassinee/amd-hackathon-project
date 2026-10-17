import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Clock, ShieldCheck, Timer, UserRound } from "lucide-react";
import { api } from "../../api";
import type { Alert, Person, PlantState } from "../../types";
import { usePoll } from "../../hooks/usePoll";
import { roleLabel, simTime } from "../../lib/format";
import { STAGE, TONE, dueAt, duration, hoursBetween, isActive, ownerName, stage, stepsDone, verdict, type Stage } from "../../lib/progress";
import { ticksOf, useStepLog } from "../../lib/stepLog";
import { Button } from "../ui/Button";
import { Kpi } from "../ui/Kpi";
import { Spinner } from "../ui/Spinner";
import { Timeline } from "./Timeline";

type Filter = "all" | "active" | "closed";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "closed", label: "Closed" },
];
const NEEDS_ACTION: Stage[] = ["waiting", "escalated", "overdue"];

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/**
 * The Team page "By incident" view: every alert with its owner, its progress through the work order,
 * and a plain verdict on whether the job was done (and on time). The page header lives in TeamView.
 */
export function WorkOrdersView({
  plant,
  alerts,
  selectedId,
  onSelect,
  onOpenIncident,
}: {
  plant: PlantState | null;
  alerts: Alert[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenIncident: (id: string) => void;
}) {
  const people = usePoll(api.people, 10000);
  const [filter, setFilter] = useState<Filter>("all");
  const log = useStepLog();

  if (!plant || !alerts) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-400">
        <Spinner /> Loading work orders…
      </div>
    );
  }

  const now = plant.sim_time;
  if (alerts.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center pb-10">
        <div className="glass max-w-md rounded-2xl p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-300">
            <ClipboardList className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold text-zinc-100">No work orders yet</h1>
          <p className="mt-1.5 text-sm text-zinc-400">
            When the AI raises an alert, it shows up here: who was notified, who took it, which steps are done, and whether it was fixed on time.
          </p>
        </div>
      </div>
    );
  }

  const stages = new Map(alerts.map((a) => [a.id, stage(a, now)]));
  const shown = alerts.filter((a) => (filter === "all" ? true : filter === "active" ? isActive(a) : !isActive(a)));
  const selected = alerts.find((a) => a.id === selectedId) ?? shown[0] ?? alerts[0];

  const needAction = alerts.filter((a) => NEEDS_ACTION.includes(stages.get(a.id)!)).length;
  const inProgress = alerts.filter((a) => stages.get(a.id) === "in_progress").length;
  const closed = alerts.filter((a) => a.state === "resolved");
  const onTime = closed.filter((a) => stages.get(a.id) === "done").length;
  const confirmed = closed.filter((a) => a.resolution?.diagnosis_correct).length;

  return (
    <>

        <div className="grid grid-cols-4 gap-4">
          <Kpi icon={AlertTriangle} label="Need action" value={needAction} hint="Not acknowledged, escalated or overdue" tone={needAction > 0 ? "red" : "zinc"} />
          <Kpi icon={Timer} label="In progress" value={inProgress} hint="Acknowledged and on schedule" tone="sky" />
          <Kpi
            icon={CheckCircle2}
            label="Completed"
            value={closed.length}
            hint={closed.length ? `${onTime} of ${closed.length} on time` : "None closed yet"}
            tone="emerald"
          />
          <Kpi
            icon={ShieldCheck}
            label="AI diagnosis confirmed"
            value={closed.length ? `${Math.round((confirmed / closed.length) * 100)}%` : "–"}
            hint={closed.length ? `${confirmed} of ${closed.length} by the technician` : "Confirmed when a job is closed"}
            tone="violet"
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6">
          {/* List */}
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
            <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
              {shown.length === 0 && <li className="px-1 py-6 text-sm text-zinc-500">Nothing here.</li>}
              {shown.map((a) => (
                <li key={a.id}>
                  <Row alert={a} stage={stages.get(a.id)!} now={now} people={people.data} ticks={ticksOf(log, a)} selected={a.id === selected.id} onClick={() => onSelect(a.id)} />
                </li>
              ))}
            </ul>
          </section>

          {/* Detail */}
          <Detail
            alert={selected}
            stage={stages.get(selected.id)!}
            now={now}
            people={people.data}
            ticks={ticksOf(log, selected)}
            onOpenIncident={() => onOpenIncident(selected.id)}
          />
        </div>
    </>
  );
}

function StagePill({ stage: s }: { stage: Stage }) {
  const t = TONE[STAGE[s].tone];
  return (
    <span className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", t.bg, t.text)}>
      <span className={clsx("h-1.5 w-1.5 rounded-full", t.dot)} />
      {STAGE[s].label}
    </span>
  );
}

function Progress({ done, total, tone }: { done: number; total: number; tone: keyof typeof TONE }) {
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-white/10">
      <span className={clsx("block h-full rounded-full transition-[width] duration-500", TONE[tone].bar)} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
    </span>
  );
}

function dueText(a: Alert, now: string): string | null {
  const due = dueAt(a);
  if (a.state === "resolved" && a.resolution) return `Closed ${simTime(a.resolution.at)}`;
  if (a.state === "rejected") return null;
  if (!due) return a.notifications[0] ? `Notified ${duration(hoursBetween(a.notifications[0].sent_at, now))} ago` : null;
  const left = hoursBetween(now, due);
  return left >= 0 ? `Due in ${duration(left)}` : `Overdue ${duration(-left)}`;
}

function Row({
  alert: a,
  stage: s,
  now,
  people,
  ticks,
  selected,
  onClick,
}: {
  alert: Alert;
  stage: Stage;
  now: string;
  people: Person[] | null;
  ticks: (string | null)[];
  selected: boolean;
  onClick: () => void;
}) {
  const { done, total } = stepsDone(a, ticks);
  const owner = ownerName(a, people);
  const due = dueText(a, now);
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "glass w-full rounded-2xl p-4 text-left transition-colors",
        selected ? "!border-sky-400/50 !bg-white/[0.07]" : "hover:!border-white/20 hover:!bg-white/[0.06]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-medium text-zinc-100">{a.machine_name}</span>
        <StagePill stage={s} />
      </div>
      <div className="mt-1 truncate text-xs text-zinc-500">
        {a.diagnosis?.fault_label ?? "Diagnosis pending"} · <span className="font-mono">{a.work_order?.id ?? a.id}</span>
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-semibold text-zinc-300">{initials(owner)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{owner}</span>
        {due && <span className={clsx("shrink-0 text-xs tabular-nums", s === "overdue" ? "text-red-300" : "text-zinc-500")}>{due}</span>}
      </div>
      {a.work_order && (
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <Progress done={done} total={total} tone={STAGE[s].tone} />
          </div>
          <span className="text-[11px] tabular-nums text-zinc-500">
            {done}/{total} steps
          </span>
        </div>
      )}
    </button>
  );
}

function Detail({
  alert: a,
  stage: s,
  now,
  people,
  ticks,
  onOpenIncident,
}: {
  alert: Alert;
  stage: Stage;
  now: string;
  people: Person[] | null;
  ticks: (string | null)[];
  onOpenIncident: () => void;
}) {
  const t = TONE[STAGE[s].tone];
  const wo = a.work_order;
  const due = dueAt(a);
  const { done, total } = stepsDone(a, ticks);
  const ownerId = wo?.assignee_id ?? a.ack?.person_id ?? a.assignee?.id;
  const owner = people?.find((p) => p.id === ownerId) ?? a.assignee;
  const firstNotice = a.notifications[0]?.sent_at;
  const response = a.ack && firstNotice ? duration(hoursBetween(firstNotice, a.ack.at)) : "–";
  const Icon = s === "done" ? CheckCircle2 : NEEDS_ACTION.includes(s) ? AlertTriangle : s === "done_late" ? Clock : Timer;

  return (
    <section key={a.id} className="glass flex min-h-0 animate-fade-in flex-col overflow-hidden rounded-2xl">
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-2">
            <span className="font-mono normal-case tracking-normal">{wo?.id ?? a.id}</span>
            {wo && (
              <span className={clsx("rounded px-1.5 py-px text-[10px] font-bold tracking-normal", wo.priority === "P1" ? "bg-red-500/20 text-red-300" : "bg-amber-400/15 text-amber-300")}>
                {wo.priority}
              </span>
            )}
          </div>
          <h2 className="mt-1 truncate text-lg font-semibold text-zinc-50">{wo?.title ?? `${a.diagnosis?.fault_label ?? "Anomaly"} - ${a.machine_name}`}</h2>
        </div>
        <Button onClick={onOpenIncident} title="Open the incident flow">
          Open incident <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* The answer first: was it done? */}
      <div className={clsx("mx-6 mt-4 flex items-start gap-3 rounded-xl border px-4 py-3", t.border, t.bg)}>
        <Icon className={clsx("mt-0.5 h-5 w-5 shrink-0", t.text)} />
        <div>
          <div className={clsx("text-sm font-semibold", t.text)}>{STAGE[s].label}</div>
          <div className="mt-0.5 text-sm text-zinc-300">{verdict(a, now, people, ticks)}</div>
        </div>
      </div>

      <dl className="mx-6 mt-4 grid grid-cols-4 gap-3">
        <Fact label="Owner">
          <span className="flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5 text-zinc-500" />
            <span className="truncate">{owner?.name ?? "Unassigned"}</span>
          </span>
          {owner && <span className="block truncate text-[11px] font-normal text-zinc-500">{roleLabel(owner.role)}</span>}
        </Fact>
        <Fact label="Response time">{response}</Fact>
        <Fact label="Steps done">
          {wo ? (
            <>
              <span className="tabular-nums">
                {done} / {total}
              </span>
              <span className="mt-1.5 block">
                <Progress done={done} total={total} tone={STAGE[s].tone} />
              </span>
            </>
          ) : (
            "–"
          )}
        </Fact>
        <Fact label="Target">{due ? simTime(due) : "–"}</Fact>
      </dl>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-white/5 px-6 py-5">
        <div className="eyebrow mb-4">Timeline</div>
        <Timeline alert={a} people={people} now={now} ticks={ticks} />
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
      <dt className="text-[11px] text-zinc-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-zinc-100">{children}</dd>
    </div>
  );
}
