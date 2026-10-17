/** Tiny line chart: plain SVG, stretched to its box. Draws nothing until there are two points. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return <svg className={className} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 100},${22 - ((v - min) / span) * 20}`).join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className={className} aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
