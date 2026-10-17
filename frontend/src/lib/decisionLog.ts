// Frontend-only record of the repair-or-replace decision per incident, and the purchase task it creates.
// The backend only computes the analysis (POST /machines/{id}/replace-analysis); it stores no decision.
import type { Alert, ReplaceAnalysis, ReplaceOption } from "../types";
import { createPersistedStore } from "./persistedStore";

export interface PurchaseTask {
  assignee_id: string;
  created_at: string;
  done_at: string | null;
}

export interface Decision {
  alert_id: string;
  machine_id: string;
  machine_name: string;
  choice: "repair" | "replace";
  /** The option chosen: the catalog model for a replacement, "repair" otherwise. */
  option_id: string;
  label: string;
  capex_eur: number;
  lead_time_days: number;
  decided_at: string;
  /** Replacement only: the task for the supervisor to place the order. */
  order: PurchaseTask | null;
}

type Log = Record<string, Decision>;

const store = createPersistedStore<Decision>("maintenance-copilot.decisions.v1", 50);

// Same key as the step log: alert ids restart after a demo reset, the creation time tells runs apart.
export const decisionKey = (a: Alert) => `${a.id}@${a.created_at}`;

export function decisionOf(l: Log, a: Alert): Decision | null {
  return l[decisionKey(a)] ?? null;
}

export function allDecisions(l: Log): Decision[] {
  return Object.values(l);
}

/** The AI's recommended option of an analysis. */
export function recommended(r: ReplaceAnalysis | undefined): ReplaceOption | null {
  return r?.options.find((o) => o.option_id === r.recommendation) ?? null;
}

/** Repair, or replace with `option`. A new choice drops a purchase task made for an earlier one. */
export function decide(a: Alert, option: ReplaceOption, now: string) {
  const prev = decisionOf(store.get(), a);
  store.set(decisionKey(a), {
    alert_id: a.id,
    machine_id: a.machine_id,
    machine_name: a.machine_name,
    choice: option.kind,
    option_id: option.option_id,
    label: option.label,
    capex_eur: option.capex_eur,
    lead_time_days: option.lead_time_days,
    decided_at: now,
    order: prev?.option_id === option.option_id ? prev.order : null,
  });
}

/** Send the purchase task for the chosen replacement to `personId` (the supervisor). */
export function sendPurchaseTask(a: Alert, personId: string, now: string) {
  const d = decisionOf(store.get(), a);
  if (d?.choice === "replace") store.set(decisionKey(a), { ...d, order: { assignee_id: personId, created_at: now, done_at: null } });
}

export function setOrderPlaced(key: string, at: string | null) {
  const d = store.get()[key];
  if (d?.order) store.set(key, { ...d, order: { ...d.order, done_at: at } });
}

/** The whole log; re-renders when a decision changes. */
export function useDecisionLog(): Log {
  return store.use();
}
