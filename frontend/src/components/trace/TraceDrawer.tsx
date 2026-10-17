import { useState } from "react";
import clsx from "clsx";
import { ChevronRight, Cpu } from "lucide-react";
import type { Alert, AmdStats, TraceStep } from "../../types";
import { Drawer } from "../ui/Drawer";
import { Spinner } from "../ui/Spinner";
import { TRACE_ICONS, stepHint } from "./TraceList";

function pretty(v: unknown): string {
  if (v == null) return "–";
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

/** Full agent trace for one alert. Re-renders from the polled alert, so it updates live while diagnosing. */
export function TraceDrawer({ alert, amd, onClose }: { alert: Alert | null; amd: AmdStats | null; onClose: () => void }) {
  const trace = alert?.trace ?? [];
  const llm = trace.filter((s) => s.kind === "llm");
  const tools = trace.filter((s) => s.kind === "tool").length;
  const llmSeconds = llm.reduce((sum, s) => sum + s.latency_ms, 0) / 1000;
  const tokens = llm.reduce((sum, s) => sum + (s.prompt_tokens ?? 0) + (s.completion_tokens ?? 0), 0);
  const model = amd?.model ?? "DeepSeek-V4-Flash";

  return (
    <Drawer
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-red-500" />
          Agent trace {alert && <span className="font-mono text-sm text-zinc-400">{alert.id}</span>}
          {alert?.state === "diagnosing" && <Spinner className="text-red-400" />}
        </span>
      }
      subtitle={
        alert && (
          <>
            {llm.length} LLM calls · {tools} tool calls · {llmSeconds.toFixed(1)} s on AMD Radeon API · {model} · {tokens.toLocaleString("en")} tokens
          </>
        )
      }
    >
      {!alert ? (
        <div className="text-sm text-zinc-500">No alert selected.</div>
      ) : trace.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> Waiting for the first agent step…
        </div>
      ) : (
        <ol className="relative space-y-2 border-l border-white/10 pl-4">
          {trace.map((s) => (
            <TraceRow key={s.i} step={s} />
          ))}
        </ol>
      )}
    </Drawer>
  );
}

function TraceRow({ step: s }: { step: TraceStep }) {
  const [open, setOpen] = useState(false);
  const { icon: Icon, color } = TRACE_ICONS[s.kind];
  return (
    <li className="relative">
      <span className="absolute -left-[25px] top-2 flex h-4 w-4 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-[9px] text-zinc-400">
        {s.i}
      </span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-left hover:border-white/20"
      >
        <Icon className={clsx("h-4 w-4 shrink-0", color)} />
        <span className="shrink-0 font-mono text-sm text-zinc-100">{s.name}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">{stepHint(s)}</span>
        <span className="shrink-0 text-right text-xs tabular-nums text-zinc-400">
          {s.latency_ms.toLocaleString("en")} ms
          {s.kind === "llm" && s.prompt_tokens != null && (
            <span className="block text-[10px] text-zinc-500">
              {s.prompt_tokens.toLocaleString("en")} in · {(s.completion_tokens ?? 0).toLocaleString("en")} out
            </span>
          )}
        </span>
        <ChevronRight className={clsx("h-4 w-4 shrink-0 text-zinc-500 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="mt-1 grid gap-2 text-xs">
          {(["input", "output"] as const).map((k) => (
            <div key={k}>
              <div className="mb-0.5 font-semibold uppercase tracking-wide text-zinc-500">{k}</div>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-md border border-white/10 bg-black/30 p-2 font-mono text-[11px] text-zinc-300">
                {pretty(s[k])}
              </pre>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}
