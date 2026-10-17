import clsx from "clsx";
import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import { STEPS } from "../../lib/uiTypes";

/**
 * The incident steps as big tabs, over one bright progress line.
 * The line glides to the middle of the current tab (it grows from 0 when the incident opens),
 * and a soft highlight keeps running along it. Done steps get a check, locked steps are dimmed.
 */
export function Stepper({ step, isEnabled, onStep }: { step: number; isEnabled: (i: number) => boolean; onStep: (i: number) => void }) {
  const target = ((step + 0.5) / STEPS.length) * 100;
  // Start at 0 and move on the next frame, so the CSS transition also plays on open.
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(target));
    return () => cancelAnimationFrame(id);
  }, [target]);

  return (
    <div>
      <ol className="grid grid-cols-5">
        {STEPS.map((s, i) => {
          const enabled = isEnabled(i);
          const done = i < step;
          const current = i === step;
          return (
            <li key={s.title}>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => onStep(i)}
                aria-current={current ? "step" : undefined}
                className={clsx(
                  "flex w-full items-center justify-center gap-2.5 rounded-t-xl py-3.5 text-base transition-colors",
                  current && "bg-white/[0.04]",
                  enabled ? "hover:bg-white/[0.06]" : "cursor-not-allowed opacity-40",
                )}
              >
                <span
                  className={clsx(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors duration-500",
                    current && "border-sky-400 bg-sky-500 text-white shadow-[0_0_14px_rgba(56,189,248,0.55)]",
                    done && "border-sky-400/60 bg-sky-500/15 text-sky-300",
                    !current && !done && "border-white/10 text-zinc-500",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span className={clsx("font-medium", current ? "text-zinc-50" : done ? "text-zinc-300" : "text-zinc-500")}>{s.title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="relative h-[3px] rounded-full bg-white/10">
        <div
          className="absolute inset-y-0 left-0 overflow-hidden rounded-full bg-gradient-to-r from-sky-600 via-sky-400 to-cyan-300 shadow-[0_0_12px_rgba(56,189,248,0.7)] transition-[width] duration-[1200ms] ease-in-out motion-reduce:transition-none"
          style={{ width: `${fill}%` }}
        >
          <div className="absolute inset-y-0 left-0 w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/80 to-transparent motion-reduce:hidden" />
        </div>
        <div
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200 shadow-[0_0_10px_3px_rgba(103,232,249,0.6)] transition-[left] duration-[1200ms] ease-in-out motion-reduce:transition-none"
          style={{ left: `${fill}%` }}
        />
      </div>
    </div>
  );
}
