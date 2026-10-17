import { useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Send, Truck } from "lucide-react";
import type { Alert, Person, ReplaceAnalysis } from "../../types";
import { eur, roleLabel, simTime } from "../../lib/format";
import { decide, recommended, sendPurchaseTask, type Decision } from "../../lib/decisionLog";
import { AlertActions } from "../alert/AlertActions";
import { Button } from "../ui/Button";

/**
 * Step 5 when the machine is replaced: the recommended model and supplier, and a purchase task for the supervisor
 * (it shows on the Team page). Once the new machine is in, the incident is closed here.
 */
export function OrderStep({
  alert,
  result,
  decision,
  people,
  now,
  onChanged,
  onViewInTeam,
}: {
  alert: Alert;
  result: ReplaceAnalysis | undefined;
  decision: Decision | null;
  people: Person[] | null;
  now: string | null;
  onChanged: () => void;
  onViewInTeam: (personId: string) => void;
}) {
  // The chosen replacement, else the AI's recommendation.
  const rec = recommended(result);
  const option = result?.options.find((o) => o.option_id === decision?.option_id) ?? rec;
  const label = decision?.label ?? option?.label ?? "the recommended model";
  const capex = decision?.capex_eur ?? option?.capex_eur;
  const leadDays = decision?.lead_time_days ?? option?.lead_time_days;
  const order = decision?.order ?? null;

  // Supervisors on shift first: buying is their call.
  const candidates = (people ?? [])
    .filter((p) => p.on_shift)
    .sort((a, b) => Number(b.role === "maintenance_supervisor") - Number(a.role === "maintenance_supervisor"));
  const [personId, setPersonId] = useState("");
  const chosen = personId || candidates[0]?.id || "";
  const name = (id: string) => people?.find((p) => p.id === id)?.name ?? id;
  const notYetOwned = alert.state === "open" || alert.state === "escalated";

  function send() {
    if (!now || !chosen) return;
    if (!decision && option) decide(alert, option, now); // going with the recommendation
    sendPurchaseTask(alert, chosen, now);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[3fr_2fr] gap-8">
      <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-5">
          <div className="flex items-start gap-4">
            <Truck className="mt-1 h-6 w-6 shrink-0 text-sky-300" />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-sky-300/80">Recommended replacement</div>
              <div className="text-xl font-semibold text-zinc-50">{label}</div>
              {option?.fit_notes && <p className="mt-1 text-sm text-zinc-400">{option.fit_notes}</p>}
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-4 gap-3 text-sm">
            <Fact label="Purchase + install">{capex != null ? eur(capex) : "–"}</Fact>
            <Fact label="Delivery">{leadDays != null ? `${leadDays} days` : "–"}</Fact>
            <Fact label="Efficiency">{option ? `${option.efficiency_pct}%` : "–"}</Fact>
            <Fact label="5-year cost">{option ? eur(option.tco_5y_eur) : "–"}</Fact>
          </dl>
          {result?.payback_months != null && rec?.option_id === option?.option_id && (
            <p className="mt-3 text-xs text-sky-200/80">Pays for itself in {result.payback_months.toFixed(1)} months compared with repairing.</p>
          )}
        </div>

        <div className="glass rounded-xl p-5">
          <div className="mb-3 text-sm font-medium text-zinc-200">Purchase task</div>
          {!order ? (
            <>
              <p className="mb-3 text-sm text-zinc-400">
                Send a task to place the order for <span className="text-zinc-200">{label}</span>. It appears on their list in the Team page.
              </p>
              <div className="flex items-center gap-2">
                <select aria-label="Who places the order" value={chosen} onChange={(e) => setPersonId(e.target.value)} className="field h-9 min-w-0 flex-1 px-2 text-sm">
                  {candidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {roleLabel(p.role)}
                    </option>
                  ))}
                </select>
                <Button variant="primary" disabled={!now || !chosen || !option} onClick={send}>
                  <Send className="h-4 w-4" /> Send purchase task
                </Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              {order.done_at ? (
                <span className="flex flex-1 items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Order placed by {name(order.assignee_id)} · {simTime(order.done_at)}
                  {leadDays != null && <span className="text-zinc-400"> · delivery in about {leadDays} days</span>}
                </span>
              ) : (
                <span className="flex-1 text-zinc-300">
                  Sent to <span className="font-semibold text-zinc-50">{name(order.assignee_id)}</span>
                  <span className="text-zinc-500"> · {simTime(order.created_at)} · waiting for the order</span>
                </span>
              )}
              <button type="button" onClick={() => onViewInTeam(order.assignee_id)} className="flex shrink-0 items-center gap-1 text-xs text-sky-300 hover:text-sky-200">
                View in Team <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <div className="text-sm font-medium text-zinc-200">After the new pump is installed</div>
        <p className="text-sm text-zinc-400">Close the incident and confirm what was wrong, so the AI learns from it.</p>
        <div className="mt-auto">
          {notYetOwned ? (
            <p className="text-xs text-zinc-500">Acknowledge the alert in the Assign step first.</p>
          ) : (
            <AlertActions mode="resolve" alert={alert} people={people} onChanged={onChanged} />
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-3 py-2">
      <dt className="text-[11px] text-zinc-500">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-zinc-100">{children}</dd>
    </div>
  );
}
