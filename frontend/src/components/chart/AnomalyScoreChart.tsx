import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Marker } from "../../types";
import { chartTick, simTime } from "../../lib/format";
import type { ChartRow } from "./SignalChart";
import { AXIS_COLOR, GRID_COLOR, MARKER_STYLES, Y_AXIS_WIDTH } from "./markers";

const RED = "#ef4444";
const BLUE = "#38bdf8";

/** AI anomaly score with the "AI alert limit". The area turns red above the limit. */
export function AnomalyScoreChart({
  data,
  limit,
  markers,
  withDayTicks,
  fill,
}: {
  data: ChartRow[];
  limit: number;
  markers: Marker[];
  withDayTicks: boolean;
  fill?: boolean;
}) {
  const scores = data.map((d) => d.score);
  const max = Math.max(...scores, 0);
  const min = Math.min(...scores, 0);
  const yMax = Math.ceil(Math.max(max, limit * 1.15) * 2) / 2; // round up to the next 0.5 for clean ticks

  // Gradients are relative to each shape's bounding box: the area spans max..0, the stroke spans max..min.
  const areaSplit = max > limit ? (max - limit) / (max || 1) : 0;
  const lineSplit = max > limit ? (max - limit) / (max - min || 1) : 0;

  return (
    <div className={fill ? "flex min-h-[90px] flex-[1.3] flex-col" : undefined}>
      <div className="flex items-baseline justify-between px-1 text-xs">
        <span className="font-medium text-zinc-300">
          AI anomaly score <span className="text-zinc-500">(max |EWMA z| over all signals)</span>
        </span>
        <span className="tabular-nums" style={{ color: max > limit ? RED : "#a1a1aa" }}>
          {data.length ? data[data.length - 1].score.toFixed(2) : "–"}
        </span>
      </div>
      <div className={fill ? "min-h-0 flex-1" : undefined} style={fill ? undefined : { height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} syncId="machine" margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor={RED} stopOpacity={0.5} />
                <stop offset={areaSplit} stopColor={RED} stopOpacity={0.5} />
                <stop offset={areaSplit} stopColor={BLUE} stopOpacity={0.18} />
                <stop offset={1} stopColor={BLUE} stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="scoreStroke" x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor={RED} />
                <stop offset={lineSplit} stopColor={RED} />
                <stop offset={lineSplit} stopColor={BLUE} />
                <stop offset={1} stopColor={BLUE} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="tms"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v: number) => chartTick(v, withDayTicks)}
              stroke={AXIS_COLOR}
              fontSize={11}
              minTickGap={40}
            />
            <YAxis width={Y_AXIS_WIDTH} domain={[0, yMax]}
              ticks={Array.from({ length: Math.round(yMax / 0.5) + 1 }, (_, i) => i * 0.5)} stroke={AXIS_COLOR} fontSize={11} tickFormatter={(v: number) => v.toFixed(1)} />
            <Tooltip
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#a1a1aa" }}
              labelFormatter={(v) => simTime(new Date(Number(v)).toISOString())}
              formatter={(v) => [Number(v).toFixed(2), "Anomaly score"]}
            />
            <ReferenceLine
              y={limit}
              stroke={RED}
              strokeDasharray="6 4"
              label={{ value: "AI alert limit", position: "insideTopLeft", fill: RED, fontSize: 11 }}
            />
            {markers.map((m) => {
              const s = MARKER_STYLES[m.kind];
              return <ReferenceLine key={`${m.kind}-${m.t}`} x={Date.parse(m.t)} stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash} />;
            })}
            <Area
              type="monotone"
              dataKey="score"
              stroke="url(#scoreStroke)"
              strokeWidth={1.5}
              fill="url(#scoreFill)"
              baseValue={0}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
