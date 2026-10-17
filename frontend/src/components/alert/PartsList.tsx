import type { PartLine } from "../../types";
import { Pill } from "../ui/Pill";

export function PartsList({ parts }: { parts: PartLine[] }) {
  if (parts.length === 0) return <div className="text-sm text-zinc-500">No parts needed.</div>;
  return (
    <ul className="space-y-1.5">
      {parts.map((p) => {
        const inStock = p.in_stock != null && p.in_stock >= p.qty;
        return (
          <li key={p.part_no} className="flex items-center gap-2 text-sm">
            <span className="shrink-0 rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[11px] text-zinc-200">{p.part_no}</span>
            <span className="min-w-0 flex-1 truncate text-zinc-300" title={p.name}>
              {p.qty} × {p.name}
            </span>
            {inStock ? (
              <Pill className="bg-emerald-500/15 text-emerald-300">In stock: {p.in_stock}</Pill>
            ) : (
              <Pill className="bg-red-500/15 text-red-300">Out of stock · {p.lead_time_days ?? "?"} days</Pill>
            )}
          </li>
        );
      })}
    </ul>
  );
}
