import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { WifiOff } from "lucide-react";
import { MOCK, api } from "./api";
import type { Alert, ReplaceAnalysis } from "./types";
import type { Drawer, Highlight, Tab } from "./lib/uiTypes";
import { usePoll } from "./hooks/usePoll";
import { useAutoSelect } from "./hooks/useAutoSelect";
import { useHotkeys } from "./hooks/useHotkeys";
import { TopBar } from "./components/layout/TopBar";
import { MachineList } from "./components/machines/MachineList";
import { Card } from "./components/ui/Card";
import { Spinner } from "./components/ui/Spinner";
import { Toast } from "./components/ui/Toast";
import { LeadTimeBanner } from "./components/chart/LeadTimeBanner";
import { AlertPanel } from "./components/alert/AlertPanel";
import { TraceDrawer } from "./components/trace/TraceDrawer";
import { AmdPanel } from "./components/amd/AmdPanel";
import { pickAlert } from "./lib/pickAlert";

// Recharts is most of the bundle: load the two chart views as a separate chunk.
const MachineChart = lazy(() => import("./components/chart/MachineChart").then((m) => ({ default: m.MachineChart })));
const ReplaceTab = lazy(() => import("./components/replace/ReplaceTab").then((m) => ({ default: m.ReplaceTab })));

const TABS: { id: Tab; label: string; key: string }[] = [
  { id: "live", label: "Live monitoring", key: "" },
  { id: "replace", label: "Repair vs. replace", key: "r" },
];

/** URL params for screenshots and design work; always null outside mock mode. */
function mockParam(name: string): string | null {
  return MOCK ? new URLSearchParams(window.location.search).get(name) : null;
}

// Mock mode only: `?drawer=trace|amd` opens a drawer on load.
function initialDrawer(): Drawer {
  const d = mockParam("drawer");
  return d === "trace" || d === "amd" ? d : null;
}

function CenterLoading() {
  return (
    <Card className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-400">
      <Spinner /> Loading…
    </Card>
  );
}

export default function App() {
  // Server data: always derived from the latest poll, never copied into local state.
  const plant = usePoll(api.plant, 1000);
  const alerts = usePoll(api.alerts, 1500);
  const amd = usePoll(api.amdStats, 3000);

  // UI state only.
  const [selectedMachineId, setSelectedMachineId] = useState("P-101");
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [tab, setTab] = useState<Tab>(mockParam("tab") === "replace" ? "replace" : "live");
  const [drawer, setDrawer] = useState<Drawer>(initialDrawer);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  // Repair-vs-replace is a POST (one LLM call), so keep the last result per machine across tab switches.
  const [replaceResults, setReplaceResults] = useState<Record<string, ReplaceAnalysis>>({});

  // Mock mode only: `?autorun=1` runs the repair-vs-replace analysis on load (for screenshots).
  useEffect(() => {
    if (mockParam("autorun") === "1") api.replaceAnalysis("P-101", {}).then((r) => setReplaceResults({ [r.machine_id]: r }));
  }, []);

  // A brand-new alert: jump to its machine and show it (hands-free demo).
  useAutoSelect(
    alerts.data,
    useCallback((a: Alert) => {
      setSelectedMachineId(a.machine_id);
      setSelectedAlertId(a.id);
      setTab("live");
    }, []),
  );

  function selectMachine(id: string) {
    setSelectedMachineId(id);
    setSelectedAlertId(null); // the alert panel falls back to this machine's active/newest alert
    setHighlight(null);
  }

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
    t: () => setDrawer((d) => (d === "trace" ? null : "trace")),
    a: () => setDrawer("amd"),
    r: () => setTab("replace"),
    Escape: () => {
      setDrawer(null);
      setHighlight(null);
    },
  });

  const machine = plant.data?.machines.find((m) => m.id === selectedMachineId);
  const alert = pickAlert(alerts.data, machine, selectedAlertId);

  return (
    <div className="flex h-full flex-col">
      <TopBar plant={plant.data} amd={amd.data} amdFailed={!!amd.error} onOpenAmd={() => setDrawer("amd")} onPlantChanged={plant.refresh} />

      <main className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)_440px] gap-4 p-4">
        <aside className="min-h-0 overflow-y-auto pr-1">
          <MachineList machines={plant.data?.machines} selectedId={selectedMachineId} onSelect={selectMachine} />
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          <div className="flex gap-1 self-start rounded-lg border border-slate-800 bg-slate-900 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                title={t.key ? `Shortcut: ${t.key}` : undefined}
                className={clsx(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  tab === t.id ? "bg-slate-700 text-slate-100" : "text-slate-400 hover:text-slate-200",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {!machine ? (
            <CenterLoading />
          ) : (
            <Suspense fallback={<CenterLoading />}>
              {tab === "live" ? (
                <>
                  <LeadTimeBanner alert={alert} machine={machine} />
                  <MachineChart machine={machine} alert={alert} paused={plant.data?.paused ?? false} highlight={highlight} />
                </>
              ) : (
                <ReplaceTab
                  machine={machine}
                  alert={alert}
                  result={replaceResults[machine.id]}
                  onResult={(r) => setReplaceResults((prev) => ({ ...prev, [r.machine_id]: r }))}
                />
              )}
            </Suspense>
          )}
        </section>

        <aside className="min-h-0 overflow-y-auto">
          <AlertPanel
            alert={alert}
            alerts={alerts.data}
            machine={machine}
            allClear={(plant.data?.open_alerts ?? 0) === 0}
            onChanged={() => {
              alerts.refresh();
              plant.refresh();
            }}
            onHighlight={(h) => {
              setTab("live");
              setHighlight(h);
            }}
            onSelectAlert={(a) => {
              setSelectedMachineId(a.machine_id);
              setSelectedAlertId(a.id);
            }}
            onOpenTrace={() => setDrawer("trace")}
          />
        </aside>
      </main>

      {drawer === "trace" && <TraceDrawer alert={alert} amd={amd.data} onClose={closeDrawer} />}
      {drawer === "amd" && <AmdPanel stats={amd.data} onClose={closeDrawer} />}

      {plant.error && (
        <Toast>
          <WifiOff className="h-4 w-4" /> Backend unreachable, retrying…
        </Toast>
      )}
    </div>
  );
}
