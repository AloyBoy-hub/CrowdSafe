import { useEffect, useMemo, useRef, useState } from "react";
import type { Exit, ExitStatus } from "../../lib/types";

interface ExitControlTableProps {
  exits: Exit[];
  onOverride: (exitId: string, status: ExitStatus) => void;
}

function statusPill(status: ExitStatus): string {
  if (status === "blocked") return "border-l-2 border-red-500 bg-red-500/10 text-red-300";
  if (status === "congested") return "border-l-2 border-amber-500 bg-amber-500/10 text-amber-300";
  return "border-l-2 border-emerald-500 bg-emerald-500/10 text-emerald-300";
}

function reliefEta(exit: Exit): string {
  if (exit.status === "blocked") return "N/A";
  const load = exit.queue / Math.max(1, exit.capacity);
  if (load < 0.5) return "<1m";
  const outflow = exit.status === "congested" ? 8 : 15;
  const excess = Math.max(0, exit.queue - Math.round(exit.capacity * 0.5));
  const mins = Math.ceil(excess / Math.max(1, outflow));
  return `${mins}m`;
}

export default function ExitControlTable({ exits, onOverride }: ExitControlTableProps) {
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
        const loadPct = Math.round((exit.queue / Math.max(1, exit.capacity)) * 100);
        const fill = Math.max(0, Math.min(100, loadPct));
        const barColor = fill > 80 ? "bg-red-500" : fill >= 50 ? "bg-amber-500" : "bg-emerald-500";
        return { ...exit, loadPct: fill, barColor };
      }),
    [exits]
  );

  return (
    <article className="ui-card border-[#1E2D4A] bg-[#0F1629] p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Exit Control Table</p>
      <div className="mt-3 overflow-auto">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#1E2D4A] text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-2 py-2">Exit Name</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Current Queue</th>
              <th className="px-2 py-2">Capacity</th>
              <th className="px-2 py-2">Load</th>
              <th className="px-2 py-2">ETA Relief</th>
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
                  <td className="px-2 py-3 text-slate-400">{exit.capacity.toLocaleString()} max</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded bg-[#1A2540]">
                        <div className={`h-full ${exit.barColor}`} style={{ width: `${exit.loadPct}%` }} />
                      </div>
                      <span className="font-mono text-xs text-slate-400">{exit.loadPct}%</span>
                    </div>
                  </td>
                  <td className="px-2 py-3 font-mono text-slate-300">{reliefEta(exit)}</td>
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
    </article>
  );
}

