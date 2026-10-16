import { Cpu, ShieldCheck, Wrench, type LucideIcon } from "lucide-react";
import type { TraceStep } from "../../types";

export const TRACE_ICONS: Record<TraceStep["kind"], { icon: LucideIcon; color: string }> = {
  llm: { icon: Cpu, color: "text-red-400" },
  tool: { icon: Wrench, color: "text-sky-400" },
  validation: { icon: ShieldCheck, color: "text-emerald-400" },
};

/** One-line hint of what a step did: tool arguments, or token counts for an LLM call. */
export function stepHint(s: TraceStep): string {
  if (s.kind === "llm") {
    const tokens = (s.prompt_tokens ?? 0) + (s.completion_tokens ?? 0);
    return tokens ? `${tokens.toLocaleString("en")} tokens` : "";
  }
  if (s.input && typeof s.input === "object" && !Array.isArray(s.input)) {
    return Object.values(s.input as Record<string, unknown>).map(String).join(", ");
  }
  return typeof s.input === "string" ? s.input : "";
}

/** Compact live trace: icon + name + hint + latency. The full view with JSON is the TraceDrawer. */
export function TraceList({ trace }: { trace: TraceStep[] }) {
  if (trace.length === 0) return <div className="text-sm text-zinc-500">Waiting for the first step…</div>;
  return (
    <ol className="space-y-1">
      {trace.map((s) => {
        const { icon: Icon, color } = TRACE_ICONS[s.kind];
        return (
          <li key={s.i} className="flex items-center gap-2 rounded-md bg-zinc-800/50 px-2 py-1.5 text-sm">
            <Icon className={`h-4 w-4 shrink-0 ${color}`} />
            <span className="shrink-0 font-mono text-xs text-zinc-200">{s.name}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{stepHint(s)}</span>
            <span className="shrink-0 tabular-nums text-xs text-zinc-400">{s.latency_ms.toLocaleString("en")} ms</span>
          </li>
        );
      })}
    </ol>
  );
}
