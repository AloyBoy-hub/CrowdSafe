import { AlertTriangle, ArrowRightLeft, Flame, X } from "lucide-react";

export interface DashboardToast {
  id: string;
  reason: string;
  affected: number;
  oldExit: string | null;
  newExit: string | null;
}

interface AlertToastProps {
  toast: DashboardToast;
  onClose: (id: string) => void;
}

function tone(reason: string): string {
  if (reason.includes("blocked")) return "border-rose-500/50 bg-rose-500/15 text-rose-300";
  if (reason.includes("congested")) return "border-amber-500/50 bg-amber-500/15 text-amber-300";
  return "border-cyan-500/50 bg-cyan-500/15 text-cyan-300";
}

function icon(reason: string) {
  if (reason.includes("hazard")) return Flame;
  if (reason.includes("reroute")) return ArrowRightLeft;
  return AlertTriangle;
}

export default function AlertToast({ toast, onClose }: AlertToastProps) {
  const Icon = icon(toast.reason);

  return (
    <div className={`ui-card w-80 border ${tone(toast.reason)} p-3 shadow-[0_0_14px_rgba(239,68,68,0.22)]`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold uppercase tracking-wide">{toast.reason}</p>
            <p className="mt-1 text-sm text-slate-100">
              {toast.oldExit && toast.newExit ? `${toast.oldExit} -> ${toast.newExit}` : "Route change detected"}
            </p>
            <p className="mt-1 font-mono text-xs text-slate-300">{toast.affected.toLocaleString()} affected</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onClose(toast.id)}
          className="ui-button rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

