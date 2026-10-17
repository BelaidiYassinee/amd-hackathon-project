import clsx from "clsx";
import type { ReplaceAnalysis } from "../../types";
import { eur } from "../../lib/format";
import { Modal } from "../ui/Modal";

const ASSUMPTION_LABELS: Record<string, string> = {
  flow_m3h: "Duty flow (m³/h)",
  head_m: "Duty head (m)",
  hours_per_year: "Running hours / year",
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

/** The full cost table and the assumptions behind it, in a dialog. */
export function CostDetails({ result, onClose }: { result: ReplaceAnalysis; onClose: () => void }) {
  const rows = { ...result.duty, ...result.assumptions };
  return (
    <Modal title="Cost breakdown and assumptions" onClose={onClose} className="max-w-4xl">
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/20 text-left text-xs text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">Option</th>
              <th className="px-3 py-2 font-medium">Meets duty</th>
              <th className="px-3 py-2 text-right font-medium">Upfront</th>
              <th className="px-3 py-2 text-right font-medium">Energy 5y</th>
              <th className="px-3 py-2 text-right font-medium">Maintenance 5y</th>
              <th className="px-3 py-2 text-right font-medium">Downtime 5y</th>
              <th className="px-3 py-2 text-right font-semibold text-zinc-200">Total 5y</th>
              <th className="px-3 py-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 tabular-nums">
            {result.options.map((o) => (
              <tr
                key={o.option_id}
                title={o.fit_notes}
                className={clsx(o.option_id === result.recommendation && "bg-emerald-500/10", o.fits_duty ? "text-zinc-200" : "text-zinc-500")}
              >
                <td className="px-3 py-2">
                  <span className="mr-2 text-xs text-zinc-500">#{o.rank}</span>
                  {o.label}
                  <div className="text-xs text-zinc-500">{o.fit_notes}</div>
                </td>
                <td className="px-3 py-2">{o.fits_duty ? <span className="text-emerald-400">Yes</span> : "No"}</td>
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

      <div className="mt-5 text-sm font-medium text-zinc-200">Assumptions</div>
      <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm sm:grid-cols-[1fr_auto_1fr_auto]">
        {Object.entries(rows).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-zinc-400">{ASSUMPTION_LABELS[k] ?? k.replace(/_/g, " ")}</dt>
            <dd className="text-right tabular-nums text-zinc-200">{v.toLocaleString("en")}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-zinc-500">Assumptions live in backend/data/catalog.json</p>
    </Modal>
  );
}
