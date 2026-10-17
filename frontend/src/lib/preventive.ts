// Preventive maintenance: spot a machine that is starting to drift, before the AI raises an alert, and suggest what to do.
// Built only from what the backend already sends: the AI detector's anomaly score, the live signals and the
// maintenance history. No LLM call is involved.
import type { MachineSummary, MaintenanceRecord, Series } from "../types";
import { SIGNAL_ZONE, ZONE_LABEL } from "../components/factory/faultZone";
import { modelName } from "../components/factory/machineModel";

export type Risk = "healthy" | "rising" | "watch" | "act_now" | "incident";

export const RISK: Record<Risk, { label: string; rank: number }> = {
  incident: { label: "Active incident", rank: 4 },
  act_now: { label: "Act now", rank: 3 },
  watch: { label: "Watch", rank: 2 },
  rising: { label: "Rising", rank: 1 },
  healthy: { label: "Healthy", rank: 0 },
};

const H = 3_600_000;
const DAY = 24 * H;
const ms = (iso: string) => Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);

// ---------- condition: the anomaly score and the drifting signals ----------

export interface RiskInfo {
  level: Risk;
  /** Mean anomaly score over the last 30 min, as a share of the alarm limit (1 = the AI raises an alert). */
  ratio: number;
  scores: number[];
}

// Measured on the live simulator: a healthy machine's 30-min score can reach ~80% of the limit, and a healthy signal
// can drift ~2.5σ, but never both at once. Injected bearing wear showed both (61%, HF vibration 2.5σ) about 55
// sim-minutes before the alert. So a machine is only at risk when the score is up AND a signal is drifting.
const LEVELS = { rising: 0.55, watch: 0.75, act_now: 0.9 };
const WINDOW = 6; // samples, 5 sim-minutes each

export function riskOf(machine: MachineSummary, series: Series | null, drifts: Drift[]): RiskInfo {
  const pts = series?.points ?? [];
  const limit = series?.ewma_limit || 1;
  const scores = pts.map((p) => p.score);
  const recent = scores.slice(-WINDOW);
  const ratio = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length / limit : 0;
  const last = (scores.at(-1) ?? 0) / limit;

  let level: Risk = "healthy";
  if (machine.active_alert_id) level = "incident";
  else if (machine.status === "down") level = "act_now";
  else if (drifts.length > 0 && ratio >= LEVELS.rising) {
    level = ratio >= LEVELS.act_now || last >= 1 ? "act_now" : ratio >= LEVELS.watch ? "watch" : "rising";
  }
  return { level, ratio, scores };
}

export interface Drift {
  signal: string;
  label: string;
  /** Distance of the last 30 min from the signal's own normal, in standard deviations. */
  z: number;
}

/** Signals whose last 30 min sit far from their normal (the first 75% of the window). Strongest first. */
export function driftingSignals(series: Series | null, minZ = 2): Drift[] {
  const pts = series?.points ?? [];
  if (pts.length < 48) return [];
  const cut = Math.floor(pts.length * 0.75);
  const base = pts.slice(0, cut);
  const last30 = pts.slice(-WINDOW);
  const out: Drift[] = [];
  for (const s of series!.signals) {
    const b = base.map((p) => p.values[s.name]).filter((v) => v !== undefined);
    const r = last30.map((p) => p.values[s.name]).filter((v) => v !== undefined);
    if (b.length < 10 || r.length < 3) continue;
    const mean = b.reduce((a, v) => a + v, 0) / b.length;
    const std = Math.sqrt(b.reduce((a, v) => a + (v - mean) ** 2, 0) / b.length);
    const z = (r.reduce((a, v) => a + v, 0) / r.length - mean) / Math.max(std, Math.abs(mean) * 0.01, 1e-6);
    if (Math.abs(z) >= minZ) out.push({ signal: s.name, label: s.label, z });
  }
  return out.sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 3);
}

// ---------- the playbook: what to check, per machine kind and part ----------

interface PlayAction {
  id: string;
  text: string;
  /** Manual section; only shown for machines whose manual is loaded (P-101). */
  ref?: string;
}

const PLAYBOOK: Record<string, Record<string, PlayAction[]>> = {
  pump: {
    bearing: [
      { id: "bearing-confirm", text: "Confirm the bearing condition with the handheld vibration analyser", ref: "P101-TS-01" },
      { id: "bearing-grease", text: "Re-grease both bearings with EP2 grease", ref: "P101-PR-03" },
      { id: "bearing-oil", text: "Check the oil sight glass and the bearing housing temperature by hand" },
    ],
    casing: [
      { id: "casing-strainer", text: "Inspect and clean the suction strainer", ref: "P101-PR-04" },
      { id: "casing-suction", text: "Check the suction valve is fully open and the tank level is normal" },
    ],
    coupling: [
      { id: "coupling-align", text: "Run a laser shaft alignment check", ref: "P101-PR-02" },
      { id: "coupling-element", text: "Inspect the coupling element for wear or cracks" },
    ],
    motor: [
      { id: "motor-cooling", text: "Clean the motor fan cover and cooling fins", ref: "P101-PR-05" },
      { id: "motor-electrical", text: "Measure insulation resistance and the phase current balance", ref: "P101-PR-05" },
    ],
  },
  compressor: {
    airend: [
      { id: "airend-vibration", text: "Take a vibration reading on the air end bearings" },
      { id: "airend-filter", text: "Check the air intake filter and the inlet valve" },
    ],
    separator: [
      { id: "separator-oil", text: "Check the oil level and the oil temperature after the cooler" },
      { id: "separator-dp", text: "Check the pressure drop across the oil separator" },
    ],
    coupling: [{ id: "coupling-align", text: "Check the motor to air end alignment and coupling" }],
    motor: [
      { id: "motor-cooling", text: "Clean the motor fan cover and cooling fins" },
      { id: "motor-electrical", text: "Measure insulation resistance and the phase current balance" },
    ],
  },
  conveyor: {
    gearbox: [
      { id: "gearbox-oil", text: "Check the gearbox oil level and look for leaks" },
      { id: "gearbox-vibration", text: "Take a vibration reading on the gearbox and drum shaft bearings" },
    ],
    belt: [
      { id: "belt-tension", text: "Check belt tension and tracking" },
      { id: "belt-drums", text: "Inspect the head and tail drums for build-up or slip" },
    ],
    motor: [
      { id: "motor-cooling", text: "Clean the motor fan cover and cooling fins" },
      { id: "motor-electrical", text: "Measure insulation resistance and the phase current balance" },
    ],
  },
};

const GENERAL: PlayAction = { id: "general-route", text: "Walk a full inspection route: listen, feel for heat, check all readings on site" };

// ---------- the maintenance plan: recurring tasks, checked against the history ----------

interface PmTask {
  id: string;
  title: string;
  intervalDays: number;
  /** Matches history titles of this task. */
  match: RegExp;
  ref?: string;
}

const PM_PLAN: Record<string, PmTask[]> = {
  // Re-greasing every 2,000 operating hours (P101-PR-03), about 4 months at 6,000 h a year.
  pump: [
    { id: "pm-grease", title: "Bearing re-greasing", intervalDays: 120, match: /re-?greas/i, ref: "P101-PR-03" },
    { id: "pm-route", title: "Quarterly vibration route", intervalDays: 91, match: /vibration route/i },
    { id: "pm-yearly", title: "Yearly inspection", intervalDays: 365, match: /yearly inspection|commissioning/i },
  ],
  compressor: [
    { id: "pm-filter", title: "Air intake filter change", intervalDays: 182, match: /filter/i },
    { id: "pm-oil", title: "Oil change and oil separator", intervalDays: 365, match: /oil change|separator/i },
    { id: "pm-yearly", title: "Yearly inspection", intervalDays: 365, match: /yearly inspection/i },
  ],
  conveyor: [
    { id: "pm-grease", title: "Bearing re-greasing and belt tension check", intervalDays: 120, match: /re-?greas|belt tension/i },
    { id: "pm-gearbox", title: "Gearbox oil change", intervalDays: 365, match: /gearbox oil/i },
    { id: "pm-yearly", title: "Yearly inspection", intervalDays: 365, match: /yearly inspection/i },
  ],
};

const DUE_SOON_DAYS = 14;

export interface PmState {
  task: PmTask;
  lastDone: string | null;
  nextDue: string | null;
  /** Negative when overdue. Null when there is no record of the task. */
  daysLeft: number | null;
  status: "overdue" | "due_soon" | "ok" | "unknown";
  /** A skip recorded after the last time it was done. */
  missedOn: string | null;
}

export function pmStatus(machineId: string, history: MaintenanceRecord[], now: string): PmState[] {
  return (PM_PLAN[modelName(machineId)] ?? []).map((task) => {
    const matching = history.filter((r) => task.match.test(r.title)).sort((a, b) => a.date.localeCompare(b.date));
    const done = matching.filter((r) => r.type === "preventive" || r.type === "inspection");
    const lastDone = done.at(-1)?.date ?? null;
    const missed = matching.filter((r) => r.type === "missed_pm" && (!lastDone || r.date > lastDone)).at(-1);
    if (!lastDone) return { task, lastDone, nextDue: null, daysLeft: null, status: "unknown", missedOn: missed?.date ?? null };
    const due = ms(lastDone) + task.intervalDays * DAY;
    const daysLeft = Math.round((due - ms(now)) / DAY);
    const status = daysLeft < 0 ? "overdue" : daysLeft <= DUE_SOON_DAYS ? "due_soon" : "ok";
    return { task, lastDone, nextDue: new Date(due).toISOString().slice(0, 10), daysLeft, status, missedOn: missed?.date ?? null };
  });
}

// ---------- putting it together ----------

const dateFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
export const dateLabel = (iso: string) => dateFormat.format(new Date(ms(iso)));

export interface Suggestion {
  /** Stable per machine, so an assignment survives the next poll. */
  id: string;
  text: string;
  ref: string | null;
  /** Why it is suggested, in a few words. */
  reason: string;
  kind: "condition" | "plan";
  urgency: number;
}

export interface Evidence {
  text: string;
  tone: "amber" | "red" | "sky";
}

export interface Prevention {
  risk: RiskInfo;
  drifts: Drift[];
  /** Parts the drifting signals point to (model zone names), for the amber tint. */
  zones: string[];
  pm: PmState[];
  evidence: Evidence[];
  suggestions: Suggestion[];
}

/** Machines with the manual loaded in the backend: their actions get manual chips. */
const HAS_MANUAL = new Set(["P-101"]);

export function prevention(machine: MachineSummary, series: Series | null, history: MaintenanceRecord[], now: string): Prevention {
  const model = modelName(machine.id);
  const allDrifts = machine.active_alert_id ? [] : driftingSignals(series);
  const risk = riskOf(machine, series, allDrifts);
  const atRisk = risk.level !== "healthy" && risk.level !== "incident";
  const drifts = atRisk ? allDrifts : [];
  const zones = [...new Set(drifts.map((d) => SIGNAL_ZONE[model]?.[d.signal]).filter((z): z is string => !!z))];
  const pm = pmStatus(machine.id, history, now);
  const ref = (r?: string) => (r && HAS_MANUAL.has(machine.id) ? r : null);

  const evidence: Evidence[] = [];
  if (atRisk) {
    evidence.push({
      text: `Anomaly score averaging ${Math.round(risk.ratio * 100)}% of the alarm limit (last 30 min)`,
      tone: risk.level === "act_now" ? "red" : "amber",
    });
    for (const d of drifts) evidence.push({ text: `${d.label} ${d.z > 0 ? "above" : "below"} its normal (${Math.abs(d.z).toFixed(1)}σ)`, tone: "amber" });
  }
  for (const p of pm) {
    if (p.missedOn) evidence.push({ text: `${p.task.title} skipped on ${dateLabel(p.missedOn)}`, tone: "red" });
    else if (p.status === "overdue") evidence.push({ text: `${p.task.title} ${-p.daysLeft!} days overdue`, tone: "amber" });
  }

  const suggestions: Suggestion[] = [];
  if (atRisk) {
    const base = RISK[risk.level].rank * 10;
    const plays = zones.flatMap((z) => (PLAYBOOK[model]?.[z] ?? []).map((a) => ({ a, z })));
    for (const { a, z } of plays.length ? plays : [{ a: GENERAL, z: "" }]) {
      suggestions.push({
        id: `cond:${a.id}`,
        text: a.text,
        ref: ref(a.ref),
        reason: z ? `${ZONE_LABEL[z] ?? z} drifting` : "Anomaly score rising",
        kind: "condition",
        urgency: base,
      });
    }
  }
  for (const p of pm) {
    if (p.status !== "overdue" && p.status !== "due_soon" && !p.missedOn) continue;
    suggestions.push({
      id: p.task.id,
      text: p.task.title,
      ref: ref(p.task.ref),
      reason: p.missedOn
        ? `Skipped on ${dateLabel(p.missedOn)}`
        : p.daysLeft! < 0
          ? `${-p.daysLeft!} days overdue`
          : `Due in ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"}`,
      kind: "plan",
      urgency: p.missedOn || p.status === "overdue" ? 15 : 5,
    });
  }
  // The same check can come from two drifting parts: keep the first.
  const seen = new Set<string>();
  const unique = suggestions.filter((s) => !seen.has(s.id) && seen.add(s.id));
  unique.sort((a, b) => b.urgency - a.urgency);

  return { risk, drifts, zones, pm, evidence, suggestions: unique };
}
