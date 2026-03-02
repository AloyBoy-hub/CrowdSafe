import { AlertTriangle, ArrowRightLeft, Flame, Lock, Shield } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Alert } from "../../lib/types";

interface AlertLogProps {
  alerts: Alert[];
  onAck: (id: string) => void;
}

function iconFor(reason: string) {
  if (reason.includes("blocked")) return Lock;
  if (reason.includes("congested")) return AlertTriangle;
  if (reason.includes("hazard")) return Flame;
  return ArrowRightLeft;
}

function toneFor(reason: string): string {
  if (reason.includes("blocked")) return "border-l-red-500";
  if (reason.includes("congested")) return "border-l-amber-500";
  if (reason.includes("hazard")) return "border-l-rose-500";
  return "border-l-cyan-500";
}

function formatTs(ts: number): string {
  return new Date(ts * (ts < 10_000_000_000 ? 1000 : 1)).toLocaleTimeString();
}

function summarize(alert: Alert): string {
  if (alert.old_exit && alert.new_exit) {
    return `${alert.affected} agents rerouted from ${alert.old_exit} -> ${alert.new_exit}`;
  }
  return `${alert.affected} agents affected by ${alert.reason}`;
}

export default function AlertLog({ alerts, onAck }: AlertLogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [manualHold, setManualHold] = useState(false);

  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => (b.ts > a.ts ? 1 : -1)),
    [alerts]
  );

  useEffect(() => {
    if (!containerRef.current || manualHold) return;
    containerRef.current.scrollTop = 0;
  }, [sortedAlerts.length, manualHold]);

  return (
    <article className="ui-card border-[#1E2D4A] bg-[#0F1629] p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Alert Log</p>
        <span className="font-mono text-xs text-slate-500">{alerts.length.toLocaleString()} total</span>
      </div>
      <div
        ref={containerRef}
        onScroll={(event) => setManualHold((event.currentTarget.scrollTop ?? 0) > 24)}
        className="mt-3 max-h-72 space-y-2 overflow-auto pr-1"
      >
        {sortedAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-[#1E2D4A] py-10 text-slate-600">
            <Shield className="h-6 w-6" />
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider">No Active Alerts</p>
          </div>
        ) : (
          sortedAlerts.map((alert) => {
            const Icon = iconFor(alert.reason);
            return (
              <div
                key={alert.id}
                className={`rounded-md border border-[#1E2D4A] border-l-2 ${toneFor(alert.reason)} ${
                  alert.acknowledged ? "bg-[#1A2540]/40 opacity-75" : "bg-[#1A2540]"
                } px-3 py-2`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm text-slate-200">
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{summarize(alert)}</span>
                    </p>
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {alert.reason} - {formatTs(alert.ts)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {alert.acknowledged ? (
                      <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[10px] font-semibold text-emerald-300">
                        ACKNOWLEDGED
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAck(alert.id)}
                        className="ui-button border border-[#1E2D4A] bg-[#0A0E1A] px-2 py-1 text-[10px] text-slate-300"
                      >
                        ACK
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </article>
  );
}
