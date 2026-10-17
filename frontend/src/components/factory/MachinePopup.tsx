import clsx from "clsx";
import { AlertTriangle, ArrowRight, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { api } from "../../api";
import type { Alert, MachineSummary } from "../../types";
import { usePoll } from "../../hooks/usePoll";
import { STATUS_LABEL, statusColor } from "../../lib/format";
import { useFaultTint } from "../../hooks/useFaultTint";
import { faultZone } from "./faultZone";
import { cameraOrbit, modelSrc } from "./machineModel";
import { SignalList } from "./SignalList";

/** Medium pop-up over the blurred factory: the machine (drag to inspect) on the left, its live signals on the right. */
export function MachinePopup({
  machine,
  alert,
  onClose,
  onOpenIncident,
}: {
  machine: MachineSummary;
  /** The machine's active incident, if any. */
  alert: Alert | null;
  onClose: () => void;
  onOpenIncident: (alertId: string) => void;
}) {
  // Only polls while the pop-up is open.
  const series = usePoll(() => api.series(machine.id, 6), 2000, [machine.id]);
  const c = statusColor(machine.status);
  const fault = faultZone(machine, alert);
  const viewer = useRef<HTMLElement>(null);
  useFaultTint(viewer, fault?.zone ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="glass-backdrop fixed inset-0 z-50 flex animate-fade-in items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={machine.name}
        onClick={(e) => e.stopPropagation()}
        className="glass-panel grid h-[min(640px,88vh)] w-[min(960px,92vw)] animate-pop-in grid-cols-2 overflow-hidden rounded-2xl"
      >
        <div className="relative bg-gradient-to-b from-white/[0.04] to-transparent">
          <model-viewer
            ref={viewer}
            src={modelSrc(machine.id)}
            alt={`3D model of ${machine.name}`}
            camera-controls=""
            auto-rotate=""
            auto-rotate-delay={1500}
            rotation-per-second="18deg"
            camera-orbit={cameraOrbit(machine.id)}
            interaction-prompt="none"
            disable-pan=""
            environment-image="neutral"
            shadow-intensity={0.6}
            style={{ width: "100%", height: "100%", cursor: "grab" }}
          >
            <div slot="progress-bar" />
            {/* Pinned to the failing part in 3D: it follows the model as it turns. */}
            {fault && (
              <div slot="hotspot-fault" data-position={fault.position} data-normal="0m 1m 0m" className="pointer-events-none">
                {/* The hotspot is centred on its point, so only the dot takes up space; the label hangs to its right. */}
                <span className="relative block h-3 w-3">
                  <span className="absolute inset-0 animate-ping-slow rounded-full bg-red-500 motion-reduce:hidden" />
                  <span className="absolute inset-0 rounded-full border-2 border-white/80 bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]" />
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-red-400/40 bg-zinc-950/80 px-2 py-0.5 text-xs font-medium text-red-200 backdrop-blur">
                    {fault.label}
                  </span>
                </span>
              </div>
            )}
          </model-viewer>
          <p className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-xs text-zinc-500">Drag to turn · scroll to zoom</p>
        </div>

        <div className="flex min-h-0 flex-col border-l border-white/5">
          <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">{machine.name}</h2>
              <p className="text-xs text-zinc-500">
                {machine.id} · {machine.model} · {machine.area}
              </p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center gap-6 px-6 pb-4">
            <span className={clsx("flex items-center gap-1.5 text-sm font-medium", c.text)}>
              <span className={clsx("h-2 w-2 rounded-full", c.dot)} />
              {STATUS_LABEL[machine.status]}
            </span>
            <span className="text-sm text-zinc-400">
              Health <span className={clsx("font-semibold tabular-nums", c.text)}>{machine.health}</span>
            </span>
            <span className="ml-auto text-xs text-zinc-500">Last 6 h</span>
          </div>

          {alert && (
            <button
              type="button"
              onClick={() => onOpenIncident(alert.id)}
              className="group mx-6 mb-3 flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-left transition-colors hover:border-red-400/70 hover:bg-red-500/15"
            >
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-400" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-zinc-100">Active incident</span>
                <span className="block truncate text-xs text-zinc-400">
                  {alert.diagnosis ? alert.diagnosis.fault_label : "The AI is investigating…"}
                </span>
              </span>
              <span className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white group-hover:bg-red-500">
                Open incident <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            <SignalList signals={machine.signals} latest={machine.latest} series={series.data} />
          </div>
        </div>
      </div>
    </div>
  );
}
