import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { MOCK, api } from "./api";
import type { Alert, ReplaceAnalysis } from "./types";
import { STEPS, isStepEnabled, type Drawer, type Highlight } from "./lib/uiTypes";
import { isActive, stage } from "./lib/progress";
import { syncRun } from "./lib/stepLog";
import { usePoll } from "./hooks/usePoll";
import { useAutoSelect } from "./hooks/useAutoSelect";
import { useHotkeys } from "./hooks/useHotkeys";
import { useRoute } from "./hooks/useRoute";
import { Header } from "./components/layout/Header";
import { Spinner } from "./components/ui/Spinner";
import { Toast } from "./components/ui/Toast";
import { TraceDrawer } from "./components/trace/TraceDrawer";
import { AmdPanel } from "./components/amd/AmdPanel";
import { WorkOrdersView } from "./components/workorders/WorkOrdersView";

// Recharts and three.js are most of the bundle: load the heavy views as separate chunks.
const IncidentView = lazy(() => import("./components/incident/IncidentView").then((m) => ({ default: m.IncidentView })));
const FactoryView = lazy(() => import("./components/factory/FactoryView").then((m) => ({ default: m.FactoryView })));

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

/** The incident step that fits where the alert stands: the fix once someone owns it, else who to assign. */
function stepFor(a: Alert): number {
  if (a.state === "acknowledged") return 3;
  if (a.state === "open" || a.state === "escalated") return 2;
  return 0;
}

export default function App() {
  // Server data: always derived from the latest poll, never copied into local state.
  const plant = usePoll(api.plant, 1000);
  const alerts = usePoll(api.alerts, 1500);
  const amd = usePoll(api.amdStats, 3000);

  // UI state only.
  const [page, navigate] = useRoute();
  const [incidentId, setIncidentId] = useState<string | null>(mockParam("incident"));
  const [trackedId, setTrackedId] = useState<string | null>(null);
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
  /** Leave the incident flow and follow it on the Work orders page. */
  function trackIncident(id: string) {
    closeIncident();
    setTrackedId(id);
    navigate("work-orders");
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
    r: () => goToStep(STEPS.length - 1),
    t: () => incident && setDrawer((d) => (d === "trace" ? null : "trace")),
    a: () => setDrawer("amd"),
    w: () => (incident ? trackIncident(incident.id) : navigate(page === "work-orders" ? "plant" : "work-orders")),
    Escape: () => {
      setDrawer(null);
      setHighlight(null);
    },
  });

  const now = plant.data?.sim_time;
  const active = alerts.data?.filter(isActive) ?? [];
  const needAction = now ? active.filter((a) => ["waiting", "escalated", "overdue"].includes(stage(a, now))).length : 0;

  return (
    <div className="flex h-full flex-col">
      <Header
        page={page}
        onNavigate={(p) => {
          closeIncident();
          navigate(p);
        }}
        plant={plant.data}
        activeWork={active.length}
        needAction={needAction}
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
            onShowWorkOrders={() => navigate("work-orders")}
            initialMachineId={mockParam("machine")}
          />
        </Suspense>
      ) : (
        <WorkOrdersView
          plant={plant.data}
          alerts={alerts.data}
          selectedId={trackedId}
          onSelect={setTrackedId}
          onOpenIncident={(id) => {
            const a = alerts.data?.find((x) => x.id === id);
            openIncident(id, a ? stepFor(a) : 0);
          }}
          onGoToPlant={() => navigate("plant")}
        />
      )}

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
