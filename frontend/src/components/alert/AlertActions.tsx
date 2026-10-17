import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, XCircle } from "lucide-react";
import { api } from "../../api";
import { notify } from "../../lib/notify";
import type { Alert, DiagnosedFault, Person } from "../../types";
import { FAULT_LABELS, roleLabel } from "../../lib/format";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Pill } from "../ui/Pill";

/**
 * The actions allowed in the alert's current state.
 * mode "assign": acting-as + acknowledge/reject (+ the work order once created).
 * mode "resolve": mark resolved + the outcome.
 */
export function AlertActions({
  alert,
  people,
  onChanged,
  mode,
}: {
  alert: Alert;
  people: Person[] | null;
  onChanged: () => void;
  mode: "assign" | "resolve";
}) {
  const [actingAs, setActingAs] = useState(alert.assignee?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolveOpen, setResolveOpen] = useState(false);

  useEffect(() => setActingAs(alert.assignee?.id ?? ""), [alert.id, alert.assignee?.id]);

  const onShift = (people ?? []).filter((p) => p.on_shift || p.id === alert.assignee?.id);
  const personId = actingAs || onShift[0]?.id || "";

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canAck = alert.state === "open" || alert.state === "escalated";

  return (
    <div className="space-y-3">
      {mode === "assign" && canAck && (
        <>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            Acting as
            <select
              value={personId}
              onChange={(e) => setActingAs(e.target.value)}
              className="field h-8 min-w-0 flex-1 px-2 text-xs"
            >
              {onShift.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {roleLabel(p.role)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-2">
            <Button variant="primary" disabled={busy || !personId} onClick={() =>
                run(async () => {
                  await api.ack(alert.id, { person_id: personId, decision: "accepted" });
                  notify(`Assigned to ${onShift.find((p) => p.id === personId)?.name ?? personId}`, `Work order created · ${alert.machine_name}`);
                })
              }
            >
              <CheckCircle2 className="h-4 w-4" /> Acknowledge &amp; create work order
            </Button>
            <Button variant="ghost" size="sm" disabled={busy || !personId} onClick={() => run(() => api.ack(alert.id, { person_id: personId, decision: "rejected" }))}>
              <XCircle className="h-3.5 w-3.5" /> Reject (false alarm)
            </Button>
          </div>
        </>
      )}

      {mode === "assign" && alert.work_order && <WorkOrderCard alert={alert} people={people} />}

      {mode === "resolve" && alert.state === "acknowledged" && (
        <Button variant="primary" className="w-full" disabled={busy} onClick={() => setResolveOpen(true)}>
          <CheckCircle2 className="h-4 w-4" /> Mark as fixed…
        </Button>
      )}

      {mode === "resolve" && alert.state === "resolved" && alert.resolution && (
        <div
          className={
            alert.resolution.diagnosis_correct
              ? "rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"
              : "rounded-lg border border-amber-500/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-300"
          }
        >
          {alert.resolution.diagnosis_correct
            ? "Resolved · diagnosis confirmed ✓"
            : `Resolved · ✗ actual fault: ${FAULT_LABELS[alert.resolution.actual_fault]}`}
          {alert.resolution.note && <div className="mt-1 text-xs text-zinc-400">{alert.resolution.note}</div>}
        </div>
      )}

      {mode === "assign" && alert.state === "rejected" && (
        <div className="rounded-lg bg-white/[0.05] px-3 py-2 text-sm text-zinc-400">
          Rejected as false alarm
          {alert.ack?.note && <div className="mt-1 text-xs text-zinc-500">“{alert.ack.note}”</div>}
        </div>
      )}

      {error && <div className="text-xs text-red-400">{error}</div>}

      {resolveOpen && (
        <ResolveDialog
          alert={alert}
          busy={busy}
          onClose={() => setResolveOpen(false)}
          onResolve={(actual_fault, note) =>
            run(async () => {
              await api.resolve(alert.id, { actual_fault, note: note || null });
              notify("Marked as fixed", `${alert.machine_name} · incident closed`);
              setResolveOpen(false);
            })
          }
        />
      )}
    </div>
  );
}

function WorkOrderCard({ alert, people }: { alert: Alert; people: Person[] | null }) {
  const wo = alert.work_order!;
  const assignee = people?.find((p) => p.id === wo.assignee_id)?.name ?? wo.assignee_id;
  return (
    <div className="rounded-lg border border-sky-600/40 bg-sky-500/5 p-3 text-sm">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-sky-400" />
        <span className="font-mono text-sky-300">{wo.id}</span>
        <Pill className={wo.priority === "P1" ? "bg-red-500/20 text-red-300" : "bg-amber-400/15 text-amber-300"}>{wo.priority}</Pill>
        <Pill className="ml-auto bg-white/[0.07] text-zinc-300">{wo.status}</Pill>
      </div>
      <div className="mt-1.5 text-zinc-200">{wo.title}</div>
      <div className="mt-1 text-xs text-zinc-400">
        Assignee: {assignee} · {wo.steps.length} steps · {wo.parts.length} part line{wo.parts.length === 1 ? "" : "s"}
      </div>
      {wo.parts.length > 0 && <div className="mt-1 font-mono text-[11px] text-zinc-500">{wo.parts.map((p) => `${p.qty}× ${p.part_no}`).join(" · ")}</div>}
    </div>
  );
}

const FAULTS: DiagnosedFault[] = ["bearing_wear", "cavitation", "misalignment", "motor_overheat", "other"];

function ResolveDialog({
  alert,
  busy,
  onClose,
  onResolve,
}: {
  alert: Alert;
  busy: boolean;
  onClose: () => void;
  onResolve: (fault: DiagnosedFault, note: string) => void;
}) {
  const [fault, setFault] = useState<DiagnosedFault>(alert.diagnosis?.fault ?? "other");
  const [note, setNote] = useState("");
  return (
    <Modal title={`Resolve ${alert.id} · ${alert.machine_name}`} onClose={onClose} className="max-w-md">
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-zinc-400">Actual fault found</span>
          <select
            value={fault}
            onChange={(e) => setFault(e.target.value as DiagnosedFault)}
            className="field mt-1 h-9 w-full px-2"
          >
            {FAULTS.map((f) => (
              <option key={f} value={f}>
                {FAULT_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-zinc-400">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="field mt-1 w-full p-2"
            placeholder="What was found and done"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => onResolve(fault, note)}>
            Resolve
          </Button>
        </div>
      </div>
    </Modal>
  );
}
