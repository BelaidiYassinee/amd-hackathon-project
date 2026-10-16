import type { MachineSummary, Marker, Series, SeriesPoint } from "../types";

const END = Date.parse("2026-10-15T09:40:00Z");
const STEP_MS = 5 * 60 * 1000;

/** Small deterministic PRNG so the mock chart doesn't jitter on every poll. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32 - 0.5; // -0.5 .. 0.5
  };
}

const P101_MARKERS: Marker[] = [
  { kind: "fault_injected", t: "2026-10-15T08:00:00Z", label: "Demo: bearing wear injected", signal: null },
  { kind: "ai_detected", t: "2026-10-15T09:40:00Z", label: "AI detected anomaly (EVT-0001)", signal: null },
];

/**
 * A realistic series ending at 09:40Z, one point every 5 minutes (24 h -> 288 points).
 * Every signal is base + noise. For P-101, vibration_hf rises +0.07 over the last 2 h
 * and the anomaly score ramps from ~0.2 to 1.62 over the last hour.
 */
export function makeSeries(machine: MachineSummary, hours: number): Series {
  const n = Math.round((hours * 60) / 5);
  const rand = rng(machine.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
  const isP101 = machine.id === "P-101";
  const points: SeriesPoint[] = [];

  for (let k = 0; k < n; k++) {
    const fromEnd = n - 1 - k; // 0 = last point
    const values: Record<string, number> = {};
    for (const s of machine.signals) {
      let base = machine.latest[s.name] ?? 1;
      if (isP101 && s.name === "vibration_hf") base = 0.3;
      let v = base + base * 0.015 * rand() * 2;
      if (isP101 && s.name === "vibration_hf" && fromEnd < 24) v += 0.07 * ((24 - fromEnd) / 24);
      values[s.name] = Number(v.toFixed(3));
    }
    values.load_pct = Number((78 + 4 * rand()).toFixed(1));

    let score = 0.2 + 0.08 * rand();
    if (isP101 && fromEnd < 12) score += (1.62 - 0.2) * ((12 - fromEnd) / 12);
    if (isP101 && fromEnd === 0) score = 1.62;

    points.push({ t: new Date(END - fromEnd * STEP_MS).toISOString().replace(".000Z", "Z"), values, score: Number(score.toFixed(3)) });
  }

  return {
    machine_id: machine.id,
    signals: machine.signals,
    ewma_limit: 1.5,
    points,
    markers: isP101 ? P101_MARKERS : [],
  };
}
