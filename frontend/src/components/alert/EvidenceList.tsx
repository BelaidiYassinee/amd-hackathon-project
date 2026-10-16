import { useState } from "react";
import clsx from "clsx";
import { Activity, BookOpen, ChevronRight, Package, Wrench, type LucideIcon } from "lucide-react";
import type { Alert, Evidence, EvidenceKind } from "../../types";
import type { Highlight } from "../../lib/uiTypes";

const KIND: Record<EvidenceKind, { icon: LucideIcon; label: string; color: string }> = {
  sensor: { icon: Activity, label: "Sensor", color: "text-sky-400" },
  history: { icon: Wrench, label: "History", color: "text-amber-300" },
  manual: { icon: BookOpen, label: "Manual", color: "text-violet-300" },
  parts: { icon: Package, label: "Parts", color: "text-emerald-400" },
};

/**
 * Every evidence item links to real data:
 * sensor → highlight on the chart, manual → manual modal, history → maintenance record, parts → stock popover.
 */
export function EvidenceList({
  alert,
  onHighlight,
  onOpenManual,
  onOpenHistory,
}: {
  alert: Alert;
  onHighlight: (h: Highlight) => void;
  onOpenManual: (sectionId: string) => void;
  onOpenHistory: (recordId: string) => void;
}) {
  const [openPart, setOpenPart] = useState<string | null>(null);
  const evidence = alert.diagnosis?.evidence ?? [];

  function onClick(e: Evidence) {
    switch (e.kind) {
      case "sensor": {
        const c = alert.event.contributions.find((x) => x.signal === e.ref);
        onHighlight({ signal: e.ref, from: c?.deviating_since ?? alert.event.first_deviation_at, to: alert.event.detected_at });
        break;
      }
      case "manual":
        onOpenManual(e.ref);
        break;
      case "history":
        onOpenHistory(e.ref);
        break;
      case "parts":
        setOpenPart((p) => (p === e.ref ? null : e.ref));
        break;
    }
  }

  return (
    <ul className="space-y-1.5">
      {evidence.map((e) => {
        const k = KIND[e.kind];
        const Icon = k.icon;
        const key = `${e.kind}-${e.ref}`;
        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onClick(e)}
              title={e.kind === "sensor" ? "Show on the chart" : `Open ${k.label.toLowerCase()} reference`}
              className="group flex w-full items-start gap-2.5 rounded-lg border border-zinc-800 bg-zinc-800/40 px-2.5 py-2 text-left hover:border-zinc-600 hover:bg-zinc-800"
            >
              <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", k.color)} aria-label={k.label} />
              <div className="min-w-0 flex-1">
                <span className="mb-0.5 inline-block rounded bg-zinc-950/70 px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">{e.ref}</span>
                <p className="text-sm leading-snug text-zinc-300">{e.detail}</p>
              </div>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600 group-hover:text-zinc-300" />
            </button>
            {e.kind === "parts" && openPart === e.ref && <PartPopover alert={alert} evidence={e} />}
          </li>
        );
      })}
    </ul>
  );
}

function PartPopover({ alert, evidence }: { alert: Alert; evidence: Evidence }) {
  const line = alert.diagnosis?.parts.find((p) => p.part_no === evidence.ref);
  // The contract has no stock location field; the evidence text usually names it ("Store B-14").
  const location = evidence.detail.match(/Store [A-Z]-\d+/)?.[0];
  return (
    <div className="ml-7 mt-1 grid grid-cols-3 gap-2 rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-xs">
      <div>
        <div className="text-zinc-500">In stock</div>
        <div className={clsx("font-semibold tabular-nums", line?.in_stock ? "text-emerald-400" : "text-red-400")}>{line?.in_stock ?? "–"}</div>
      </div>
      <div>
        <div className="text-zinc-500">Lead time</div>
        <div className="font-semibold tabular-nums text-zinc-200">{line?.lead_time_days != null ? `${line.lead_time_days} days` : "–"}</div>
      </div>
      <div>
        <div className="text-zinc-500">Location</div>
        <div className="font-semibold text-zinc-200">{location ?? "–"}</div>
      </div>
      {line && <div className="col-span-3 text-zinc-400">{line.name}</div>}
    </div>
  );
}
