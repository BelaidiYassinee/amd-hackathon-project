import "@google/model-viewer"; // registers <model-viewer>; three.js only downloads with this lazy chunk
import { useCallback, useRef, useState } from "react";
import type { PlantState } from "../../types";
import { useMouseParallax } from "../../hooks/useMouseParallax";
import { Spinner } from "../ui/Spinner";
import { MachineCard3D } from "./MachineCard3D";
import { MachinePopup } from "./MachinePopup";

/** The four machines on floating glass cards. Click one for its live signals. */
export function FactoryView({ plant, initialMachineId = null }: { plant: PlantState | null; initialMachineId?: string | null }) {
  const rowRef = useRef<HTMLDivElement>(null);
  useMouseParallax(rowRef);
  const [openId, setOpenId] = useState<string | null>(initialMachineId);
  const close = useCallback(() => setOpenId(null), []);

  // Looked up on every poll, so the pop-up values stay live.
  const open = plant?.machines.find((m) => m.id === openId);

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-8 pb-10">
      {/* Soft light behind the glass, so the blur has something to show. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(56,189,248,0.10),transparent_60%)]" />

      {!plant ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> Loading…
        </div>
      ) : (
        <div ref={rowRef} className="relative grid w-full max-w-7xl grid-cols-4 gap-6 [perspective:1200px]">
          {plant.machines.map((m, i) => (
            <MachineCard3D key={m.id} machine={m} index={i} onOpen={() => setOpenId(m.id)} />
          ))}
        </div>
      )}

      {open && <MachinePopup machine={open} onClose={close} />}
    </main>
  );
}
