import clsx from "clsx";
import { AlertTriangle, Cpu } from "lucide-react";
import type { AmdStats } from "../../types";
import { Drawer } from "../ui/Drawer";
import { Spinner } from "../ui/Spinner";

// LlmCall.at is wall-clock UTC (not simulated plant time).
const wallClock = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function BigNumber({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="text-2xl font-bold tabular-nums text-zinc-50">{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
}

export function AmdPanel({ stats, onClose }: { stats: AmdStats | null; onClose: () => void }) {
  return (
    <Drawer
      onClose={onClose}
      width={640}
      title={
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
            <Cpu className="h-3.5 w-3.5" /> AMD
          </span>
          AI inference on AMD
        </span>
      }
      subtitle={stats && `${stats.provider} · ${stats.model} · ${stats.endpoint}`}
    >
      {!stats ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner /> Loading AMD stats…
        </div>
      ) : (
        <div className="space-y-5">
          {stats.mock && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/60 bg-amber-400/15 px-4 py-3 text-lg font-bold text-amber-300">
              <AlertTriangle className="h-6 w-6 shrink-0" /> MOCK MODE: not calling AMD
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <BigNumber label="LLM calls" value={`${stats.calls}${stats.errors ? ` (${stats.errors} errors)` : ""}`} />
            <BigNumber label="Average latency" value={`${(stats.avg_latency_ms / 1000).toFixed(2)} s`} />
            <BigNumber label="Average tokens / s" value={stats.avg_tokens_per_s.toFixed(1)} />
            <BigNumber label="Total tokens" value={(stats.total_prompt_tokens + stats.total_completion_tokens).toLocaleString("en")} />
          </div>

          <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
            <dt className="text-zinc-500">Provider</dt>
            <dd className="text-zinc-200">{stats.provider}</dd>
            <dt className="text-zinc-500">Model</dt>
            <dd className="text-zinc-200">{stats.model}</dd>
            <dt className="text-zinc-500">Endpoint</dt>
            <dd className="font-mono text-zinc-200">{stats.endpoint}</dd>
            <dt className="text-zinc-500">Tokens</dt>
            <dd className="tabular-nums text-zinc-200">
              {stats.total_prompt_tokens.toLocaleString("en")} prompt · {stats.total_completion_tokens.toLocaleString("en")} completion
            </dd>
          </dl>

          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recent calls (newest first)</div>
            {stats.recent.length === 0 ? (
              <div className="text-sm text-zinc-500">No calls yet. Inject a fault to start a diagnosis.</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-xs">
                  <thead className="bg-black/20 text-left text-zinc-500">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">Time (UTC)</th>
                      <th className="px-2 py-1.5 font-medium">Purpose</th>
                      <th className="px-2 py-1.5 text-right font-medium">Latency</th>
                      <th className="px-2 py-1.5 text-right font-medium">Prompt / compl.</th>
                      <th className="px-2 py-1.5 text-right font-medium">tok/s</th>
                      <th className="px-2 py-1.5 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 tabular-nums">
                    {stats.recent.map((c) => (
                      <tr key={c.id} className="text-zinc-300">
                        <td className="px-2 py-1.5">{wallClock.format(new Date(c.at))}</td>
                        <td className="px-2 py-1.5">{c.purpose.replace("_", " ")}</td>
                        <td className="px-2 py-1.5 text-right">{(c.latency_ms / 1000).toFixed(2)} s</td>
                        <td className="px-2 py-1.5 text-right">
                          {c.prompt_tokens.toLocaleString("en")} / {c.completion_tokens.toLocaleString("en")}
                        </td>
                        <td className="px-2 py-1.5 text-right">{c.tokens_per_s.toFixed(1)}</td>
                        <td className={clsx("px-2 py-1.5", c.ok ? "text-emerald-400" : "text-red-400")} title={c.error ?? undefined}>
                          {c.ok ? "ok" : "error"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-zinc-500">
            Every diagnosis, alert message and repair-vs-replace justification is generated on the AMD Radeon API.
          </p>
        </div>
      )}
    </Drawer>
  );
}
