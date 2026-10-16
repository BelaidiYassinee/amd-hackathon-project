import { useState } from "react";
import { FlaskConical, Pause, Play, RotateCcw } from "lucide-react";
import type { FaultType, PlantState } from "../../types";
import { api } from "../../api";
import { FAULT_LABELS } from "../../lib/format";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";

const SPEEDS = [
  { value: 1, label: "5 min/s" },
  { value: 2, label: "10 min/s" },
  { value: 6, label: "30 min/s" },
  { value: 30, label: "2.5 h/s" },
  { value: 60, label: "5 h/s" },
];
const INJECT_MACHINES = ["P-101", "P-102"];
const FAULTS: FaultType[] = ["bearing_wear", "cavitation", "misalignment", "motor_overheat"];

export function DemoControls({ plant, onChanged }: { plant: PlantState | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [injectOpen, setInjectOpen] = useState(false);

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
  const speeds = plant && !SPEEDS.some((s) => s.value === plant.speed) ? [...SPEEDS, { value: plant.speed, label: `${plant.speed * 5} min/s` }] : SPEEDS;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {demoFaults.map((m) => (
        <Pill key={m.id} className="bg-slate-800 text-slate-400" title="Demo ground truth (only shown here)">
          Demo fault active: {m.id} {m.injected_fault}
        </Pill>
      ))}

      <Button
        size="sm"
        disabled={disabled}
        onClick={() => run(() => api.control({ paused: !plant?.paused }))}
        title="Play / pause (Space)"
        className="w-20"
      >
        {plant?.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        {plant?.paused ? "Play" : "Pause"}
      </Button>

      <select
        aria-label="Simulation speed"
        disabled={disabled}
        value={plant?.speed ?? 6}
        onChange={(e) => run(() => api.control({ speed: Number(e.target.value) }))}
        className="h-8 rounded-lg border border-slate-700 bg-slate-800 px-2 text-xs text-slate-200"
      >
        {speeds.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      <div className="relative">
        <Button size="sm" disabled={disabled} onClick={() => setInjectOpen((o) => !o)}>
          <FlaskConical className="h-3.5 w-3.5" /> Inject fault…
        </Button>
        {injectOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setInjectOpen(false)} />
            <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
              {INJECT_MACHINES.map((id) => (
                <div key={id} className="mb-1 last:mb-0">
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{id}</div>
                  {FAULTS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setInjectOpen(false);
                        run(() => api.inject({ machine_id: id, fault: f }));
                      }}
                    >
                      {FAULT_LABELS[f]}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
        <input
          type="checkbox"
          className="accent-sky-500"
          disabled={disabled}
          checked={plant?.auto_pause_on_alert ?? true}
          onChange={(e) => run(() => api.control({ auto_pause_on_alert: e.target.checked }))}
        />
        Auto-pause
      </label>

      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        title="Reset the demo"
        onClick={() => {
          if (window.confirm("Reset the demo? All machines go back to healthy and all alerts are cleared.")) run(() => api.reset());
        }}
      >
        <RotateCcw className="h-3.5 w-3.5" /> Reset
      </Button>

      {error && (
        <span className="max-w-48 truncate text-xs text-red-400" title={error}>
          {error}
        </span>
      )}
    </div>
  );
}
