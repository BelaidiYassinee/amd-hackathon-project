import { forwardRef } from "react";
import clsx from "clsx";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Marker, SignalSpec } from "../../types";
import { chartTick, fmtValue, simTime } from "../../lib/format";
import { ALARM_COLOR, AXIS_COLOR, GRID_COLOR, LINE_COLOR, MARKER_STYLES, Y_AXIS_WIDTH } from "./markers";

export type ChartRow = { tms: number; score: number } & Record<string, number>;

interface Props {
  data: ChartRow[];
  signal: SignalSpec;
  markers: Marker[];
  isTop: boolean;
  withDayTicks: boolean;
  highlight: { from: number; to: number } | null;
}

/** One small-multiple line chart for a single signal. All charts share syncId="machine". */
export const SignalChart = forwardRef<HTMLDivElement, Props>(function SignalChart(
  { data, signal, markers, isTop, withDayTicks, highlight },
  ref,
) {
  const latest = data.length ? data[data.length - 1][signal.name] : undefined;
  return (
    <div ref={ref} className={clsx("rounded-lg transition-colors", highlight && "bg-red-500/5 ring-1 ring-red-500/40")}>
      <div className="flex items-baseline justify-between px-1 text-xs">
        <span className="font-medium text-slate-300">
          {signal.label} <span className="text-slate-500">({signal.unit})</span>
        </span>
        <span className="tabular-nums text-slate-400">{fmtValue(latest, signal.unit)}</span>
      </div>
      <div style={{ height: 110 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} syncId="machine" margin={{ top: isTop ? 16 : 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} vertical={false} />
            <XAxis
              dataKey="tms"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              hide
              tickFormatter={(v: number) => chartTick(v, withDayTicks)}
              stroke={AXIS_COLOR}
              fontSize={11}
              minTickGap={40}
            />
            <YAxis width={Y_AXIS_WIDTH} domain={["auto", "auto"]} stroke={AXIS_COLOR} fontSize={11} tickFormatter={(v: number) => fmtValue(v)} />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#94a3b8" }}
              labelFormatter={(v) => simTime(new Date(Number(v)).toISOString())}
              formatter={(v) => [fmtValue(Number(v), signal.unit), signal.label]}
            />

            {signal.alarm_high != null && (
              <ReferenceLine
                y={signal.alarm_high}
                stroke={ALARM_COLOR}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{ value: "Alarm", position: "insideTopLeft", fill: ALARM_COLOR, fontSize: 10 }}
              />
            )}
            {signal.alarm_low != null && (
              <ReferenceLine
                y={signal.alarm_low}
                stroke={ALARM_COLOR}
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{ value: "Alarm", position: "insideBottomLeft", fill: ALARM_COLOR, fontSize: 10 }}
              />
            )}

            {highlight && <ReferenceArea x1={highlight.from} x2={highlight.to} fill={ALARM_COLOR} fillOpacity={0.15} ifOverflow="hidden" />}

            {markers.map((m) => {
              const s = MARKER_STYLES[m.kind];
              return (
                <ReferenceLine
                  key={`${m.kind}-${m.t}`}
                  x={Date.parse(m.t)}
                  stroke={s.color}
                  strokeWidth={s.width}
                  strokeDasharray={s.dash}
                  label={isTop && s.label ? { value: s.label, position: s.labelPos, fill: s.color, fontSize: 11, fontWeight: 600 } : undefined}
                />
              );
            })}

            <Line type="monotone" dataKey={signal.name} stroke={LINE_COLOR} strokeWidth={1.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
