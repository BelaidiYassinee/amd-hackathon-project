// Frontend-only UI state types (the API contract lives in ../types.ts).
import type { Alert } from "../types";

/** Set by clicking sensor evidence: highlights a time window on one signal's chart. */
export interface Highlight {
  signal: string;
  from: string; // ISO time
  to: string; // ISO time
}

export type Drawer = "trace" | "amd" | null;

/** Header tabs. An open incident covers either one. */
export type View = "overview" | "factory";

/** The incident flow, in order. `title` is the stepper label; `heading`/`hint` explain the screen in plain words. */
export const STEPS = [
  { title: "Detect", heading: "The AI spotted it early", hint: "Signals drifted away from their learned normal long before any fixed alarm." },
  { title: "Diagnose", heading: "What's wrong, and why", hint: "The AI agent investigated on AMD. Every claim links to real plant data." },
  { title: "Assign", heading: "Who fixes it", hint: "The alert went to the on-shift technician responsible for this machine." },
  { title: "Fix", heading: "How to fix it", hint: "Step-by-step procedure, the parts to grab, and safety first." },
  { title: "Decide", heading: "Repair or replace?", hint: "5-year cost of keeping this pump against buying a new one." },
] as const;

/** Steps after Diagnose need the AI's diagnosis. */
export function isStepEnabled(alert: Alert, i: number): boolean {
  return i <= 1 || alert.diagnosis != null;
}
