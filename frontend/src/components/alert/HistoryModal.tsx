import { useEffect, useState } from "react";
import clsx from "clsx";
import { Wrench } from "lucide-react";
import { api } from "../../api";
import type { MaintenanceRecord } from "../../types";
import { eur } from "../../lib/format";
import { Modal } from "../ui/Modal";
import { Spinner } from "../ui/Spinner";

const TYPE_STYLE: Record<MaintenanceRecord["type"], string> = {
  corrective: "bg-red-500/15 text-red-300",
  preventive: "bg-emerald-500/15 text-emerald-300",
  inspection: "bg-sky-500/15 text-sky-300",
  missed_pm: "bg-amber-400/15 text-amber-300",
};

/** Shows the maintenance record referenced by an evidence item, with the machine's other records below. */
export function HistoryModal({ machineId, recordId, onClose }: { machineId: string; recordId: string; onClose: () => void }) {
  const [records, setRecords] = useState<MaintenanceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .maintenance(machineId)
      .then((r) => alive && setRecords(r))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [machineId]);

  const record = records?.find((r) => r.id === recordId);

  return (
    <Modal
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-sky-400" />
          Maintenance history · {machineId}
        </span>
      }
    >
      {error ? (
        <div className="text-sm text-red-400">Could not load maintenance history: {error}</div>
      ) : !records ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> Loading history…
        </div>
      ) : (
        <div className="space-y-4">
          {record ? (
            <div className="rounded-lg border border-sky-500/40 bg-sky-500/5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-sky-300">{record.id}</span>
                <span className={clsx("rounded px-1.5 py-0.5 text-[11px] font-medium", TYPE_STYLE[record.type])}>{record.type.replace("_", " ")}</span>
                <span className="text-xs text-zinc-400">{record.date}</span>
              </div>
              <div className="mt-2 font-medium text-zinc-100">{record.title}</div>
              <p className="mt-1 text-sm text-zinc-300">{record.description}</p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-400">
                <span>Cost: {eur(record.cost_eur)}</span>
                <span>Downtime: {record.downtime_h} h</span>
                {record.parts.length > 0 && <span>Parts: {record.parts.join(", ")}</span>}
                {record.technician_id && <span>Technician: {record.technician_id}</span>}
              </div>
            </div>
          ) : (
            <div className="text-sm text-amber-300">Record {recordId} was not found in this machine's history.</div>
          )}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">All records, newest first</div>
            <ul className="divide-y divide-white/5 text-sm">
              {records.map((r) => (
                <li key={r.id} className={clsx("flex gap-3 py-1.5", r.id === recordId ? "text-zinc-100" : "text-zinc-400")}>
                  <span className="w-24 shrink-0 tabular-nums">{r.date}</span>
                  <span className="w-28 shrink-0 font-mono text-xs leading-5">{r.id}</span>
                  <span className="min-w-0">{r.title}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
