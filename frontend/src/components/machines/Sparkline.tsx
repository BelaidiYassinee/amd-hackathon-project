import clsx from "clsx";

/** Health sparkline on a fixed 0–100 scale, drawn as a plain SVG polyline in currentColor. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const w = 100;
  const h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (Math.max(0, Math.min(100, v)) / 100) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={clsx("h-7 w-full", className)} aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
