import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowRight, BadgeCheck, Check, Cpu, RefreshCw, Table2, Trophy, Truck, Wrench } from "lucide-react";
import { api } from "../../api";
import type { Alert, MachineSummary, ReplaceAnalysis, ReplaceOption } from "../../types";
import { eur, simTime } from "../../lib/format";
import { decide, type Decision } from "../../lib/decisionLog";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { Spinner } from "../ui/Spinner";
import { CostChart } from "../replace/CostChart";
import { CostDetails } from "../replace/CostDetails";

/**
 * Step 4: repair vs. replace on 5-year cost. Runs automatically the first time the step opens.
 * The choice (the AI's recommendation unless overridden) decides the last step: Fix, or Order the replacement.
 */
export function DecideStep({
  alert,
  machine,
  result,
  onResult,
  decision,
  now,
  onDecided,
}: {
  alert: Alert;
  machine: MachineSummary;
  result: ReplaceAnalysis | undefined;
  onResult: (r: ReplaceAnalysis) => void;
  decision: Decision | null;
  now: string | null;
  /** After a choice: go on to the last step. */
  onDecided: () => void;
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

  if (!isPump) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-zinc-400">
        Repair vs. replace is available for pumps. This machine gets repaired.
        <Button variant="primary" onClick={onDecided}>
          Continue to Fix <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

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
  // The two choices offered: repair, and the best replacement (the recommended one when the AI says replace).
  const replacement = rec?.kind === "replace" ? rec : [...result.options].filter((o) => o.kind === "replace").sort((a, b) => a.rank - b.rank)[0];
  const chosenId = decision?.option_id ?? rec?.option_id;

  function choose(o: ReplaceOption) {
    if (now) decide(alert, o, now);
    onDecided();
  }

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

      {/* The decision: picks the last step of the flow. */}
      <div className="grid grid-cols-2 gap-3">
        {[repair, replacement].map((o) =>
          o ? (
            <button
              key={o.option_id}
              type="button"
              disabled={!now}
              onClick={() => choose(o)}
              className={clsx(
                "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                chosenId === o.option_id ? "border-sky-400/60 bg-sky-500/10" : "border-white/10 bg-white/[0.03] hover:border-white/25",
              )}
            >
              {o.kind === "repair" ? <Wrench className="h-5 w-5 shrink-0 text-zinc-300" /> : <Truck className="h-5 w-5 shrink-0 text-zinc-300" />}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-zinc-100">{o.kind === "repair" ? "Repair the current pump" : `Replace with ${o.label}`}</span>
                <span className="block text-xs text-zinc-500">
                  {eur(o.tco_5y_eur)} over 5 years
                  {o.kind === "replace" && ` · ${o.lead_time_days} d delivery`}
                  {o.option_id === rec?.option_id && " · AI recommendation"}
                </span>
              </span>
              {chosenId === o.option_id ? (
                <span className="flex items-center gap-1 text-xs font-medium text-sky-300">
                  <Check className="h-4 w-4" /> {decision ? "Chosen" : "Recommended"}
                </span>
              ) : (
                <span className="text-xs text-zinc-500">Choose</span>
              )}
            </button>
          ) : null,
        )}
      </div>
      {decision && (
        <p className="-mt-1 text-xs text-zinc-500">
          Decided {simTime(decision.decided_at)}: {decision.choice === "repair" ? "repair" : `replace with ${decision.label}`}. Click the other option to change it.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-1 text-sm font-medium text-zinc-200">Where the 5-year cost comes from</div>
        <CostChart options={result.options} />
      </div>

      {details && <CostDetails result={result} onClose={() => setDetails(false)} />}
    </div>
  );
}
