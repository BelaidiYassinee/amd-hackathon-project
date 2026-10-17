import { api } from "../api";
import type { MachineSummary, PlantState, Series } from "../types";
import { prevention, type Prevention } from "../lib/preventive";
import { usePoll } from "./usePoll";

export interface MachinePrevention {
  machine: MachineSummary;
  series: Series;
  prevention: Prevention;
}

/** Levels that count as an early warning (drifting, no alert yet). */
export const EARLY_WARNING = new Set(["rising", "watch", "act_now"]);

/**
 * Early-warning level and suggested actions for every machine, recomputed on each poll.
 * Used app-wide, so the Plant chips, the header badge and the Prevent page always agree. Null until loaded.
 */
export function usePrevention(plant: PlantState | null): MachinePrevention[] | null {
  const ids = plant?.machines.map((m) => m.id) ?? [];
  const key = ids.join(",");
  // The detector's score over the last day, for all machines in one poll.
  const series = usePoll(() => Promise.all(ids.map((id) => api.series(id, 24))), 1500, [key], { keepData: true });
  const history = usePoll(() => Promise.all(ids.map((id) => api.maintenance(id))), 60000, [key], { keepData: true });

  // The first polls run before the plant is known: wait until every machine has its series and history.
  if (!plant || ids.length === 0 || series.data?.length !== ids.length || history.data?.length !== ids.length) return null;
  return plant.machines.map((m, i) => ({
    machine: m,
    series: series.data![i],
    prevention: prevention(m, series.data![i], history.data![i], plant.sim_time),
  }));
}
