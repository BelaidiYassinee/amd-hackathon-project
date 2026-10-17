import { Cpu } from "lucide-react";
import type { AmdStats } from "../../types";

/** Compact "runs on AMD" badge; opens the AMD panel. Red is reserved for this badge. */
export function AmdChip({ stats, failed, onClick }: { stats: AmdStats | null; failed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="AI inference details (a)"
      className="inline-flex h-11 items-center gap-2 rounded-full border border-red-600/50 bg-red-600/10 pl-1.5 pr-4 text-[15px] text-zinc-200 hover:bg-red-600/20"
    >
      <span className="flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">
        <Cpu className="h-3.5 w-3.5" /> AMD
      </span>
      {stats ? (
        <span className="whitespace-nowrap">
          {stats.model} · {stats.calls} AI calls
        </span>
      ) : (
        <span className="text-zinc-400">{failed ? "stats unavailable" : "connecting…"}</span>
      )}
      {stats?.mock && <span className="rounded bg-amber-400/20 px-1.5 text-[10px] font-bold text-amber-300">MOCK</span>}
    </button>
  );
}
