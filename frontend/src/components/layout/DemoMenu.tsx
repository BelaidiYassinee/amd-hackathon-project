import { useState } from "react";
import { FlaskConical, Pause, Play, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { FaultType, PlantState } from "../../types";
import { api } from "../../api";
import { FAULT_LABELS } from "../../lib/format";
import { Button } from "../ui/Button";

const SPEEDS = [
  { value: 1, label: "5 min / s" },
  { value: 2, label: "10 min / s" },
  { value: 6, label: "30 min / s" },
  { value: 30, label: "2.5 h / s" },
  { value: 60, label: "5 h / s" },
];
const INJECT_MACHINES = ["P-101", "P-102"];
const FAULTS: FaultType[] = ["bearing_wear", "cavitation", "misalignment", "motor_overheat"];

const selectCls = "h-8 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-sm text-zinc-200";

/** Presenter controls, tucked behind one "Demo" button. */
export function DemoMenu({ plant, onChanged }: { plant: PlantState | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [machineId, setMachineId] = useState("P-101");
  const [fault, setFault] = useState<FaultType>("bearing_wear");

  // Every mutation: call the API, then re-poll the plant so the UI reflects the backend.
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

  const disabled = busy || !plant;
  const demoFaults = plant?.machines.filter((m) => m.injected_fault) ?? [];
  const speeds = plant && !SPEEDS.some((s) => s.value === plant.speed) ? [...SPEEDS, { value: plant.speed, label: `${plant.speed * 5} min / s` }] : SPEEDS;

  return (
    <div className="relative">
      <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <SlidersHorizontal className="h-3.5 w-3.5" /> Demo
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-72 space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl">
            <div>
              <div className="mb-1.5 text-xs font-medium text-zinc-400">Simulation</div>
              <div className="flex gap-2">
                <Button size="sm" disabled={disabled} onClick={() => run(() => api.control({ paused: !plant?.paused }))} className="w-24" title="Space">
                  {plant?.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {plant?.paused ? "Play" : "Pause"}
                </Button>
                <select
                  aria-label="Simulation speed"
                  disabled={disabled}
                  value={plant?.speed ?? 6}
                  onChange={(e) => run(() => api.control({ speed: Number(e.target.value) }))}
                  className={selectCls}
                >
                  {speeds.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  className="accent-sky-500"
                  disabled={disabled}
                  checked={plant?.auto_pause_on_alert ?? true}
                  onChange={(e) => run(() => api.control({ auto_pause_on_alert: e.target.checked }))}
                />
                Pause automatically when the AI raises an alert
              </label>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-zinc-400">Inject a fault</div>
              <div className="flex gap-2">
                <select aria-label="Machine" value={machineId} onChange={(e) => setMachineId(e.target.value)} className={selectCls}>
                  {INJECT_MACHINES.map((id) => (
                    <option key={id}>{id}</option>
                  ))}
                </select>
                <select aria-label="Fault" value={fault} onChange={(e) => setFault(e.target.value as FaultType)} className={selectCls}>
                  {FAULTS.map((f) => (
                    <option key={f} value={f}>
                      {FAULT_LABELS[f]}
                    </option>
                  ))}
                </select>
              </div>
              <Button size="sm" className="mt-2 w-full" disabled={disabled} onClick={() => run(() => api.inject({ machine_id: machineId, fault }))}>
                <FlaskConical className="h-3.5 w-3.5" /> Inject
              </Button>
              {demoFaults.map((m) => (
                <div key={m.id} className="mt-1.5 text-xs text-zinc-500">
                  Active demo fault: {m.id} · {m.injected_fault && FAULT_LABELS[m.injected_fault]}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  if (window.confirm("Reset the demo? All machines go back to healthy and all alerts are cleared.")) run(() => api.reset());
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset demo
              </Button>
              <span className="text-[11px] text-zinc-600">Keys: Space · i · ← →</span>
            </div>

            {error && <div className="text-xs text-red-400">{error}</div>}
          </div>
        </>
      )}
    </div>
  );
}
