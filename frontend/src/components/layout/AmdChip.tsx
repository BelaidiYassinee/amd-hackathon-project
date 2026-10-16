import { Cpu } from "lucide-react";
import type { AmdStats } from "../../types";

/** "AMD Radeon API · DeepSeek-V4-Flash · 2.3 s avg · 6 calls". Red accent is reserved for this chip. */
export function AmdChip({ stats, failed, onClick }: { stats: AmdStats | null; failed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Show AMD inference details (a)"
      className="inline-flex h-9 min-w-0 items-center gap-2 rounded-lg border border-red-600/60 bg-red-600/10 px-3 text-sm text-slate-100 hover:bg-red-600/20"
    >
      <span className="flex shrink-0 items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
        <Cpu className="h-3.5 w-3.5" /> AMD
      </span>
      {stats ? (
        <span className="truncate">
          {stats.provider} · {stats.model} · {(stats.avg_latency_ms / 1000).toFixed(1)} s avg · {stats.calls} calls
        </span>
      ) : (
        <span className="truncate text-slate-400">AMD Radeon API · {failed ? "stats unavailable" : "connecting…"}</span>
      )}
      {stats?.mock && <span className="shrink-0 rounded bg-amber-400/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-300">MOCK</span>}
    </button>
  );
}
