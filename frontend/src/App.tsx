import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { MOCK, api } from "./api";
import type { Alert, ReplaceAnalysis } from "./types";
import { DECIDE_STEP, LAST_STEP, STEPS, isStepEnabled, type Drawer, type Highlight } from "./lib/uiTypes";
import { isActive, stage } from "./lib/progress";
import { syncRun } from "./lib/persistedStore";
import { usePreventiveLog } from "./lib/preventiveLog";
import { useStepLog } from "./lib/stepLog";
import { decisionOf, useDecisionLog } from "./lib/decisionLog";
import { isOpen, teamTasks } from "./lib/team";
import { usePoll } from "./hooks/usePoll";
import { useAutoSelect } from "./hooks/useAutoSelect";
import { useHotkeys } from "./hooks/useHotkeys";
import { LEGACY_WORK_ORDERS, useRoute } from "./hooks/useRoute";
import { EARLY_WARNING, usePrevention } from "./hooks/usePrevention";
import { Header } from "./components/layout/Header";
import { Spinner } from "./components/ui/Spinner";
import { Toast } from "./components/ui/Toast";
import { TraceDrawer } from "./components/trace/TraceDrawer";
import { AmdPanel } from "./components/amd/AmdPanel";
import { TeamView, type TeamMode } from "./components/team/TeamView";

// Recharts and three.js are most of the bundle: load the heavy views as separate chunks.
const IncidentView = lazy(() => import("./components/incident/IncidentView").then((m) => ({ default: m.IncidentView })));
const FactoryView = lazy(() => import("./components/factory/FactoryView").then((m) => ({ default: m.FactoryView })));
const PreventView = lazy(() => import("./components/preventive/PreventView").then((m) => ({ default: m.PreventView })));

/** URL params for screenshots and design work; always null outside mock mode. */
function mockParam(name: string): string | null {
  return MOCK ? new URLSearchParams(window.location.search).get(name) : null;
}

function initialDrawer(): Drawer {
  const d = mockParam("drawer");
  return d === "trace" || d === "amd" ? d : null;
}

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-400">
      <Spinner /> Loading…
    </div>
  );
}

/** The incident step that fits where the alert stands: who to assign, then repair-or-replace, then the job itself. */
function stepFor(a: Alert, decided: boolean): number {
  if (a.state === "acknowledged") return decided ? LAST_STEP : DECIDE_STEP;
  if (a.state === "open" || a.state === "escalated") return 2;
  return 0;
}

export default function App() {
  // Server data: always derived from the latest poll, never copied into local state.
  const plant = usePoll(api.plant, 1000);
  const alerts = usePoll(api.alerts, 1500);
  const amd = usePoll(api.amdStats, 3000);
  const prevent = usePrevention(plant.data);
  const earlyWarnings = new Set(prevent?.filter((x) => EARLY_WARNING.has(x.prevention.risk.level)).map((x) => x.machine.id));

  // UI state only.
  const [page, navigate] = useRoute();
  const [incidentId, setIncidentId] = useState<string | null>(mockParam("incident"));
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const [teamPersonId, setTeamPersonId] = useState<string | null>(null);
  const [teamMode, setTeamMode] = useState<TeamMode>(window.location.hash === LEGACY_WORK_ORDERS ? "incident" : "person");
  const stepLog = useStepLog();
  const preventiveLog = usePreventiveLog();
  const decisionLog = useDecisionLog();
  const [step, setStep] = useState(Number(mockParam("step") ?? 0));
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [drawer, setDrawer] = useState<Drawer>(initialDrawer);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  // Repair-vs-replace is a POST (one LLM call), so keep the last result per machine.
  const [replaceResults, setReplaceResults] = useState<Record<string, ReplaceAnalysis>>({});

  const incident = alerts.data?.find((a) => a.id === incidentId) ?? null;
  const incidentMachine = plant.data?.machines.find((m) => m.id === incident?.machine_id);

  function openIncident(id: string, atStep = 0) {
    setIncidentId(id);
    setStep(atStep);
    setHighlight(null);
  }
  function closeIncident() {
    setIncidentId(null);
    setHighlight(null);
  }
  /** Leave the incident flow and follow it on the Team page, by incident. */
  function trackIncident(id: string) {
    closeIncident();
    setTrackedId(id);
    setTeamMode("incident");
    navigate("team");
  }
  /** Show one team member's tasks on the Team page. */
  function showPerson(personId: string) {
    closeIncident();
    setTeamPersonId(personId);
    setTeamMode("person");
    navigate("team");
  }
  /** Open an incident on the step that fits where it stands. */
  function openIncidentHere(id: string) {
    const a = alerts.data?.find((x) => x.id === id);
    openIncident(id, a ? stepFor(a, !!decisionOf(decisionLog, a)) : 0);
  }
  function goToStep(i: number) {
    if (incident && i >= 0 && i < STEPS.length && isStepEnabled(incident, i)) setStep(i);
  }

  // A brand-new alert opens its incident on step 1 (hands-free demo).
  useAutoSelect(
    alerts.data,
    useCallback((a: Alert) => {
      setIncidentId(a.id);
      setStep(0);
    }, []),
  );

  // Old Work orders links open the Team page by incident (on load, the initial state already handles it).
  useEffect(() => {
    const onHash = () => window.location.hash === LEGACY_WORK_ORDERS && setTeamMode("incident");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // A demo reset starts a new run: forget the ticked steps of the old one.
  useEffect(() => syncRun(alerts.data, plant.data?.sim_time), [alerts.data, plant.data?.sim_time]);

  // After a demo reset the incident is gone: go back home.
  useEffect(() => {
    if (incidentId && alerts.data && !alerts.data.some((a) => a.id === incidentId)) setIncidentId(null);
  }, [incidentId, alerts.data]);

  // Evidence highlight clears after 6 s or on the next click anywhere.
  useEffect(() => {
    if (!highlight) return;
    const clear = () => setHighlight(null);
    const timer = setTimeout(clear, 6000);
    // Register after the current click has finished, so the click that set it doesn't clear it.
    const arm = setTimeout(() => window.addEventListener("pointerdown", clear, { once: true }), 0);
    return () => {
      clearTimeout(timer);
      clearTimeout(arm);
      window.removeEventListener("pointerdown", clear);
    };
  }, [highlight]);

  // Keyboard shortcuts for a smooth demo recording.
  useHotkeys({
    " ": () => {
      if (plant.data) api.control({ paused: !plant.data.paused }).then(plant.refresh, () => undefined);
    },
    i: () => {
      api.inject({ machine_id: "P-101", fault: "bearing_wear" }).then(plant.refresh, () => undefined);
    },
    ArrowRight: () => goToStep(step + 1),
    ArrowLeft: () => goToStep(step - 1),
    r: () => goToStep(DECIDE_STEP),
    t: () => incident && setDrawer((d) => (d === "trace" ? null : "trace")),
    a: () => setDrawer("amd"),
    w: () => {
      if (incident) return trackIncident(incident.id);
      setTeamMode("incident");
      navigate(page === "team" && teamMode === "incident" ? "plant" : "team");
    },
    p: () => {
      closeIncident();
      navigate(page === "prevent" ? "plant" : "prevent");
    },
    m: () => {
      closeIncident();
      setTeamMode("person");
      navigate(page === "team" && teamMode === "person" ? "plant" : "team");
    },
    Escape: () => {
      setDrawer(null);
      setHighlight(null);
    },
  });

  const now = plant.data?.sim_time;
  const active = alerts.data?.filter(isActive) ?? [];
  const needAction = now ? active.filter((a) => ["waiting", "escalated", "overdue"].includes(stage(a, now))).length : 0;
  const tasks = now && alerts.data ? teamTasks(alerts.data, stepLog, preventiveLog, decisionLog, now) : [];
  const openTasks = tasks.filter(isOpen).length;
  const overdueTasks = tasks.filter((t) => t.status === "overdue").length;

  return (
    <div className="flex h-full flex-col">
      <Header
        page={page}
        onNavigate={(p) => {
          closeIncident();
          navigate(p);
        }}
        plant={plant.data}
        needAction={needAction + overdueTasks}
        earlyWarnings={earlyWarnings.size}
        openTasks={openTasks}
        amd={amd.data}
        amdFailed={!!amd.error}
        onOpenAmd={() => setDrawer("amd")}
        onPlantChanged={plant.refresh}
      />

      {page === "plant" ? (
        <Suspense fallback={<Loading />}>
          <FactoryView
            plant={plant.data}
            alerts={alerts.data}
            onOpenIncident={openIncident}
            onPlantChanged={plant.refresh}
            onShowWorkOrders={() => {
              setTeamMode("incident");
              navigate("team");
            }}
            onShowPrevent={() => navigate("prevent")}
            earlyWarningIds={earlyWarnings}
            initialMachineId={mockParam("machine")}
          />
        </Suspense>
      ) : page === "prevent" ? (
        <Suspense fallback={<Loading />}>
          <PreventView
            plant={plant.data}
            alerts={alerts.data}
            machines={prevent}
            onOpenIncident={openIncidentHere}
            onViewInTeam={showPerson}
          />
        </Suspense>
      ) : page === "team" ? (
        <TeamView
          plant={plant.data}
          alerts={alerts.data}
          mode={teamMode}
          onMode={setTeamMode}
          selectedId={teamPersonId}
          onSelect={setTeamPersonId}
          incidentId={trackedId}
          onSelectIncident={setTrackedId}
          onOpenIncident={openIncidentHere}
        />
      ) : null}

      {/* The incident opens over the blurred page. */}
      {incident && incidentMachine && (
        <Suspense fallback={null}>
          <IncidentView
            alert={incident}
            machine={incidentMachine}
            plant={plant.data}
            step={step}
            onStep={goToStep}
            onClose={closeIncident}
            onFinish={() => trackIncident(incident.id)}
            onChanged={() => {
              alerts.refresh();
              plant.refresh();
            }}
            highlight={highlight}
            onHighlight={setHighlight}
            onOpenTrace={() => setDrawer("trace")}
            replaceResult={replaceResults[incidentMachine.id]}
            onReplaceResult={(r) => setReplaceResults((prev) => ({ ...prev, [r.machine_id]: r }))}
            onViewInTeam={showPerson}
          />
        </Suspense>
      )}

      {drawer === "trace" && <TraceDrawer alert={incident} amd={amd.data} onClose={closeDrawer} />}
      {drawer === "amd" && <AmdPanel stats={amd.data} onClose={closeDrawer} />}

      {plant.error && (
        <Toast>
          <WifiOff className="h-4 w-4" /> Backend unreachable, retrying…
        </Toast>
      )}
    </div>
  );
}
