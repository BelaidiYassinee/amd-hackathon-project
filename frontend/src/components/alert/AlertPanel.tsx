import { useState } from "react";
import { AlertTriangle, ClipboardCheck, Cpu, FileSearch, HardHat, ListChecks, Package, ScrollText, ShieldAlert, Users } from "lucide-react";
import { api } from "../../api";
import type { Alert, AlertState, MachineSummary } from "../../types";
import type { Highlight } from "../../lib/uiTypes";
import { simTime } from "../../lib/format";
import { usePoll } from "../../hooks/usePoll";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Pill } from "../ui/Pill";
import { Section } from "../ui/Section";
import { Spinner } from "../ui/Spinner";
import { TraceList } from "../trace/TraceList";
import { AlertActions } from "./AlertActions";
import { AssigneeCard } from "./AssigneeCard";
import { DiagnosisCard } from "./DiagnosisCard";
import { EventSummary } from "./EventSummary";
import { EvidenceList } from "./EvidenceList";
import { FixSteps } from "./FixSteps";
import { HistoryModal } from "./HistoryModal";
import { ManualModal } from "./ManualModal";
import { PartsList } from "./PartsList";
import { PastAlerts } from "./PastAlerts";
import { RefText } from "./RefText";

const STATE_STYLE: Record<AlertState, string> = {
  diagnosing: "bg-violet-500/20 text-violet-300",
  open: "bg-red-500/20 text-red-300",
  escalated: "bg-red-600 text-white",
  acknowledged: "bg-sky-500/20 text-sky-300",
  resolved: "bg-emerald-500/20 text-emerald-300",
  rejected: "bg-slate-800 text-slate-400",
};

type RefModal = { kind: "manual"; id: string } | { kind: "history"; id: string } | null;

export function AlertPanel({
  alert,
  alerts,
  machine,
  allClear,
  onChanged,
  onHighlight,
  onSelectAlert,
  onOpenTrace,
}: {
  alert: Alert | null;
  alerts: Alert[] | null;
  machine: MachineSummary | undefined;
  allClear: boolean;
  onChanged: () => void;
  onHighlight: (h: Highlight) => void;
  onSelectAlert: (a: Alert) => void;
  onOpenTrace: () => void;
}) {
  const people = usePoll(api.people, 10000);
  const [modal, setModal] = useState<RefModal>(null);
  const openManual = (id: string) => setModal({ kind: "manual", id });
  const openHistory = (id: string) => setModal({ kind: "history", id });

  if (!alerts) {
    return (
      <Card className="flex items-center gap-2 p-4 text-sm text-slate-400">
        <Spinner /> Loading alerts…
      </Card>
    );
  }
  if (!alert) {
    return (
      <Card>
        <PastAlerts alerts={alerts} allClear={allClear} onSelect={onSelectAlert} />
      </Card>
    );
  }

  const d = alert.diagnosis;
  const escalation = alert.notifications.find((n) => n.reason === "escalation");
  const signals = machine?.signals ?? [];

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-slate-300">{alert.id}</span>
            <Pill className={STATE_STYLE[alert.state]}>{alert.state}</Pill>
          </div>
          <div className="truncate text-xs text-slate-400">
            {alert.machine_name} · {simTime(alert.created_at)}
          </div>
        </div>
        <Button size="sm" onClick={onOpenTrace} title="Show agent trace (t)">
          <FileSearch className="h-3.5 w-3.5" /> Agent trace
        </Button>
      </div>

      {alert.state === "escalated" && escalation && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Escalated to {escalation.person_name} after{" "}
          {Math.round(((Date.parse(escalation.sent_at) - Date.parse(alert.created_at)) / 3_600_000) * 10) / 10} h without acknowledgement
        </div>
      )}

      {alert.state === "diagnosing" ? (
        <>
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-red-600/50 bg-red-600/10 px-3 py-2.5 text-sm font-semibold text-slate-100">
            <Cpu className="h-4 w-4 text-red-500" />
            AI is investigating on AMD…
            <Spinner className="ml-auto text-red-400" />
          </div>
          <Section title="Anomaly event" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
            <EventSummary event={alert.event} signals={signals} />
          </Section>
          <Section title={`Agent steps (${alert.trace.length})`} icon={<Cpu className="h-3.5 w-3.5" />}>
            <TraceList trace={alert.trace} />
          </Section>
        </>
      ) : (
        <>
          {alert.lead_time_h == null && <div className="px-4 pb-2 text-xs text-slate-500">Fixed-threshold alarms: still silent</div>}

          <div className="px-4 pb-3">
            {d ? <DiagnosisCard diagnosis={d} error={alert.error} /> : <div className="text-sm text-slate-500">No diagnosis available{alert.error ? `: ${alert.error}` : "."}</div>}
          </div>

          <Section title="Anomaly event" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
            <EventSummary event={alert.event} signals={signals} />
          </Section>

          {d && (
            <Section title={`Evidence (${d.evidence.length})`} icon={<ScrollText className="h-3.5 w-3.5" />} right={<span className="text-[11px] text-slate-500">click to open</span>}>
              <EvidenceList alert={alert} onHighlight={onHighlight} onOpenManual={openManual} onOpenHistory={openHistory} />
            </Section>
          )}

          <Section title="Assignment" icon={<Users className="h-3.5 w-3.5" />}>
            <AssigneeCard alert={alert} />
          </Section>

          <Section title="Actions" icon={<ClipboardCheck className="h-3.5 w-3.5" />}>
            <AlertActions alert={alert} people={people.data} onChanged={onChanged} />
          </Section>

          {d && (
            <>
              <Section title="Fix steps" icon={<ListChecks className="h-3.5 w-3.5" />}>
                <FixSteps alertId={alert.id} steps={d.fix_steps} onOpenManual={openManual} />
              </Section>
              <Section title="Parts" icon={<Package className="h-3.5 w-3.5" />}>
                <PartsList parts={d.parts} />
              </Section>
              {d.safety.length > 0 && (
                <Section title="Safety" icon={<HardHat className="h-3.5 w-3.5" />}>
                  <ul className="space-y-1.5">
                    {d.safety.map((s) => (
                      <li key={s} className="flex items-start gap-2 text-sm text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                        <span>
                          <RefText text={s} onOpenManual={openManual} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {d.alternatives.length > 0 && (
                <Section title="Why not something else?" collapsible defaultOpen={false}>
                  <ul className="space-y-2">
                    {d.alternatives.map((a) => (
                      <li key={a.fault} className="text-sm">
                        <span className="font-medium text-slate-200">{a.fault}</span>
                        <p className="text-slate-400">
                          <RefText text={a.why_less_likely} onOpenManual={openManual} />
                        </p>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
            </>
          )}
        </>
      )}

      {modal?.kind === "manual" && <ManualModal sectionId={modal.id} onClose={() => setModal(null)} />}
      {modal?.kind === "history" && <HistoryModal machineId={alert.machine_id} recordId={modal.id} onClose={() => setModal(null)} />}
    </Card>
  );
}
