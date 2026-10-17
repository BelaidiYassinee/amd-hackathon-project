import clsx from "clsx";
import type { Series, SignalSpec } from "../../types";
import { fmtValue } from "../../lib/format";
import { Sparkline } from "./Sparkline";

/** "alarm" past a limit, "near" within 10% of it, otherwise "ok". */
function level(v: number | undefined, s: SignalSpec): "ok" | "near" | "alarm" {
  if (v === undefined) return "ok";
  const { alarm_high: hi, alarm_low: lo } = s;
  if ((hi != null && v > hi) || (lo != null && v < lo)) return "alarm";
  if ((hi != null && v >= hi - Math.abs(hi) * 0.1) || (lo != null && v <= lo + Math.abs(lo) * 0.1)) return "near";
  return "ok";
}

const LEVEL_COLOR = { ok: "text-zinc-300", near: "text-amber-400", alarm: "text-red-400" };
const LINE_COLOR = { ok: "text-sky-400/80", near: "text-amber-400", alarm: "text-red-400" };

/** Every signal of one machine: label, last-6-hours sparkline, live value coloured by its alarm limits. */
export function SignalList({ signals, latest, series }: { signals: SignalSpec[]; latest: Record<string, number>; series: Series | null }) {
  return (
    <ul className="divide-y divide-white/5">
      {signals.map((s) => {
        const v = latest[s.name];
        const lv = level(v, s);
        const history = series?.points.map((p) => p.values[s.name]).filter((x) => x !== undefined) ?? [];
        return (
          <li key={s.name} className="grid grid-cols-[minmax(0,1fr)_7rem_6.5rem] items-center gap-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm text-zinc-200">{s.label}</div>
              <div className="text-xs text-zinc-500">
                {s.alarm_low != null && `min ${fmtValue(s.alarm_low)}`}
                {s.alarm_low != null && s.alarm_high != null && " · "}
                {s.alarm_high != null && `max ${fmtValue(s.alarm_high)}`}
              </div>
            </div>
            <Sparkline values={history} className={clsx("h-7 w-full", LINE_COLOR[lv])} />
            <div className={clsx("text-right text-base font-semibold tabular-nums", LEVEL_COLOR[lv])}>
              {fmtValue(v)}
              <span className="ml-1 text-xs font-normal text-zinc-500">{s.unit}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
