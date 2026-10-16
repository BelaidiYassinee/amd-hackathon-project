import { useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";
import { api } from "../../api";
import type { Alert, PlantState } from "../../types";
import { FAULT_LABELS } from "../../lib/format";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { MachineChart } from "../chart/MachineChart";
import { MachineTile } from "./MachineTile";

/** Plant overview: one status line, four machines, the live signals of the selected one. */
export function HomeView({
  plant,
  alerts,
  selectedMachineId,
  onSelectMachine,
  onOpenIncident,
  onPlantChanged,
}: {
  plant: PlantState | null;
  alerts: Alert[] | null;
  selectedMachineId: string;
  onSelectMachine: (id: string) => void;
  onOpenIncident: (alertId: string) => void;
  onPlantChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  if (!plant) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-400">
        <Spinner /> Connecting to the plant…
      </div>
    );
  }

  const needAttention = plant.machines.filter((m) => m.active_alert_id);
  const injected = plant.machines.find((m) => m.injected_fault);
  const machine = plant.machines.find((m) => m.id === selectedMachineId) ?? plant.machines[0];
  const past = (alerts ?? []).filter((a) => !plant.machines.some((m) => m.active_alert_id === a.id));

  async function simulate() {
    setBusy(true);
    try {
      await api.inject({ machine_id: "P-101", fault: "bearing_wear" });
      onSelectMachine("P-101");
      onPlantChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-5 px-6 pb-6">
      <div className="flex flex-wrap items-center gap-4 pt-2">
        {needAttention.length === 0 ? (
          <div className="flex items-center gap-2.5 text-lg text-zinc-100">
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            All {plant.machines.length} machines are running normally
          </div>
        ) : (
          <div className="flex items-center gap-2.5 text-lg text-zinc-100">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            {needAttention.length === 1 ? `${needAttention[0].name} needs attention` : `${needAttention.length} machines need attention`}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {injected && !injected.active_alert_id ? (
            <span className="flex items-center gap-2 text-sm text-zinc-400">
              <Spinner className="text-zinc-500" />
              Simulating {injected.injected_fault && FAULT_LABELS[injected.injected_fault].toLowerCase()} on {injected.id}. The AI is watching…
            </span>
          ) : needAttention.length === 0 ? (
            <Button variant="primary" disabled={busy} onClick={simulate} title="Inject bearing wear into P-101 (i)">
              <FlaskConical className="h-4 w-4" /> Simulate a fault
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {plant.machines.map((m) => (
          <MachineTile
            key={m.id}
            machine={m}
            selected={m.id === machine.id}
            onSelect={() => onSelectMachine(m.id)}
            onOpenIncident={m.active_alert_id ? () => onOpenIncident(m.active_alert_id!) : undefined}
          />
        ))}
      </div>

      <MachineChart machine={machine} />

      {past.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          Past incidents:
          {past.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpenIncident(a.id)}
              className="rounded-full border border-zinc-800 px-2.5 py-0.5 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
            >
              {a.machine_id} · {a.diagnosis?.fault_label ?? a.state} · {a.state}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
