import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Cpu, RefreshCw, Table2, Trophy } from "lucide-react";
import { api } from "../../api";
import type { Alert, MachineSummary, ReplaceAnalysis } from "../../types";
import { eur } from "../../lib/format";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { Spinner } from "../ui/Spinner";
import { CostChart } from "../replace/CostChart";
import { CostDetails } from "../replace/CostDetails";

/** Step 5: repair vs. replace on 5-year cost. Runs automatically the first time the step opens. */
export function DecideStep({
  alert,
  machine,
  result,
  onResult,
}: {
  alert: Alert;
  machine: MachineSummary;
  result: ReplaceAnalysis | undefined;
  onResult: (r: ReplaceAnalysis) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const isPump = machine.type.includes("pump");
  const fault = alert.diagnosis?.fault;

  async function run() {
    setLoading(true);
    setError(null);
    try {
      onResult(await api.replaceAnalysis(machine.id, fault ? { fault } : {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Auto-run once per machine (the ref also stops React StrictMode's double effect from making two LLM calls).
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (isPump && !result && started.current !== machine.id) {
      started.current = machine.id;
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine.id]);

  if (!isPump) return <div className="flex h-full items-center justify-center text-sm text-zinc-400">Repair vs. replace is available for pumps.</div>;

  if (!result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-400">
        {error ? (
          <>
            <span className="text-red-400">Analysis failed: {error}</span>
            <Button onClick={run}>Try again</Button>
          </>
        ) : (
          <>
            <Spinner className="h-6 w-6" />
            Comparing repair against catalog pumps; the AI writes the justification on AMD…
          </>
        )}
      </div>
    );
  }

  const rec = result.options.find((o) => o.option_id === result.recommendation);
  const repair = result.options.find((o) => o.kind === "repair");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
        <div className="flex flex-wrap items-start gap-4">
          <Trophy className="mt-1 h-6 w-6 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-emerald-300/80">Recommended</div>
            <div className="text-xl font-semibold text-zinc-50">{rec?.label ?? result.recommendation}</div>
            {result.payback_months != null && (
              <div className="mt-0.5 text-sm text-emerald-200">Pays for itself in {result.payback_months.toFixed(1)} months compared with repairing</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums text-emerald-300">{rec ? eur(rec.tco_5y_eur) : "–"}</div>
            <div className="text-xs text-zinc-400">over 5 years{repair && rec && repair !== rec ? ` · repair: ${eur(repair.tco_5y_eur)}` : ""}</div>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-zinc-300">{result.justification}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {result.justification_verified && (
            <Pill className="bg-emerald-500/15 text-emerald-300">
              <BadgeCheck className="h-3.5 w-3.5" /> Numbers checked
            </Pill>
          )}
          <Pill className="bg-red-600/15 text-red-300">
            <Cpu className="h-3.5 w-3.5" /> Written on AMD
          </Pill>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setDetails(true)}>
              <Table2 className="h-3.5 w-3.5" /> Details
            </Button>
            <Button size="sm" variant="ghost" onClick={run} disabled={loading}>
              {loading ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />} Re-run
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-1 text-sm font-medium text-zinc-200">Where the 5-year cost comes from</div>
        <CostChart options={result.options} />
      </div>

      {details && <CostDetails result={result} onClose={() => setDetails(false)} />}
    </div>
  );
}
