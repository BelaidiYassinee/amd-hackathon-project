import { useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, Check, FileSearch } from "lucide-react";
import { api } from "../../api";
import type { Alert, AlertState, MachineSummary, PlantState, ReplaceAnalysis } from "../../types";
import { STEPS, isStepEnabled, type Highlight } from "../../lib/uiTypes";
import { usePoll } from "../../hooks/usePoll";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { HistoryModal } from "../alert/HistoryModal";
import { ManualModal } from "../alert/ManualModal";
import { Stepper } from "./Stepper";
import { DetectStep } from "./DetectStep";
import { DiagnoseStep } from "./DiagnoseStep";
import { AssignStep } from "./AssignStep";
import { FixStep } from "./FixStep";
import { DecideStep } from "./DecideStep";

const STATE_LABEL: Record<AlertState, { text: string; cls: string }> = {
  diagnosing: { text: "AI investigating", cls: "bg-violet-500/15 text-violet-300" },
  open: { text: "Waiting for technician", cls: "bg-red-500/15 text-red-300" },
  escalated: { text: "Escalated", cls: "bg-red-600 text-white" },
  acknowledged: { text: "Work in progress", cls: "bg-sky-500/15 text-sky-300" },
  resolved: { text: "Resolved", cls: "bg-emerald-500/15 text-emerald-300" },
  rejected: { text: "Rejected as false alarm", cls: "bg-zinc-800 text-zinc-400" },
};

type RefModal = { kind: "manual" | "history"; id: string } | null;

/** One incident as a guided flow: Detect → Diagnose → Assign → Fix → Decide. */
export function IncidentView({
  alert,
  machine,
  plant,
  step,
  onStep,
  onClose,
  onChanged,
  highlight,
  onHighlight,
  onOpenTrace,
  replaceResult,
  onReplaceResult,
}: {
  alert: Alert;
  machine: MachineSummary;
  plant: PlantState | null;
  step: number;
  onStep: (i: number) => void;
  onClose: () => void;
  onChanged: () => void;
  highlight: Highlight | null;
  onHighlight: (h: Highlight) => void;
  onOpenTrace: () => void;
  replaceResult: ReplaceAnalysis | undefined;
  onReplaceResult: (r: ReplaceAnalysis) => void;
}) {
  const people = usePoll(api.people, 10000);
  const [modal, setModal] = useState<RefModal>(null);
  const openManual = (id: string) => setModal({ kind: "manual", id });
  const openHistory = (id: string) => setModal({ kind: "history", id });

  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const nextEnabled = !last && isStepEnabled(alert, step + 1);
  const state = STATE_LABEL[alert.state];

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-5 px-6 pb-6">
      {/* Incident header */}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={onClose} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" /> All machines
        </button>
        <span className="text-zinc-700">/</span>
        <span className="font-medium text-zinc-100">{alert.machine_name}</span>
        <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-medium", state.cls)}>{state.text}</span>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onOpenTrace} title="Every step the AI agent took (t)">
          <FileSearch className="h-3.5 w-3.5" /> Agent trace
        </Button>
      </div>

      <Stepper step={step} isEnabled={(i) => isStepEnabled(alert, i)} onStep={onStep} />

      {/* Current step */}
      <Card className="flex min-h-0 flex-1 flex-col p-6">
        <div className="mb-5">
          <h1 className="text-2xl font-semibold text-zinc-50">{s.heading}</h1>
          <p className="mt-1 text-sm text-zinc-400">{s.hint}</p>
        </div>
        <div className="min-h-0 flex-1">
          {step === 0 && <DetectStep alert={alert} machine={machine} plant={plant} highlight={highlight} onPlantChanged={onChanged} />}
          {step === 1 && (
            <DiagnoseStep
              alert={alert}
              onHighlight={(h) => {
                onHighlight(h);
                onStep(0); // show the evidence on the chart
              }}
              onOpenManual={openManual}
              onOpenHistory={openHistory}
              onOpenTrace={onOpenTrace}
            />
          )}
          {step === 2 && <AssignStep alert={alert} people={people.data} onChanged={onChanged} />}
          {step === 3 && <FixStep alert={alert} people={people.data} onChanged={onChanged} onOpenManual={openManual} />}
          {step === 4 && <DecideStep alert={alert} machine={machine} result={replaceResult} onResult={onReplaceResult} />}
        </div>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => onStep(step - 1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        {!nextEnabled && !last && <span className="text-xs text-zinc-500">Waiting for the AI diagnosis…</span>}
        {last ? (
          <Button variant="primary" onClick={onClose}>
            <Check className="h-4 w-4" /> Done
          </Button>
        ) : (
          <Button variant="primary" disabled={!nextEnabled} onClick={() => onStep(step + 1)} title="Next step (→)">
            Next: {STEPS[step + 1].title} <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {modal?.kind === "manual" && <ManualModal sectionId={modal.id} onClose={() => setModal(null)} />}
      {modal?.kind === "history" && <HistoryModal machineId={alert.machine_id} recordId={modal.id} onClose={() => setModal(null)} />}
    </div>
  );
}
