import type {
  AckRequest, Alert, AmdStats, ControlRequest, InjectRequest, MaintenanceRecord, ManualSection,
  Person, PlantState, ReplaceAnalysis, ReplaceRequest, ResolveRequest, Series,
} from "./types";
import { mock } from "./mocks";

export const MOCK = import.meta.env.VITE_MOCK === "1";

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`/api${path}`);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const r = await fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

// In mock mode every call returns fixture data; mutations return the fixture unchanged.
export const api = {
  plant: () => (MOCK ? mock.plant() : get<PlantState>("/plant")),
  series: (id: string, hours = 24) => (MOCK ? mock.series(id, hours) : get<Series>(`/machines/${id}/series?hours=${hours}&max_points=600`)),
  alerts: () => (MOCK ? mock.alerts() : get<Alert[]>("/alerts")),
  ack: (id: string, body: AckRequest) => (MOCK ? mock.alert(id) : post<Alert>(`/alerts/${id}/ack`, body)),
  resolve: (id: string, body: ResolveRequest) => (MOCK ? mock.alert(id) : post<Alert>(`/alerts/${id}/resolve`, body)),
  people: () => (MOCK ? mock.people() : get<Person[]>("/people")),
  manual: (sectionId: string) => (MOCK ? mock.manual(sectionId) : get<ManualSection>(`/manual/${sectionId}`)),
  maintenance: (machineId: string) => (MOCK ? mock.maintenance(machineId) : get<MaintenanceRecord[]>(`/maintenance/${machineId}`)),
  amdStats: () => (MOCK ? mock.amdStats() : get<AmdStats>("/amd/stats")),
  inject: (body: InjectRequest) => (MOCK ? mock.plant() : post<PlantState>("/demo/inject", body)),
  control: (body: ControlRequest) => (MOCK ? mock.plant() : post<PlantState>("/demo/control", body)),
  reset: (seed = 7) => (MOCK ? mock.plant() : post<PlantState>("/demo/reset", { seed })),
  replaceAnalysis: (id: string, body: ReplaceRequest) =>
    MOCK ? mock.replaceAnalysis(id) : post<ReplaceAnalysis>(`/machines/${id}/replace-analysis`, body),
};
