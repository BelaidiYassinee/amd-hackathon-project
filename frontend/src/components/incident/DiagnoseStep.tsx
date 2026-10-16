import { Cpu, FileSearch } from "lucide-react";
import type { Alert } from "../../types";
import type { Highlight } from "../../lib/uiTypes";
import { DiagnosisCard } from "../alert/DiagnosisCard";
import { EvidenceList } from "../alert/EvidenceList";
import { RefText } from "../alert/RefText";
import { TraceList } from "../trace/TraceList";
import { Spinner } from "../ui/Spinner";

/** Step 2: the AI's verdict on the left, the evidence behind it on the right. */
export function DiagnoseStep({
  alert,
  onHighlight,
  onOpenManual,
  onOpenHistory,
  onOpenTrace,
}: {
  alert: Alert;
  onHighlight: (h: Highlight) => void;
  onOpenManual: (id: string) => void;
  onOpenHistory: (id: string) => void;
  onOpenTrace: () => void;
}) {
  const d = alert.diagnosis;
  const llm = alert.trace.filter((s) => s.kind === "llm");
  const tools = alert.trace.filter((s) => s.kind === "tool").length;
  const seconds = llm.reduce((sum, s) => sum + s.latency_ms, 0) / 1000;

  if (!d) {
    return (
      <div className="mx-auto flex h-full w-full max-w-xl flex-col gap-4">
        <div className="flex items-center gap-3 text-lg font-medium text-zinc-100">
          <Cpu className="h-6 w-6 text-red-500" />
          The AI is investigating on AMD…
          <Spinner className="ml-auto text-red-400" />
        </div>
        <p className="text-sm text-zinc-400">
          It reads the sensor trends, the maintenance history, the pump manual and the spare-parts stock, one tool call at a time.
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TraceList trace={alert.trace} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-8">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
        <DiagnosisCard diagnosis={d} error={alert.error} />
        <button
          type="button"
          onClick={onOpenTrace}
          className="flex items-center gap-2 self-start rounded-lg text-left text-xs text-zinc-400 hover:text-zinc-200"
          title="Show every step the agent took (t)"
        >
          <Cpu className="h-3.5 w-3.5 shrink-0 text-red-500" />
          Diagnosed on AMD Radeon API · {llm.length} AI calls, {tools} data lookups · {seconds.toFixed(1)} s
          <FileSearch className="h-3.5 w-3.5 shrink-0" />
          <span className="underline underline-offset-2">See how</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-col">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm font-medium text-zinc-200">Evidence</span>
          <span className="text-xs text-zinc-500">click any item to check it</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <EvidenceList alert={alert} onHighlight={onHighlight} onOpenManual={onOpenManual} onOpenHistory={onOpenHistory} />
          {d.alternatives.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">Why not something else?</summary>
              <ul className="mt-2 space-y-2">
                {d.alternatives.map((a) => (
                  <li key={a.fault}>
                    <span className="font-medium text-zinc-200">{a.fault}</span>
                    <p className="text-zinc-400">
                      <RefText text={a.why_less_likely} onOpenManual={onOpenManual} />
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
