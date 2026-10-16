import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReplaceOption } from "../../types";
import { eur } from "../../lib/format";

// Categorical slots 1–4 (dark steps), validated as a set against the slate-900 card surface.
const SEGMENTS = [
  { key: "capex_eur", label: "Upfront", color: "#3987e5" },
  { key: "energy_eur_5y", label: "Energy 5y", color: "#d95926" },
  { key: "maintenance_eur_5y", label: "Maintenance 5y", color: "#199e70" },
  { key: "downtime_eur_5y", label: "Downtime 5y", color: "#c98500" },
] as const;
const SURFACE = "#0f172a"; // 2px gap between stacked segments
const kEur = (v: number) => `€${Math.round(v / 1000)}k`;

/** Stacked horizontal bars: where each option's 5-year cost comes from. */
export function CostChart({ options }: { options: ReplaceOption[] }) {
  const data = options.map((o) => ({ ...o, name: o.fits_duty ? o.label : `${o.label} (doesn't meet duty)` }));
  return (
    <div style={{ height: 60 + options.length * 52 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 8 }} barCategoryGap={12}>
          <CartesianGrid stroke="#1e293b" horizontal={false} />
          <XAxis type="number" tickFormatter={kEur} stroke="#64748b" fontSize={11} />
          <YAxis type="category" dataKey="name" width={260} stroke="#64748b" fontSize={12} tick={{ fill: "#cbd5e1" }} />
          <Tooltip
            cursor={{ fill: "rgba(148,163,184,0.08)" }}
            contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
            itemStyle={{ color: "#cbd5e1" }}
            formatter={(v, name) => [eur(Number(v)), name]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#cbd5e1" }}
            iconType="square"
            // Keep stacking order (Recharts sorts alphabetically by default).
            itemSorter={(item) => SEGMENTS.findIndex((s) => s.label === item.value)}
          />
          {SEGMENTS.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="tco"
              fill={s.color}
              stroke={SURFACE}
              strokeWidth={2}
              radius={i === SEGMENTS.length - 1 ? [0, 4, 4, 0] : 0}
              isAnimationActive={false}
            >
              {i === SEGMENTS.length - 1 && (
                <LabelList dataKey="tco_5y_eur" position="right" formatter={(v) => eur(Number(v))} fill="#e2e8f0" fontSize={12} fontWeight={600} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
