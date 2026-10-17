import "@google/model-viewer"; // registers <model-viewer>; three.js only downloads with this lazy chunk
import { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical } from "lucide-react";
import { api } from "../../api";
import type { Alert, PlantState } from "../../types";
import { FAULT_LABELS } from "../../lib/format";
import { useMouseParallax } from "../../hooks/useMouseParallax";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { MachineCard3D } from "./MachineCard3D";
import { MachinePopup } from "./MachinePopup";

/** The main page: four machines on floating glass cards. Click one for its live signals and its incident. */
export function FactoryView({
  plant,
  alerts,
  onOpenIncident,
  onPlantChanged,
  initialMachineId = null,
}: {
  plant: PlantState | null;
  alerts: Alert[] | null;
  onOpenIncident: (alertId: string) => void;
  onPlantChanged: () => void;
  initialMachineId?: string | null;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  useMouseParallax(rowRef);
  const [openId, setOpenId] = useState<string | null>(initialMachineId);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => setOpenId(null), []);

  if (!plant) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-400">
        <Spinner /> Connecting to the plant…
      </div>
    );
  }

  // Looked up on every poll, so the pop-up values stay live.
  const open = plant.machines.find((m) => m.id === openId);
  const openAlert = alerts?.find((a) => a.id === open?.active_alert_id) ?? null;
  const needAttention = plant.machines.filter((m) => m.active_alert_id);
  const injected = plant.machines.find((m) => m.injected_fault);
  const past = (alerts ?? []).filter((a) => !plant.machines.some((m) => m.active_alert_id === a.id));

  async function simulate() {
    setBusy(true);
    try {
      await api.inject({ machine_id: "P-101", fault: "bearing_wear" });
      onPlantChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-12 overflow-hidden px-8 pb-10">
      {/* Soft light behind the glass, so the blur has something to show. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(56,189,248,0.10),transparent_60%)]" />

      <div className="relative flex w-full max-w-7xl items-center gap-4">
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

      <div ref={rowRef} className="relative grid w-full max-w-7xl grid-cols-4 gap-6 [perspective:1200px]">
        {plant.machines.map((m, i) => (
          <MachineCard3D key={m.id} machine={m} index={i} onOpen={() => setOpenId(m.id)} />
        ))}
      </div>

      {/* Fixed height, so the row of cards never jumps when the first incident closes. */}
      <div className="relative flex h-6 w-full max-w-7xl flex-wrap items-center gap-2 text-xs text-zinc-500">
        {past.length > 0 && "Past incidents:"}
        {past.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onOpenIncident(a.id)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-zinc-400 hover:border-white/25 hover:text-zinc-200"
          >
            {a.machine_id} · {a.diagnosis?.fault_label ?? a.state} · {a.state}
          </button>
        ))}
      </div>

      {open && (
        <MachinePopup
          machine={open}
          alert={openAlert}
          onClose={close}
          onOpenIncident={(id) => {
            close();
            onOpenIncident(id);
          }}
        />
      )}
    </main>
  );
}
