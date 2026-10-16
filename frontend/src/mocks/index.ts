import type { Alert, AmdStats, MaintenanceRecord, ManualSection, Person, PlantState, ReplaceAnalysis, Series } from "../types";
import plantJson from "./plant.json";
import alertsJson from "./alerts.json";
import replaceJson from "./replace_P-101.json";
import amdJson from "./amd.json";
import peopleJson from "./people.json";
import manualJson from "./manual.json";
import maintenanceJson from "./maintenance_P-101.json";
import { makeSeries } from "./makeSeries";
import { applyMockState } from "./alertStates";

const plant = plantJson as unknown as PlantState;
const alerts = alertsJson as unknown as Alert[];

/** Resolve after a short delay with a copy, so callers can never mutate the fixtures. */
function reply<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms));
}

function notFound(what: string): Promise<never> {
  return Promise.reject(new Error(`404 ${what} not found (mock)`));
}

export const mock = {
  plant: () => reply(plant),
  series: (id: string, hours: number): Promise<Series> => {
    const m = plant.machines.find((x) => x.id === id);
    return m ? reply(makeSeries(m, hours)) : notFound(id);
  },
  alerts: () => reply(alerts).then(applyMockState),
  alert: (id: string) =>
    reply(alerts)
      .then(applyMockState)
      .then((list) => list.find((x) => x.id === id) ?? notFound(id)),
  people: () => reply(peopleJson as unknown as Person[]),
  manual: (sectionId: string) => {
    const s = (manualJson as ManualSection[]).find((x) => x.id === sectionId);
    return s ? reply(s) : notFound(sectionId);
  },
  maintenance: (machineId: string) =>
    reply(machineId === "P-101" ? (maintenanceJson as unknown as MaintenanceRecord[]) : []),
  amdStats: () => reply(amdJson as AmdStats),
  replaceAnalysis: (id: string) =>
    id === "P-101" ? reply(replaceJson as unknown as ReplaceAnalysis, 1500) : notFound(`replace analysis for ${id}`),
};
