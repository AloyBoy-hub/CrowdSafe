import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { GlassCard } from "../../components/ui/glass-card";
import type { Exit, ExitStatus } from "../../lib/types";

interface ExitControlTableProps {
  exits: Exit[];
  onOverride: (exitId: string, status: ExitStatus) => void;
  headerActions?: ReactNode;
}

const EXIT_OCCUPANCY_BASELINE = 150;

function statusPill(status: ExitStatus): string {
  if (status === "blocked") return "border-l-2 border-red-500 bg-red-500/10 text-red-300";
  if (status === "congested") return "border-l-2 border-amber-500 bg-amber-500/10 text-amber-300";
  return "border-l-2 border-emerald-500 bg-emerald-500/10 text-emerald-300";
}

function congestionBand(pct: number): string {
  if (pct < 60) return "Free/comfortable";
  if (pct < 85) return "Busy";
  return "High congestion";
}

export default function ExitControlTable({ exits, onOverride, headerActions }: ExitControlTableProps) {
  const [flashRows, setFlashRows] = useState<Record<string, boolean>>({});
  const previousStatusRef = useRef<Record<string, ExitStatus>>({});

  useEffect(() => {
    const changedIds: string[] = [];
    for (const exit of exits) {
      const prev = previousStatusRef.current[exit.id];
      if (prev && prev !== exit.status) changedIds.push(exit.id);
      previousStatusRef.current[exit.id] = exit.status;
    }
    if (changedIds.length === 0) return;
    setFlashRows((prev) => {
      const next = { ...prev };
      for (const id of changedIds) next[id] = true;
      return next;
    });
    const timer = window.setTimeout(() => {
      setFlashRows((prev) => {
        const next = { ...prev };
        for (const id of changedIds) delete next[id];
        return next;
      });
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [exits]);

  const rows = useMemo(
    () =>
      exits.map((exit) => {
        const flowPpm = Math.max(0, Math.round(exit.flow_ppm ?? 0));
        const congestionPct = Math.round((exit.queue / EXIT_OCCUPANCY_BASELINE) * 100);
        const fill = Math.max(0, Math.min(100, congestionPct));
        const barColor = fill >= 85 ? "bg-red-500" : fill >= 60 ? "bg-amber-500" : "bg-emerald-500";
        return { ...exit, flowPpm, congestionPct, fill, barColor };
      }),
    [exits]
  );

  return (
    <GlassCard glow className="gap-0 border-white/20 bg-white/[0.06] p-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Exit Control Table</p>
        {headerActions ? <div className="flex items-center gap-2">{headerActions}</div> : null}
      </div>
      <p className="mt-1 text-xs text-slate-500">Congestion % = (agents within 25m / {EXIT_OCCUPANCY_BASELINE}) * 100</p>
      <div className="mt-3 overflow-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#1E2D4A] text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Exit Name</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Agents In 25m</th>
              <th className="px-2 py-2">Actual Flow (ppl/min)</th>
              <th className="px-2 py-2">Congestion %</th>
              <th className="px-2 py-2">Band</th>
              <th className="px-2 py-2">Override</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((exit, idx) => {
              const blockedRow = exit.status === "blocked" ? "bg-red-500/5 border-l-2 border-red-500" : "";
              const overrideRow = exit.override ? "bg-amber-500/5 border-l-2 border-amber-500" : "";
              return (
                <tr
                  key={exit.id}
                  className={`${idx % 2 === 0 ? "bg-[#0F1629]" : "bg-[#0A0E1A]"} ${blockedRow} ${overrideRow} ${
                    flashRows[exit.id] ? "animate-pulse" : ""
                  }`}
                >
                  <td className="px-2 py-3 text-slate-200">
                    <p className="font-mono">{exit.name ?? exit.id}</p>
                    <p className="text-xs text-slate-500">{exit.id}</p>
                  </td>
                  <td className="px-2 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs uppercase tracking-wide ${statusPill(exit.status)}`}>{exit.status}</span>
                    {exit.override ? <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">Override Active</span> : null}
                  </td>
                  <td className="px-2 py-3 font-mono text-slate-200">{exit.queue.toLocaleString()} agents</td>
                  <td className="px-2 py-3 font-mono text-slate-200">{exit.flowPpm.toLocaleString()}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded bg-[#1A2540]">
                        <div className={`h-full ${exit.barColor}`} style={{ width: `${exit.fill}%` }} />
                      </div>
                      <span className="font-mono text-xs text-slate-400">{exit.congestionPct}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-3 font-mono text-slate-300">{congestionBand(exit.congestionPct)}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-1">
                      {(["open", "congested", "blocked"] as ExitStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => onOverride(exit.id, status)}
                          className={`ui-button border px-2 py-1 text-xs uppercase ${
                            exit.status === status
                              ? status === "open"
                                ? "border-emerald-500 bg-emerald-600/90 text-white"
                                : status === "congested"
                                  ? "border-amber-500 bg-amber-500 text-slate-900"
                                  : "border-red-500 bg-red-600 text-white"
                              : "border-[#1E2D4A] bg-[#1A2540] text-slate-300"
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
