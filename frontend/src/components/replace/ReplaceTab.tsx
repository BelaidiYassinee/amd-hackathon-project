import { useState } from "react";
import clsx from "clsx";
import { BadgeCheck, Calculator, Cpu, Info, Trophy } from "lucide-react";
import { api } from "../../api";
import type { Alert, MachineSummary, ReplaceAnalysis } from "../../types";
import { eur } from "../../lib/format";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Pill } from "../ui/Pill";
import { Section } from "../ui/Section";
import { Spinner } from "../ui/Spinner";
import { CostChart } from "./CostChart";

const ASSUMPTION_LABELS: Record<string, string> = {
  energy_eur_per_kwh: "Energy price (€/kWh)",
  downtime_eur_per_h: "Downtime cost (€/h)",
  horizon_years: "Horizon (years)",
  hours_per_failure: "Downtime per failure (h)",
  base_maintenance_eur_year: "Base maintenance (€/year)",
  failures_per_year_new: "Failures per year, new pump",
  failures_per_corrective_repair: "Extra failures per past corrective repair",
  maintenance_factor_per_corrective: "Maintenance uplift per corrective repair",
  corrective_repairs_last_12m: "Corrective repairs, last 12 months",
  age_years: "Age of current pump (years)",
};
const DUTY_LABELS: Record<string, string> = { flow_m3h: "Flow (m³/h)", head_m: "Head (m)", hours_per_year: "Running hours / year" };
const label = (map: Record<string, string>, k: string) => map[k] ?? k.replace(/_/g, " ");

/** Repair vs. replace on 5-year total cost of ownership for the selected machine. */
export function ReplaceTab({
  machine,
  alert,
  result,
  onResult,
}: {
  machine: MachineSummary;
  alert: Alert | null;
  result: ReplaceAnalysis | undefined;
  onResult: (r: ReplaceAnalysis) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!machine.type.includes("pump")) {
    return (
      <Card className="flex flex-1 items-center justify-center p-8 text-sm text-slate-400">
        Repair vs. replace is available for pumps. Select P-101 or P-102.
      </Card>
    );
  }

  const fault = alert?.diagnosis?.fault;

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

  const rec = result?.options.find((o) => o.option_id === result.recommendation);
  const repair = result?.options.find((o) => o.kind === "repair");

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-100">Repair vs. replace · {machine.name}</div>
          <div className="text-xs text-slate-400">
            5-year total cost of ownership{fault ? ` · for diagnosed fault: ${fault}` : ""}
          </div>
        </div>
        <Button variant="primary" className="ml-auto" disabled={loading} onClick={run}>
          {loading ? <Spinner /> : <Calculator className="h-4 w-4" />}
          {loading ? "Analysing on AMD…" : result ? "Re-run analysis" : "Run repair-vs-replace analysis"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && <div className="m-4 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">Analysis failed: {error}</div>}

        {!result ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-sm text-slate-400">
            <Calculator className="h-8 w-8 text-slate-600" />
            Compares repairing {machine.id} against catalog pumps on purchase, energy, maintenance and downtime.
            <span className="text-xs text-slate-500">The written justification is generated on the AMD Radeon API (a few seconds).</span>
          </div>
        ) : (
          <>
            {/* Recommendation */}
            <div className="m-4 rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Trophy className="h-6 w-6 text-emerald-400" />
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wide text-emerald-300/80">Recommended</div>
                  <div className="text-xl font-bold text-slate-50">{rec?.label ?? result.recommendation}</div>
                </div>
                <div className="ml-auto text-right">
                  <div className="text-xl font-bold tabular-nums text-emerald-300">{rec ? eur(rec.tco_5y_eur) : "–"}</div>
                  <div className="text-xs text-slate-400">5-year cost{repair && rec && repair !== rec ? ` vs ${eur(repair.tco_5y_eur)} to repair` : ""}</div>
                </div>
              </div>
              {result.payback_months != null && (
                <div className="mt-2 text-sm font-medium text-emerald-200">Pays back in {result.payback_months.toFixed(1)} months vs. repairing</div>
              )}
              <p className="mt-3 text-sm leading-relaxed text-slate-300">{result.justification}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {result.justification_verified ? (
                  <Pill className="bg-emerald-500/15 text-emerald-300">
                    <BadgeCheck className="h-3.5 w-3.5" /> Numbers checked ✓
                  </Pill>
                ) : (
                  <Pill className="bg-amber-400/15 text-amber-300">Numbers not verified</Pill>
                )}
                <Pill className="bg-red-600/15 text-red-300">
                  <Cpu className="h-3.5 w-3.5" /> Justification written on AMD
                </Pill>
              </div>
            </div>

            {/* Table */}
            <div className="mx-4 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-950/60 text-left text-xs text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Option</th>
                    <th className="px-3 py-2 font-medium">Fits duty</th>
                    <th className="px-3 py-2 text-right font-medium">Upfront</th>
                    <th className="px-3 py-2 text-right font-medium">Energy 5y</th>
                    <th className="px-3 py-2 text-right font-medium">Maintenance 5y</th>
                    <th className="px-3 py-2 text-right font-medium">Downtime 5y</th>
                    <th className="px-3 py-2 text-right font-semibold text-slate-200">TCO 5y</th>
                    <th className="px-3 py-2 text-right font-medium">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 tabular-nums">
                  {result.options.map((o) => (
                    <tr
                      key={o.option_id}
                      title={o.fit_notes}
                      className={clsx(
                        o.option_id === result.recommendation && "bg-emerald-500/10",
                        !o.fits_duty && "text-slate-500",
                        o.fits_duty && "text-slate-200",
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">#{o.rank}</span>
                          <span className={clsx(o.option_id === result.recommendation && "font-semibold text-emerald-300")}>{o.label}</span>
                          <Info className="h-3.5 w-3.5 shrink-0 text-slate-600" aria-label={o.fit_notes} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {o.fits_duty ? (
                          <span className="text-emerald-400">Yes</span>
                        ) : (
                          <Pill className="bg-slate-800 text-slate-400">Doesn't meet duty</Pill>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{eur(o.capex_eur)}</td>
                      <td className="px-3 py-2 text-right">{eur(o.energy_eur_5y)}</td>
                      <td className="px-3 py-2 text-right">{eur(o.maintenance_eur_5y)}</td>
                      <td className="px-3 py-2 text-right">{eur(o.downtime_eur_5y)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{eur(o.tco_5y_eur)}</td>
                      <td className="px-3 py-2 text-right">{o.score.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Chart */}
            <div className="mx-4 mt-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Where the 5-year cost comes from</div>
              <CostChart options={result.options} />
            </div>

            <Section title="Assumptions" collapsible defaultOpen={false}>
              <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
                {Object.entries(result.duty).map(([k, v]) => (
                  <Row key={`d-${k}`} k={label(DUTY_LABELS, k)} v={v} />
                ))}
                {Object.entries(result.assumptions).map(([k, v]) => (
                  <Row key={`a-${k}`} k={label(ASSUMPTION_LABELS, k)} v={v} />
                ))}
              </dl>
              <p className="mt-2 text-xs text-slate-500">Assumptions live in backend/data/catalog.json</p>
            </Section>
          </>
        )}
      </div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: number }) {
  return (
    <>
      <dt className="text-slate-400">{k}</dt>
      <dd className="text-right tabular-nums text-slate-200">{v.toLocaleString("en")}</dd>
    </>
  );
}
