import { ShieldAlert } from "lucide-react";
import type { Alert, Person } from "../../types";
import { AlertActions } from "../alert/AlertActions";
import { AssigneeCard } from "../alert/AssigneeCard";

/** Step 3: who was notified, and the technician takes ownership (creates the work order). */
export function AssignStep({ alert, people, onChanged }: { alert: Alert; people: Person[] | null; onChanged: () => void }) {
  const escalation = alert.notifications.find((n) => n.reason === "escalation");
  const escalatedAfterH = escalation ? (Date.parse(escalation.sent_at) - Date.parse(alert.created_at)) / 3_600_000 : 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      {alert.state === "escalated" && escalation && (
        <div className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Nobody acknowledged within {Math.round(escalatedAfterH * 10) / 10} h, so it was escalated to {escalation.person_name}.
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-8">
        <div className="min-h-0 overflow-y-auto pr-1">
          <div className="mb-3 text-sm font-medium text-zinc-200">Notified</div>
          <AssigneeCard alert={alert} />
        </div>
        <div className="min-h-0 overflow-y-auto">
          <div className="mb-3 text-sm font-medium text-zinc-200">Take ownership</div>
          <AlertActions mode="assign" alert={alert} people={people} onChanged={onChanged} />
          {alert.state === "acknowledged" || alert.state === "resolved" ? (
            <p className="mt-3 text-xs text-zinc-500">Work order created. Next: the fix steps.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
