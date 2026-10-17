import clsx from "clsx";
import type { CSSProperties } from "react";
import type { MachineSummary } from "../../types";
import { STATUS_LABEL, statusColor } from "../../lib/format";
import { cameraOrbit, modelSrc } from "./machineModel";

/**
 * One glass card with a turning machine. Each motion lives on its own nested layer, so the transforms never fight:
 * parallax (follows the mouse via --mx/--my) > idle float (CSS keyframe) > hover grow (button) > glass card.
 */
export function MachineCard3D({ machine, index, onOpen }: { machine: MachineSummary; index: number; onOpen: () => void }) {
  const c = statusColor(machine.status);
  // Cards further out move a little more, which gives the row some depth.
  const depth = [1, 0.7, 0.8, 1.1][index % 4];
  const parallax = {
    "--depth": depth,
    transform:
      "translate3d(calc(var(--mx, 0) * 12px * var(--depth)), calc(var(--my, 0) * 12px * var(--depth)), 0) " +
      "rotateY(calc(var(--mx, 0) * 5deg)) rotateX(calc(var(--my, 0) * -5deg))",
  } as CSSProperties;

  return (
    <div style={parallax} className="will-change-transform">
      <div className="animate-float motion-reduce:animate-none" style={{ animationDelay: `${index * -1.5}s` }}>
        <button
          type="button"
          onClick={onOpen}
          className="group block w-full rounded-2xl text-left transition-transform duration-300 ease-out hover:scale-[1.06] focus-visible:scale-[1.06] focus-visible:outline-none motion-reduce:transition-none"
        >
          <div
            className={clsx(
              "rounded-2xl border bg-white/[0.04] p-5 shadow-lg shadow-black/20 backdrop-blur-md transition-[border-color,box-shadow] duration-300",
              "group-hover:border-white/25 group-hover:shadow-2xl group-hover:shadow-sky-500/10 group-focus-visible:border-sky-400/60",
              machine.status === "alert" ? "border-red-500/50 shadow-red-500/10" : "border-white/10",
            )}
          >
            <model-viewer
              src={modelSrc(machine.id)}
              alt={`3D model of ${machine.name}`}
              loading="eager"
              auto-rotate=""
              auto-rotate-delay={0}
              rotation-per-second="18deg"
              camera-orbit={cameraOrbit(machine.id, 85)}
              interaction-prompt="none"
              environment-image="neutral"
              shadow-intensity={0.5}
              style={{ width: "100%", height: "220px", pointerEvents: "none" }}
            >
              <div slot="progress-bar" />
            </model-viewer>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-100">{machine.name}</div>
                <div className="text-xs text-zinc-500">{machine.id}</div>
              </div>
              <span className={clsx("flex shrink-0 items-center gap-1.5 text-xs font-medium", c.text)}>
                <span className={clsx("h-2 w-2 rounded-full", c.dot)} />
                {STATUS_LABEL[machine.status]}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={clsx("text-2xl font-semibold tabular-nums", c.text)}>{machine.health}</span>
              <span className="text-xs text-zinc-500">health</span>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}
