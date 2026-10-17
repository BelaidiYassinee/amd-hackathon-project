import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import { TONE, type Tone } from "../../lib/progress";

/** One headline number on a glass tile: icon + label, the value in its tone colour, a one-line hint. */
export function Kpi({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: number | string; hint: string; tone: Tone }) {
  const t = TONE[tone];
  return (
    <div className="glass rounded-2xl px-5 py-4">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <span className={clsx("flex h-6 w-6 items-center justify-center rounded-lg", t.bg, t.text)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        {label}
      </div>
      <div className={clsx("mt-2 text-3xl font-semibold tabular-nums", tone === "zinc" ? "text-zinc-100" : t.text)}>{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>
    </div>
  );
}
