import { useState } from "react";
import clsx from "clsx";
import { Bell, Send, UserRound } from "lucide-react";
import type { Alert, Notification } from "../../types";
import { roleLabel, simClock } from "../../lib/format";
import { Pill } from "../ui/Pill";

const REASON_STYLE: Record<Notification["reason"], string> = {
  primary: "bg-sky-500/15 text-sky-300",
  cc: "bg-slate-800 text-slate-300",
  escalation: "bg-red-500/15 text-red-300",
};

export function AssigneeCard({ alert }: { alert: Alert }) {
  const a = alert.assignee;
  return (
    <div className="space-y-3">
      {a ? (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600/20 text-sky-300">
            <UserRound className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-slate-300">
              Assigned to <span className="font-semibold text-slate-50">{a.name}</span>
            </div>
            <div className="text-xs text-slate-400">
              {roleLabel(a.role)} · Shift {a.shift} ·{" "}
              <span className={a.on_shift ? "text-emerald-400" : "text-slate-500"}>{a.on_shift ? "on shift" : "off shift"}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500">Not assigned yet.</div>
      )}

      {alert.notifications.length > 0 && (
        <ul className="space-y-1.5">
          {alert.notifications.map((n, i) => (
            <NotificationRow key={`${n.person_id}-${n.reason}-${i}`} n={n} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({ n }: { n: Notification }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = n.channel === "telegram" ? Send : Bell;
  return (
    <li className="rounded-lg border border-slate-800 bg-slate-800/40 px-2.5 py-2 text-xs">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label={n.channel === "telegram" ? "Telegram" : "In-app"} />
        <span className="font-medium text-slate-200">{n.person_name}</span>
        <Pill className={clsx("!py-0 !text-[10px]", REASON_STYLE[n.reason])}>{n.reason}</Pill>
        {!n.delivered && <span className="text-red-400">not delivered</span>}
        <span className="ml-auto tabular-nums text-slate-500">{simClock(n.sent_at)}</span>
      </div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={clsx("mt-1 block w-full text-left leading-snug text-slate-400 hover:text-slate-300", !expanded && "line-clamp-2")}
        title={expanded ? "Collapse" : "Show full message"}
      >
        {n.message}
      </button>
    </li>
  );
}
