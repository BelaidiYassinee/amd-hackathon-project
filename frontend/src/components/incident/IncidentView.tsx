import { useState } from "react";
import clsx from "clsx";
import { ArrowLeft, ArrowRight, ClipboardList, FileSearch, X } from "lucide-react";
import { api } from "../../api";
import type { Alert, AlertState, MachineSummary, PlantState, ReplaceAnalysis } from "../../types";
import { DECIDE_STEP, LAST_STEP, isStepEnabled, stepsFor, type Highlight } from "../../lib/uiTypes";
import { decisionOf, recommended, useDecisionLog } from "../../lib/decisionLog";
import { usePoll } from "../../hooks/usePoll";
import { Button } from "../ui/Button";
import { HistoryModal } from "../alert/HistoryModal";
import { ManualModal } from "../alert/ManualModal";
import { Stepper } from "./Stepper";
import { DetectStep } from "./DetectStep";
import { DiagnoseStep } from "./DiagnoseStep";
import { AssignStep } from "./AssignStep";
import { FixStep } from "./FixStep";
import { DecideStep } from "./DecideStep";
import { OrderStep } from "./OrderStep";

const STATE_LABEL: Record<AlertState, { text: string; cls: string }> = {
  diagnosing: { text: "AI investigating", cls: "bg-violet-500/15 text-violet-300" },
  open: { text: "Waiting for technician", cls: "bg-red-500/15 text-red-300" },
  escalated: { text: "Escalated", cls: "bg-red-600 text-white" },
  acknowledged: { text: "Work in progress", cls: "bg-sky-500/15 text-sky-300" },
  resolved: { text: "Resolved", cls: "bg-emerald-500/15 text-emerald-300" },
  rejected: { text: "Rejected as false alarm", cls: "bg-white/[0.07] text-zinc-400" },
};

type RefModal = { kind: "manual" | "history"; id: string } | null;

/** One incident as a guided flow over the factory: Detect → Diagnose → Assign → Decide → Fix (repair) or Order (replace). */
export function IncidentView({
  alert,
  machine,
  plant,
  step,
  onStep,
  onClose,
  onFinish,
  onChanged,
  highlight,
  onHighlight,
  onOpenTrace,
  replaceResult,
  onReplaceResult,
  onViewInTeam,
}: {
  alert: Alert;
  machine: MachineSummary;
  plant: PlantState | null;
  step: number;
  onStep: (i: number) => void;
  onClose: () => void;
  /** Done with the flow: follow the incident on the Work orders page. */
  onFinish: () => void;
  onChanged: () => void;
  highlight: Highlight | null;
  onHighlight: (h: Highlight) => void;
  onOpenTrace: () => void;
  replaceResult: ReplaceAnalysis | undefined;
  onReplaceResult: (r: ReplaceAnalysis) => void;
  onViewInTeam: (personId: string) => void;
}) {
  const people = usePoll(api.people, 10000);
  const [modal, setModal] = useState<RefModal>(null);
  const openManual = (id: string) => setModal({ kind: "manual", id });
  const openHistory = (id: string) => setModal({ kind: "history", id });

  // The last step follows the decision: the user's choice, else the AI's recommendation, else repair.
  const decision = decisionOf(useDecisionLog(), alert);
  const choice = decision?.choice ?? recommended(replaceResult)?.kind ?? "repair";
  const steps = stepsFor(choice);
  const now = plant?.sim_time ?? null;

  const s = steps[step];
  const last = step === steps.length - 1;
  const nextEnabled = !last && isStepEnabled(alert, step + 1);
  const state = STATE_LABEL[alert.state];

  return (
    // Glass panel over the blurred factory, like the machine pop-up. z-30 keeps the drawers (z-40) and modals (z-50) above it.
    <div className="glass-backdrop fixed inset-0 z-30 flex animate-fade-in items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Incident on ${alert.machine_name}`}
        onClick={(e) => e.stopPropagation()}
        className="glass-panel flex h-[min(940px,94vh)] w-[min(1440px,96vw)] animate-pop-in flex-col overflow-hidden rounded-2xl"
      >
        {/* Incident header */}
        <div className="flex items-center gap-3 px-8 pt-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="truncate text-xl font-semibold text-zinc-50">{alert.machine_name}</h2>
              <span className={clsx("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", state.cls)}>{state.text}</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {machine.id} · {machine.model} · {machine.area}
            </p>
          </div>
          <Button variant="ghost" className="ml-auto" onClick={onFinish} title="Who owns it, which steps are done (w)">
            <ClipboardList className="h-4 w-4" /> Follow up
          </Button>
          <Button variant="ghost" onClick={onOpenTrace} title="Every step the AI agent took (t)">
            <FileSearch className="h-4 w-4" /> Agent trace
          </Button>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-zinc-200" aria-label="Back to the factory">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-8 pt-5">
          <Stepper steps={steps} step={step} isEnabled={(i) => isStepEnabled(alert, i)} onStep={onStep} />
        </div>

        {/* Current step */}
        <div key={step} className="flex min-h-0 flex-1 animate-fade-in flex-col px-8 pb-2 pt-6">
          <div className="mb-5">
            <h1 className="text-2xl font-semibold text-zinc-50">{s.heading}</h1>
            <p className="mt-1 text-sm text-zinc-400">{s.hint}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
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
            {step === DECIDE_STEP && (
              <DecideStep
                alert={alert}
                machine={machine}
                result={replaceResult}
                onResult={onReplaceResult}
                decision={decision}
                now={now}
                onDecided={() => onStep(LAST_STEP)}
              />
            )}
            {step === LAST_STEP &&
              (choice === "replace" ? (
                <OrderStep
                  alert={alert}
                  result={replaceResult}
                  decision={decision}
                  people={people.data}
                  now={now}
                  onChanged={onChanged}
                  onViewInTeam={onViewInTeam}
                />
              ) : (
                <FixStep alert={alert} people={people.data} now={now} onChanged={onChanged} onOpenManual={openManual} />
              ))}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-white/5 px-8 py-4">
          <Button variant="ghost" disabled={step === 0} onClick={() => onStep(step - 1)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {!nextEnabled && !last && <span className="text-xs text-zinc-500">Waiting for the AI diagnosis…</span>}
          {last ? (
            <Button variant="primary" onClick={onFinish} title="Follow who does what, and whether it gets done">
              <ClipboardList className="h-4 w-4" /> Done · track progress
            </Button>
          ) : (
            <Button variant="primary" disabled={!nextEnabled} onClick={() => onStep(step + 1)} title="Next step (→)">
              Next: {steps[step + 1].title} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>

        {modal?.kind === "manual" && <ManualModal sectionId={modal.id} onClose={() => setModal(null)} />}
        {modal?.kind === "history" && <HistoryModal machineId={alert.machine_id} recordId={modal.id} onClose={() => setModal(null)} />}
      </div>
    </div>
  );
}
