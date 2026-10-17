// Frontend-only UI state types (the API contract lives in ../types.ts).
import type { Alert } from "../types";

/** Set by clicking sensor evidence: highlights a time window on one signal's chart. */
export interface Highlight {
  signal: string;
  from: string; // ISO time
  to: string; // ISO time
}

export type Drawer = "trace" | "amd" | null;

export interface StepInfo {
  title: string;
  heading: string;
  hint: string;
}

/**
 * The incident flow, in order. `title` is the stepper label; `heading`/`hint` explain the screen in plain words.
 * The last step follows the repair-or-replace decision: Fix to repair, Order to replace (see stepsFor).
 */
export const STEPS: StepInfo[] = [
  { title: "Detect", heading: "The AI spotted it early", hint: "Signals drifted away from their learned normal long before any fixed alarm." },
  { title: "Diagnose", heading: "What's wrong, and why", hint: "The AI agent investigated on AMD. Every claim links to real plant data." },
  { title: "Assign", heading: "Who fixes it", hint: "The alert went to the on-shift technician responsible for this machine." },
  { title: "Decide", heading: "Repair or replace?", hint: "5-year cost of keeping this pump against buying a new one." },
  { title: "Fix", heading: "How to fix it", hint: "Step-by-step procedure, the parts to grab, and safety first." },
];

export const DECIDE_STEP = 3;
export const LAST_STEP = 4;

const ORDER_STEP: StepInfo = {
  title: "Order",
  heading: "Order the replacement",
  hint: "Replacing costs less over 5 years than repairing. The supervisor places the order with the recommended supplier.",
};

/** The steps for an incident: the last one is Order when the machine is being replaced. */
export function stepsFor(choice: "repair" | "replace"): StepInfo[] {
  return choice === "replace" ? [...STEPS.slice(0, LAST_STEP), ORDER_STEP] : STEPS;
}

/** Steps after Diagnose need the AI's diagnosis. */
export function isStepEnabled(alert: Alert, i: number): boolean {
  return i <= 1 || alert.diagnosis != null;
}
