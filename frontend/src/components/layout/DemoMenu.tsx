import { useEffect, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Cog, FlaskConical, MoveHorizontal, Pause, Play, RotateCcw, SlidersHorizontal, Thermometer, Waves, X, type LucideIcon } from "lucide-react";
import type { FaultType, PlantState } from "../../types";
import { api } from "../../api";
import { FAULT_LABELS, statusColor } from "../../lib/format";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

const SPEEDS = [
  { value: 1, label: "5 min" },
  { value: 2, label: "10 min" },
  { value: 6, label: "30 min" },
  { value: 30, label: "2.5 h" },
  { value: 60, label: "5 h" },
];
// The simulator only models faults on the centrifugal pumps.
const INJECT_MACHINES = ["P-101", "P-102"];
const FAULTS: { id: FaultType; icon: LucideIcon; hint: string }[] = [
  { id: "bearing_wear", icon: Cog, hint: "HF vibration and bearing heat creep up" },
  { id: "cavitation", icon: Waves, hint: "Flow and pressure drop, noisy vibration" },
  { id: "misalignment", icon: MoveHorizontal, hint: "Vibration and motor load rise together" },
  { id: "motor_overheat", icon: Thermometer, hint: "Winding temperature climbs fast" },
];

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow">{title}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Presenter controls: run the simulation and inject a problem into a pump. Tucked behind one "Demo" button. */
export function DemoMenu({ plant, onChanged }: { plant: PlantState | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [machineId, setMachineId] = useState("P-101");
  const [fault, setFault] = useState<FaultType>("bearing_wear");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  // "Reset" asks for a second click, then forgets after a few seconds.
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 3000);
    return () => clearTimeout(t);
  }, [confirmReset]);

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
  const pumps = INJECT_MACHINES.map((id) => plant?.machines.find((m) => m.id === id)).filter((m) => m != null);
  const target = pumps.find((m) => m.id === machineId);
  const targetBusy = !!target?.injected_fault;
  const activeFaults = plant?.machines.filter((m) => m.injected_fault) ?? [];
  const speeds = plant && !SPEEDS.some((s) => s.value === plant.speed) ? [...SPEEDS, { value: plant.speed, label: `${plant.speed * 5} min` }] : SPEEDS;

  return (
    <div className="relative">
      <Button size="sm" variant={open ? "secondary" : "ghost"} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <SlidersHorizontal className="h-3.5 w-3.5" /> Demo
        {activeFaults.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-label="A demo fault is active" />}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="glass-panel absolute right-0 z-40 mt-2 w-[400px] origin-top-right animate-drop-in divide-y divide-white/5 overflow-hidden rounded-2xl">
            <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
              <div>
                <div className="font-semibold text-zinc-100">Demo controls</div>
                <div className="text-xs text-zinc-500">Presenter tools to drive the simulated plant</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            <Section title="Simulation">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => run(() => api.control({ paused: !plant?.paused }))}
                  title={plant?.paused ? "Play (Space)" : "Pause (Space)"}
                  aria-label={plant?.paused ? "Play" : "Pause"}
                  className={clsx(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
                    plant?.paused ? "bg-sky-600 text-white hover:bg-sky-500" : "border border-white/10 bg-white/[0.06] text-zinc-200 hover:bg-white/10",
                  )}
                >
                  {plant?.paused ? <Play className="h-4 w-4 translate-x-px" /> : <Pause className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 text-[11px] text-zinc-500">Plant time per real second</div>
                  <div role="radiogroup" aria-label="Simulation speed" className="flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
                    {speeds.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        role="radio"
                        aria-checked={plant?.speed === s.value}
                        disabled={disabled}
                        onClick={() => run(() => api.control({ speed: s.value }))}
                        className={clsx(
                          "flex-1 rounded-md py-1 text-xs tabular-nums transition-colors",
                          plant?.speed === s.value ? "bg-white/10 font-medium text-zinc-50" : "text-zinc-400 hover:text-zinc-200",
                        )}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 text-xs text-zinc-400">
                Pause automatically when the AI raises an alert
                <input
                  type="checkbox"
                  className="peer sr-only"
                  disabled={disabled}
                  checked={plant?.auto_pause_on_alert ?? true}
                  onChange={(e) => run(() => api.control({ auto_pause_on_alert: e.target.checked }))}
                />
                <span className="relative h-5 w-9 shrink-0 rounded-full bg-white/10 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-zinc-300 after:transition-transform peer-checked:bg-sky-600 peer-checked:after:translate-x-4 peer-checked:after:bg-white peer-focus-visible:ring-2 peer-focus-visible:ring-sky-400/60" />
              </label>
            </Section>

            <Section title="Inject a problem">
              <div className="grid grid-cols-2 gap-2">
                {pumps.map((m) => {
                  const c = statusColor(m.status);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMachineId(m.id)}
                      aria-pressed={machineId === m.id}
                      className={clsx(
                        "rounded-xl border px-3 py-2.5 text-left transition-colors",
                        machineId === m.id ? "border-sky-400/60 bg-sky-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/20",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-zinc-100">{m.id}</span>
                        <span className={clsx("h-2 w-2 rounded-full", c.dot)} />
                      </div>
                      <div className="truncate text-[11px] text-zinc-500">{m.injected_fault ? `${FAULT_LABELS[m.injected_fault]} active` : m.name.replace(` ${m.id}`, "")}</div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {FAULTS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFault(f.id)}
                    aria-pressed={fault === f.id}
                    className={clsx(
                      "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
                      fault === f.id ? "border-red-400/50 bg-red-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/20",
                    )}
                  >
                    <f.icon className={clsx("mt-0.5 h-4 w-4 shrink-0", fault === f.id ? "text-red-300" : "text-zinc-500")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-100">{FAULT_LABELS[f.id]}</span>
                      <span className="block text-[11px] leading-snug text-zinc-500">{f.hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              <Button
                variant="primary"
                className="mt-3 h-10 w-full"
                disabled={disabled || targetBusy}
                onClick={() => run(() => api.inject({ machine_id: machineId, fault }))}
                title={targetBusy ? `${machineId} already has an active fault` : "Shortcut for P-101 bearing wear: i"}
              >
                {busy ? <Spinner /> : <FlaskConical className="h-4 w-4" />}
                {targetBusy ? `${machineId} already has a fault` : `Inject ${FAULT_LABELS[fault].toLowerCase()} into ${machineId}`}
              </Button>
              {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
            </Section>

            <div className="flex items-center justify-between px-5 py-3">
              <Button
                size="sm"
                variant={confirmReset ? "danger" : "ghost"}
                disabled={disabled}
                onClick={() => {
                  if (!confirmReset) return setConfirmReset(true);
                  setConfirmReset(false);
                  run(() => api.reset());
                }}
                title="All machines back to healthy, all alerts cleared"
              >
                <RotateCcw className="h-3.5 w-3.5" /> {confirmReset ? "Click again to reset" : "Reset demo"}
              </Button>
              <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                {["Space", "i", "←", "→", "w"].map((k) => (
                  <kbd key={k} className="rounded border border-white/10 bg-white/[0.05] px-1.5 py-px font-sans text-[10px] text-zinc-400">
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
