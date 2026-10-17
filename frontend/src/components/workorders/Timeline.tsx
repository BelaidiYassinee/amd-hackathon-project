import clsx from "clsx";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Alert, Person } from "../../types";
import { FAULT_LABELS, simTime } from "../../lib/format";
import { TONE, dueAt, duration, hoursBetween, ownerName, type Tone } from "../../lib/progress";

type Mark = "done" | "pending" | "missed";

interface Entry {
  key: string;
  at: string | null;
  title: ReactNode;
  detail?: ReactNode;
  mark: Mark;
  tone: Tone;
  children?: ReactNode;
}

const personName = (people: Person[] | null, id: string | undefined) => people?.find((p) => p.id === id)?.name ?? id ?? "someone";

/** Everything that happened to one incident, in order, plus what is still owed (hollow, pulsing). */
function entries(a: Alert, people: Person[] | null, now: string, ticks: (string | null)[]): Entry[] {
  const out: Entry[] = [];
  const primary = a.notifications.filter((n) => n.reason !== "escalation");
  const escalation = a.notifications.find((n) => n.reason === "escalation");
  const firstNotice = primary[0]?.sent_at ?? null;
  const wo = a.work_order;
  const owner = ownerName(a, people);
  const due = dueAt(a);

  out.push({
    key: "detected",
    at: a.event.detected_at,
    title: "AI detected an anomaly",
    detail: `Signals drifting since ${simTime(a.event.first_deviation_at)}${a.lead_time_h ? ` · ${duration(a.lead_time_h)} before the fixed alarm` : ""}`,
    mark: "done",
    tone: "sky",
  });

  if (a.diagnosis) {
    out.push({
      key: "diagnosed",
      at: firstNotice,
      title: `Diagnosed: ${a.diagnosis.fault_label}`,
      detail: `${Math.round(a.diagnosis.confidence * 100)}% confidence · ${a.diagnosis.severity} severity`,
      mark: "done",
      tone: "violet",
    });
  } else {
    out.push({ key: "diagnosed", at: null, title: "AI agent diagnosing…", mark: "pending", tone: "violet" });
  }

  if (primary.length > 0) {
    const cc = primary.length - 1;
    out.push({
      key: "notified",
      at: firstNotice,
      title: `Notified ${primary[0].person_name}${cc > 0 ? ` (+${cc} in copy)` : ""}`,
      detail: primary.map((n) => `${n.person_name} · ${n.channel === "telegram" ? "Telegram" : "in-app"}${n.delivered ? "" : " · not delivered"}`).join("  ·  "),
      mark: "done",
      tone: "sky",
    });
  }

  if (escalation) {
    out.push({
      key: "escalated",
      at: escalation.sent_at,
      title: `Escalated to ${escalation.person_name}`,
      detail: `Nobody acknowledged within ${firstNotice ? duration(hoursBetween(firstNotice, escalation.sent_at)) : "the limit"}`,
      mark: "done",
      tone: "red",
    });
  }

  if (a.ack) {
    const who = personName(people, a.ack.person_id);
    const response = firstNotice ? ` · responded after ${duration(hoursBetween(firstNotice, a.ack.at))}` : "";
    out.push(
      a.ack.decision === "accepted"
        ? { key: "ack", at: a.ack.at, title: `Acknowledged by ${who}`, detail: `Work order ${wo?.id ?? ""} created${response}`, mark: "done", tone: "sky" }
        : { key: "ack", at: a.ack.at, title: `Rejected as false alarm by ${who}`, detail: a.ack.note ? `“${a.ack.note}”` : undefined, mark: "done", tone: "zinc" },
    );
  } else if (a.state === "open" || a.state === "escalated") {
    out.push({
      key: "ack",
      at: null,
      title: `Waiting for ${a.assignee?.name ?? "a technician"} to acknowledge`,
      detail: firstNotice ? `Notified ${duration(hoursBetween(firstNotice, now))} ago` : undefined,
      mark: "pending",
      tone: a.state === "escalated" ? "red" : "amber",
    });
  }

  if (wo) {
    const resolved = a.state === "resolved";
    const done = ticks.filter(Boolean).length;
    out.push({
      key: "steps",
      at: null,
      title: `Repair steps · ${done} of ${wo.steps.length} done`,
      mark: done === wo.steps.length ? "done" : resolved ? "missed" : "pending",
      tone: done === wo.steps.length ? "emerald" : resolved ? "amber" : "sky",
      children: (
        <ol className="mt-2.5 space-y-1.5">
          {wo.steps.map((s, i) => {
            const at = ticks[i];
            return (
              <li key={i} className="flex items-start gap-2.5 text-xs">
                <span
                  className={clsx(
                    "mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    at ? "border-emerald-400 bg-emerald-500 text-white" : resolved ? "border-amber-400/60 text-amber-300" : "border-white/20",
                  )}
                >
                  {at ? <Check className="h-3 w-3" /> : resolved ? <X className="h-3 w-3" /> : null}
                </span>
                <span className={clsx("min-w-0 flex-1 leading-snug", at ? "text-zinc-400" : "text-zinc-300")}>{s}</span>
                <span className={clsx("shrink-0 tabular-nums", at ? "text-emerald-400/80" : "text-zinc-600")}>
                  {at ? simTime(at) : resolved ? "not ticked" : "to do"}
                </span>
              </li>
            );
          })}
        </ol>
      ),
    });
  }

  if (a.resolution) {
    const late = due ? hoursBetween(due, a.resolution.at) : 0;
    out.push({
      key: "resolved",
      at: a.resolution.at,
      title: `Marked as fixed by ${owner}`,
      detail: (
        <>
          {a.resolution.diagnosis_correct ? "AI diagnosis confirmed" : `Actual fault: ${FAULT_LABELS[a.resolution.actual_fault]} (AI was wrong)`}
          {due && ` · ${late > 0 ? `${duration(late)} after the target` : `${duration(-late)} before the target`}`}
          {a.resolution.note && <span className="mt-1 block text-zinc-400">“{a.resolution.note}”</span>}
        </>
      ),
      mark: "done",
      tone: late > 0 ? "amber" : "emerald",
    });
  } else if (a.state === "acknowledged" && wo) {
    const overdue = due ? hoursBetween(due, now) : 0;
    out.push({
      key: "resolved",
      at: null,
      title: `Waiting for ${owner} to mark it fixed`,
      detail: due && (overdue > 0 ? `Overdue by ${duration(overdue)} (target ${simTime(due)})` : `Target ${simTime(due)} · ${duration(-overdue)} left`),
      mark: "pending",
      tone: overdue > 0 ? "red" : "sky",
    });
  }
  return out;
}

export function Timeline({ alert, people, now, ticks }: { alert: Alert; people: Person[] | null; now: string; ticks: (string | null)[] }) {
  const list = entries(alert, people, now, ticks);
  return (
    <ol className="relative">
      {list.map((e, i) => {
        const t = TONE[e.tone];
        return (
          <li key={e.key} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Line to the next entry. */}
            {i < list.length - 1 && <span aria-hidden className="absolute left-[7px] top-5 h-[calc(100%-12px)] w-px bg-white/10" />}
            <span className="relative mt-1 flex h-[15px] w-[15px] shrink-0 items-center justify-center">
              {e.mark === "pending" && <span className={clsx("absolute inset-0 animate-ping-slow rounded-full opacity-60 motion-reduce:hidden", t.dot)} />}
              <span
                className={clsx(
                  "relative h-[15px] w-[15px] rounded-full border-2",
                  e.mark === "done" ? clsx(t.dot, "border-transparent") : clsx("bg-zinc-950", e.mark === "missed" ? "border-amber-400" : t.edge),
                )}
              />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={clsx("text-sm font-medium", e.mark === "done" ? "text-zinc-100" : t.text)}>{e.title}</span>
                {e.at && <span className="shrink-0 text-xs tabular-nums text-zinc-500">{simTime(e.at)}</span>}
              </div>
              {e.detail && <div className="mt-0.5 text-xs leading-relaxed text-zinc-500">{e.detail}</div>}
              {e.children}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
