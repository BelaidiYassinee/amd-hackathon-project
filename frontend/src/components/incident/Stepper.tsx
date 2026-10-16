import clsx from "clsx";
import { Check } from "lucide-react";
import { STEPS } from "../../lib/uiTypes";

/** Clickable progress: done steps get a check, the current step is highlighted, locked steps are dimmed. */
export function Stepper({ step, isEnabled, onStep }: { step: number; isEnabled: (i: number) => boolean; onStep: (i: number) => void }) {
  return (
    <ol className="flex items-center">
      {STEPS.map((s, i) => {
        const enabled = isEnabled(i);
        const done = i < step;
        const current = i === step;
        return (
          <li key={s.title} className={clsx("flex items-center", i < STEPS.length - 1 && "flex-1")}>
            <button
              type="button"
              disabled={!enabled}
              onClick={() => onStep(i)}
              className={clsx("flex items-center gap-2 rounded-full py-1 pr-2 text-sm", enabled ? "hover:text-zinc-100" : "cursor-not-allowed opacity-40")}
            >
              <span
                className={clsx(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold",
                  current && "border-sky-500 bg-sky-500 text-white",
                  done && "border-sky-500/60 bg-sky-500/15 text-sky-300",
                  !current && !done && "border-zinc-700 text-zinc-500",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={clsx("font-medium", current ? "text-zinc-100" : "text-zinc-400")}>{s.title}</span>
            </button>
            {i < STEPS.length - 1 && <span className={clsx("mx-2 h-px flex-1", done ? "bg-sky-500/50" : "bg-zinc-800")} />}
          </li>
        );
      })}
    </ol>
  );
}
