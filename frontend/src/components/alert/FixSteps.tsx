import { useEffect, useState } from "react";
import clsx from "clsx";
import { RefText } from "./RefText";

/** Numbered checklist. Checkbox state is local only (reset when the alert changes). */
export function FixSteps({ alertId, steps, onOpenManual }: { alertId: string; steps: string[]; onOpenManual: (id: string) => void }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  useEffect(() => setDone(new Set()), [alertId]);

  function toggle(i: number) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-1 shrink-0 accent-emerald-500" checked={done.has(i)} onChange={() => toggle(i)} aria-label={`Step ${i + 1} done`} />
          <span className="mt-0.5 w-4 shrink-0 text-right text-xs tabular-nums text-zinc-500">{i + 1}.</span>
          <span className={clsx("leading-snug", done.has(i) ? "text-zinc-500 line-through" : "text-zinc-300")}>
            <RefText text={s} onOpenManual={onOpenManual} />
          </span>
        </li>
      ))}
    </ol>
  );
}
