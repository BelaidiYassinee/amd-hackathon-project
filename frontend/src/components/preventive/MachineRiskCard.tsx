import { useRef } from "react";
import clsx from "clsx";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { MachineSummary, Person } from "../../types";
import { statusColor } from "../../lib/format";
import { RISK, dateLabel, type Prevention, type Risk } from "../../lib/preventive";
import { TONE, type Tone } from "../../lib/progress";
import { useFaultTint } from "../../hooks/useFaultTint";
import { cameraOrbit, modelSrc } from "../factory/machineModel";
import { SuggestedActions } from "./SuggestedActions";

const RISK_TONE: Record<Risk, Tone> = { incident: "red", act_now: "red", watch: "amber", rising: "amber", healthy: "emerald" };

/** Anomaly score over the last 24 h against the alarm limit (dashed): how close the AI is to raising an alert. */
function ScoreSpark({ scores, tone }: { scores: number[]; tone: Tone }) {
  if (scores.length < 2) return <div className="h-10" />;
  const limit = 1; // scores arrive as a share of the limit
  const top = Math.max(limit * 1.15, ...scores);
  const y = (v: number) => 38 - (v / top) * 36;
  const points = scores.map((v, i) => `${(i / (scores.length - 1)) * 100},${y(v)}`).join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={clsx("h-10 w-full", TONE[tone].text)} aria-label="Anomaly score, last 24 h">
      <line x1="0" x2="100" y1={y(limit)} y2={y(limit)} className="stroke-red-500/50" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function MachineRiskCard({
  machine,
  prevention: p,
  people,
  now,
  limit,
  onOpenManual,
  onOpenIncident,
  onViewInTeam,
}: {
  machine: MachineSummary;
  prevention: Prevention;
  people: Person[] | null;
  now: string;
  /** The detector's alarm limit, to scale the score line. */
  limit: number;
  onOpenManual: (sectionId: string) => void;
  onOpenIncident: () => void;
  onViewInTeam: (personId: string) => void;
}) {
  const level = p.risk.level;
  const tone = RISK_TONE[level];
  const t = TONE[tone];
  const viewer = useRef<HTMLElement>(null);
  // Amber on the part that drifts. Real alerts stay red on the Plant page.
  useFaultTint(viewer, level === "incident" ? null : (p.zones[0] ?? null), "amber");
  const upcoming = p.pm.filter((x) => x.nextDue).sort((a, b) => a.daysLeft! - b.daysLeft!);

  return (
    <article className={clsx("glass flex min-h-0 flex-col rounded-2xl p-5", level !== "healthy" && t.border)}>
      <div className="flex gap-4">
        <model-viewer
          ref={viewer}
          src={modelSrc(machine.id)}
          alt={`3D model of ${machine.name}`}
          loading="eager"
          auto-rotate=""
          auto-rotate-delay={0}
          rotation-per-second="14deg"
          camera-orbit={cameraOrbit(machine.id, 80)}
          interaction-prompt="none"
          environment-image="neutral"
          shadow-intensity={0.4}
          style={{ width: "150px", height: "120px", flexShrink: 0, pointerEvents: "none" }}
        >
          <div slot="progress-bar" />
        </model-viewer>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-zinc-50">{machine.name}</h2>
              <p className="text-xs text-zinc-500">
                {machine.id} · {machine.area} · health <span className={clsx("font-semibold tabular-nums", statusColor(machine.status).text)}>{machine.health}</span>
              </p>
            </div>
            <span className={clsx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", t.bg, t.text)}>
              <span className={clsx("h-1.5 w-1.5 rounded-full", t.dot)} />
              {RISK[level].label}
            </span>
          </div>
          <div className="mt-2">
            <ScoreSpark scores={p.risk.scores.map((s) => s / limit)} tone={tone} />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>Anomaly score · 24 h</span>
              <span className="text-red-400/60">alarm limit</span>
            </div>
          </div>
        </div>
      </div>

      {p.evidence.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {p.evidence.map((e) => (
            <span key={e.text} className={clsx("rounded-full border px-2.5 py-0.5 text-xs", TONE[e.tone].border, TONE[e.tone].bg, TONE[e.tone].text)}>
              {e.text}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 min-h-0 flex-1">
        {level === "incident" ? (
          <button
            type="button"
            onClick={onOpenIncident}
            className="flex w-full items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-left text-sm text-zinc-200 hover:bg-red-500/15"
          >
            <span className="flex-1">Too late to prevent: the AI already raised an incident. It is handled in the incident flow.</span>
            <span className="flex items-center gap-1 font-medium text-red-300">
              Open <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        ) : p.suggestions.length > 0 ? (
          <>
            <div className="eyebrow mb-2">Suggested actions</div>
            <SuggestedActions
              machine={machine}
              suggestions={p.suggestions}
              people={people}
              now={now}
              onOpenManual={onOpenManual}
              onViewInTeam={onViewInTeam}
            />
          </>
        ) : (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            Running normally. Nothing to do now.
          </div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="mt-4 border-t border-white/5 pt-3">
          <div className="eyebrow mb-1.5">Maintenance plan</div>
          <ul className="space-y-1 text-xs">
            {upcoming.map((x) => (
              <li key={x.task.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-zinc-400">{x.task.title}</span>
                <span
                  className={clsx(
                    "shrink-0 tabular-nums",
                    x.status === "overdue" ? "text-red-300" : x.status === "due_soon" ? "text-amber-300" : "text-zinc-500",
                  )}
                  title={`Last done ${dateLabel(x.lastDone!)}`}
                >
                  {x.daysLeft! < 0 ? `${-x.daysLeft!} d overdue` : `in ${x.daysLeft} d · ${dateLabel(x.nextDue!)}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
