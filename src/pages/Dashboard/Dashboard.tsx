import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  Map as MapIcon,
  Moon,
  Route,
  Shield,
  Siren,
  Sun,
  Users
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AlertToast, { type DashboardToast } from "../../components/AlertToast";
import { apiClient } from "../../lib/api";
import { getEvacuationHistory } from "../../lib/dashboardMetrics";
import type { ExitStatus } from "../../lib/types";
import { useSimStore } from "../../store/useSimStore";
import AlertLog from "./AlertLog";
import EvacuationProgressChart from "./EvacuationProgressChart";
import ExitControlTable from "./ExitControlTable";
import ExitLoadChart from "./ExitLoadChart";
import MiniMap from "./MiniMap";
import SectorDensityChart from "./SectorDensityChart";

interface MetricSample {
  ts: number;
  value: number;
}

function formatEta(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s}s`;
}

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function formatDelta(value: number, suffix = ""): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${abs.toLocaleString()}${suffix}`;
}

function pushSample(buffer: MetricSample[], value: number, now: number): void {
  buffer.push({ ts: now, value });
  while (buffer.length > 0 && now - buffer[0].ts > 5 * 60 * 1000) buffer.shift();
}

function deltaFrom(buffer: MetricSample[], current: number, now: number, windowMs = 30_000): number {
  for (let i = buffer.length - 1; i >= 0; i -= 1) {
    if (now - buffer[i].ts >= windowMs) return Math.round(current - buffer[i].value);
  }
  return 0;
}

function cardTone(key: string): string {
  if (key === "danger") return "border-red-500/40 shadow-[0_0_16px_rgba(239,68,68,0.22)]";
  if (key === "safe") return "border-emerald-500/40";
  if (key === "eta") return "border-cyan-500/40";
  if (key === "hazard") return "border-amber-500/40";
  return "border-blue-500/40";
}

export default function Dashboard() {
  const agents = useSimStore((state) => state.agents);
  const exits = useSimStore((state) => state.exits);
  const hazards = useSimStore((state) => state.hazards);
  const alerts = useSimStore((state) => state.alerts);
  const frame = useSimStore((state) => state.frame);
  const setExitStatusOptimistic = useSimStore((state) => state.setExitStatusOptimistic);
  const acknowledgeAlert = useSimStore((state) => state.acknowledgeAlert);

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("campuswatch-dark-mode") !== "light");
  const [clockMs, setClockMs] = useState(Date.now());
  const [toasts, setToasts] = useState<DashboardToast[]>([]);

  const metricHistoryRef = useRef<{ total: MetricSample[]; safe: MetricSample[]; danger: MetricSample[]; eta: MetricSample[] }>({
    total: [],
    safe: [],
    danger: [],
    eta: []
  });
  const seenAlertIdsRef = useRef<Set<string>>(new Set());

  const totalOnCampus = agents.length;
  const evacuatedSafe = useMemo(() => agents.filter((agent) => agent.status === "safe").length, [agents]);
  const dangerCount = useMemo(() => agents.filter((agent) => agent.status === "danger").length, [agents]);
  const evacuatingAgents = useMemo(
    () => agents.filter((agent) => typeof agent.path_eta_s === "number" && agent.path_eta_s > 0 && agent.status !== "safe"),
    [agents]
  );
  const avgEta = useMemo(() => {
    if (evacuatingAgents.length === 0) return 0;
    return evacuatingAgents.reduce((sum, agent) => sum + Number(agent.path_eta_s ?? 0), 0) / evacuatingAgents.length;
  }, [evacuatingAgents]);
  const busiestExit = useMemo(() => {
    if (exits.length === 0) return "N/A";
    return exits.reduce((max, current) => (current.queue > max.queue ? current : max));
  }, [exits]);

  const deltas = useMemo(() => {
    const now = clockMs;
    return {
      total: deltaFrom(metricHistoryRef.current.total, totalOnCampus, now),
      safe: deltaFrom(metricHistoryRef.current.safe, evacuatedSafe, now),
      danger: deltaFrom(metricHistoryRef.current.danger, dangerCount, now),
      eta: deltaFrom(metricHistoryRef.current.eta, avgEta, now)
    };
  }, [clockMs, totalOnCampus, evacuatedSafe, dangerCount, avgEta]);

  const evacHistory = useMemo(() => getEvacuationHistory(), [frame, clockMs]);
  const liveMode = evacuatingAgents.length > 0 ? "EVAC" : "MONITOR";

  useEffect(() => {
    localStorage.setItem("campuswatch-dark-mode", darkMode ? "dark" : "light");
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const now = Date.now();
    pushSample(metricHistoryRef.current.total, totalOnCampus, now);
    pushSample(metricHistoryRef.current.safe, evacuatedSafe, now);
    pushSample(metricHistoryRef.current.danger, dangerCount, now);
    pushSample(metricHistoryRef.current.eta, avgEta, now);
  }, [clockMs, totalOnCampus, evacuatedSafe, dangerCount, avgEta]);

  useEffect(() => {
    const fresh = alerts.filter((alert) => !seenAlertIdsRef.current.has(alert.id));
    if (fresh.length === 0) return;

    setToasts((prev) => [
      ...fresh.map((alert) => ({
        id: alert.id,
        reason: alert.reason,
        affected: alert.affected,
        oldExit: alert.old_exit,
        newExit: alert.new_exit
      })),
      ...prev
    ].slice(0, 6));

    for (const alert of fresh) {
      seenAlertIdsRef.current.add(alert.id);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== alert.id));
      }, 6000);
    }
  }, [alerts]);

  async function handleOverride(exitId: string, status: ExitStatus): Promise<void> {
    setExitStatusOptimistic(exitId, status);
    try {
      await apiClient.setExitStatus(exitId, { status });
    } catch (error) {
      console.error("Exit status override failed", error);
    }
  }

  async function handleAck(alertId: string): Promise<void> {
    acknowledgeAlert(alertId);
    try {
      await apiClient.ackAlert(alertId);
    } catch {
      // Backend ack endpoint may not exist yet; optimistic client-side ack is still applied.
    }
  }

  const stats = [
    {
      key: "total",
      label: "Total On Campus",
      value: totalOnCampus.toLocaleString(),
      delta: `${formatDelta(deltas.total)} in last 30s`,
      icon: Users,
      tone: "text-blue-300"
    },
    {
      key: "safe",
      label: "Evacuated Safe",
      value: evacuatedSafe.toLocaleString(),
      delta: `${formatDelta(deltas.safe)} in last 30s`,
      icon: CheckCircle2,
      tone: "text-emerald-300"
    },
    {
      key: "danger",
      label: "In Danger Zone",
      value: dangerCount.toLocaleString(),
      delta: `${formatDelta(deltas.danger)} in last 30s`,
      icon: AlertTriangle,
      tone: "text-red-300"
    },
    {
      key: "eta",
      label: "Avg ETA To Exit",
      value: formatEta(avgEta),
      delta: `${formatDelta(deltas.eta, "s")} vs 30s ago`,
      icon: Route,
      tone: "text-cyan-300"
    },
    {
      key: "hazard",
      label: "Active Hazards",
      value: hazards.length.toLocaleString(),
      delta: "across campus",
      icon: Flame,
      tone: "text-amber-300"
    }
  ];

  return (
    <section className={darkMode ? "dark" : ""}>
      <div className="min-h-screen overflow-y-auto bg-[#0A0E1A] text-[#F1F5F9]">
        <div className="fixed right-4 top-4 z-50 flex max-h-[70vh] flex-col gap-2 overflow-auto">
          {toasts.map((toast) => (
            <AlertToast key={toast.id} toast={toast} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
          ))}
        </div>

        <header className="m-3 flex h-14 items-center justify-between rounded-xl border border-[#1E2D4A] bg-[#0F1629] px-4">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold tracking-widest text-slate-200">Command Centre</span>
            <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] uppercase tracking-wide text-red-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              {liveMode} LIVE
            </span>
            <span className="font-mono text-xs text-slate-500">{formatClock(clockMs)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/map" className="ui-button border border-[#1E2D4A] bg-[#1A2540] text-slate-200">
              <span className="inline-flex items-center gap-1"><MapIcon className="h-4 w-4" />Map View</span>
            </Link>
            <button type="button" onClick={() => setDarkMode((v) => !v)} className="ui-button border border-[#1E2D4A] bg-[#1A2540] text-slate-200">
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 gap-4 px-3 pb-3 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <div>
            <MiniMap agents={agents} exits={exits} hazards={hazards} />
          </div>

          <div className="grid grid-rows-[auto_auto_auto_auto] gap-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              {stats.map((card) => {
                const Icon = card.icon;
                return (
                  <article key={card.key} className={`ui-card border bg-[#0F1629] p-4 ${cardTone(card.key)}`}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{card.label}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="font-mono text-3xl font-bold tabular-nums text-slate-100">{card.value}</p>
                      <Icon className={`h-5 w-5 ${card.tone}`} />
                    </div>
                    <p className={`mt-2 text-xs ${card.key === "danger" ? "text-red-300" : card.key === "safe" ? "text-emerald-300" : "text-slate-400"}`}>
                      {card.delta}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <EvacuationProgressChart data={evacHistory} />
              <ExitLoadChart exits={exits} />
            </div>

            <div>
              <ExitControlTable exits={exits} onOverride={handleOverride} />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <div>
                <SectorDensityChart agents={agents} />
              </div>
              <div>
                <AlertLog alerts={alerts} onAck={handleAck} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </section>
  );
}
