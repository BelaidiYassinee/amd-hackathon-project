import { useEffect, useMemo, useRef } from "react";
import type { Series, SignalSpec } from "../../types";
import type { Highlight } from "../../lib/uiTypes";
import { simClock } from "../../lib/format";
import { AnomalyScoreChart } from "./AnomalyScoreChart";
import { SignalChart, type ChartRow } from "./SignalChart";
import { MARKER_STYLES } from "./markers";

/** Marker legend: "AI detected · 09:40", "Legacy alarm · 02:20"… */
export function MarkerLegend({ series }: { series: Series | null }) {
  const markers = (series?.markers ?? []).filter((m) => MARKER_STYLES[m.kind].label);
  if (markers.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
      {markers.map((m) => {
        const s = MARKER_STYLES[m.kind];
        return (
          <span key={`${m.kind}-${m.t}`} className="flex items-center gap-1.5" title={m.label}>
            <span className="inline-block h-3 rounded-full" style={{ width: Math.max(2, s.width), background: s.color }} />
            {s.label} · {simClock(m.t)}
          </span>
        );
      })}
    </div>
  );
}

/** Small-multiple signal charts + the anomaly score chart, sharing one time axis. */
export function ChartStack({
  series,
  signals,
  highlight,
  fill = false,
}: {
  series: Series;
  signals: SignalSpec[];
  highlight: Highlight | null;
  /** Share the parent's height (no inner scrolling) instead of fixed chart heights. */
  fill?: boolean;
}) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const data = useMemo<ChartRow[]>(
    () => series.points.map((p) => ({ tms: Date.parse(p.t), ...p.values, score: p.score }) as ChartRow),
    [series],
  );
  const withDayTicks = data.length > 1 && data[data.length - 1].tms - data[0].tms > 24 * 3_600_000;

  useEffect(() => {
    if (highlight) highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [highlight]);

  if (data.length === 0) return <div className="flex h-40 items-center justify-center text-sm text-zinc-500">No data yet.</div>;

  return (
    <div className={fill ? "flex h-full flex-col gap-2" : "flex flex-col gap-2"}>
      {signals.map((s, i) => {
        const hl = highlight?.signal === s.name ? { from: Date.parse(highlight.from), to: Date.parse(highlight.to) } : null;
        return (
          <SignalChart
            key={s.name}
            ref={hl ? highlightRef : undefined}
            data={data}
            signal={s}
            markers={series.markers}
            isTop={i === 0}
            withDayTicks={withDayTicks}
            highlight={hl}
            fill={fill}
          />
        );
      })}
      <AnomalyScoreChart data={data} limit={series.ewma_limit} markers={series.markers} withDayTicks={withDayTicks} fill={fill} />
    </div>
  );
}
