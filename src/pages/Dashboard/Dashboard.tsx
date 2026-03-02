import {
  AlertTriangle,
  Bell,
  Camera,
  CheckCircle2,
  Flame,
  Map as MapIcon,
  Moon,
  PhoneCall,
  Route,
  Sun,
  Users
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import AlertToast, { type DashboardToast } from "../../components/AlertToast";
import { BackgroundGradientAnimation } from "../../components/ui/background-gradient-animation";
import { GlassButton } from "../../components/ui/glass-button";
import { GlassCard } from "../../components/ui/glass-card";
import { Glass } from "../../components/ui/glass-effect";
import { apiClient } from "../../lib/api";
import { getEvacuationHistory } from "../../lib/dashboardMetrics";
import { SECTOR_NAMES, sectorCctvGifPath, type SectorName } from "../../lib/sectors";
import type { Agent, ExitStatus } from "../../lib/types";
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

function evacuationDurationSeconds(agent: Agent): number | null {
  if (typeof agent.evac_duration_s === "number" && agent.evac_duration_s >= 0) return agent.evac_duration_s;
  if (
    typeof agent.evac_started_at_ms === "number" &&
    typeof agent.evac_completed_at_ms === "number" &&
    agent.evac_completed_at_ms >= agent.evac_started_at_ms
  ) {
    return (agent.evac_completed_at_ms - agent.evac_started_at_ms) / 1000;
  }
  return null;
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

function CctvCard({
  cctvSector,
  onSectorChange,
  compact = false
}: {
  cctvSector: SectorName;
  onSectorChange: (sector: SectorName) => void;
  compact?: boolean;
}) {
  return (
    <GlassCard glow className="gap-0 overflow-hidden rounded-xl border-white/20 bg-white/[0.06] py-0">
      <div className="flex items-center justify-between gap-2 border-b border-[#1E2D4A] px-3 py-2">
        <span className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">National Stadium - CCTV</span>
        </span>
        <select
          value={cctvSector}
          onChange={(e) => onSectorChange(e.target.value as SectorName)}
          className="rounded border border-[#1E2D4A] bg-[#1A2540] px-2 py-1 text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
          title="Sector feed"
        >
          {SECTOR_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <Link to={`/cctv?sector=${cctvSector}`} className="block">
        <div className={`relative bg-black ${compact ? "h-[16rem]" : "h-[404px]"}`}>
          <img
            key={cctvSector}
            src={sectorCctvGifPath(cctvSector)}
            alt={`CCTV ${cctvSector} sector`}
            className="h-full w-full object-cover"
            onError={(e) => {
              const target = e.currentTarget;
              target.style.display = "none";
              if (target.nextElementSibling) return;
              const fallback = document.createElement("div");
              fallback.className = "absolute inset-0 flex items-center justify-center bg-[#0F1629] px-2 text-center text-xs text-slate-500";
              fallback.textContent = `Add ${cctvSector.toLowerCase()}.gif to public/static/cctv/`;
              target.parentNode?.appendChild(fallback);
            }}
          />
        </div>
        {compact ? <p className="px-3 py-2 text-center text-xs text-slate-500">Open Scan →</p> : null}
      </Link>
    </GlassCard>
  );
}

export default function Dashboard() {
  const agents = useSimStore((state) => state.agents);
  const exits = useSimStore((state) => state.exits);
  const hazards = useSimStore((state) => state.hazards);
  const alerts = useSimStore((state) => state.alerts);
  const frame = useSimStore((state) => state.frame);
  const setExitStatusOptimistic = useSimStore((state) => state.setExitStatusOptimistic);

  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("campuswatch-dark-mode") !== "light");
  const [clockMs, setClockMs] = useState(Date.now());
  const [toasts, setToasts] = useState<DashboardToast[]>([]);
  const [cctvSector, setCctvSector] = useState<SectorName>("North");

  const metricHistoryRef = useRef<{ total: MetricSample[]; safe: MetricSample[]; danger: MetricSample[]; eta: MetricSample[] }>({
    total: [],
    safe: [],
    danger: [],
    eta: []
  });
  const seenAlertIdsRef = useRef<Set<string>>(new Set());

  const totalInStadium = agents.length;
  const evacuatedSafe = useMemo(() => agents.filter((agent) => agent.status === "safe").length, [agents]);
  const dangerCount = useMemo(() => agents.filter((agent) => agent.status === "danger").length, [agents]);
  const evacuatingAgents = useMemo(
    () => agents.filter((agent) => typeof agent.path_eta_s === "number" && agent.path_eta_s > 0 && agent.status !== "safe"),
    [agents]
  );
  const avgEvacTime = useMemo(() => {
    const durations = agents
      .filter((agent) => agent.status === "safe")
      .map(evacuationDurationSeconds)
      .filter((value): value is number => typeof value === "number");
    if (durations.length === 0) return 0;
    return durations.reduce((sum, value) => sum + value, 0) / durations.length;
  }, [agents]);

  const deltas = useMemo(() => {
    const now = clockMs;
    return {
      total: deltaFrom(metricHistoryRef.current.total, totalInStadium, now),
      safe: deltaFrom(metricHistoryRef.current.safe, evacuatedSafe, now),
      danger: deltaFrom(metricHistoryRef.current.danger, dangerCount, now),
      eta: deltaFrom(metricHistoryRef.current.eta, avgEvacTime, now)
    };
  }, [clockMs, totalInStadium, evacuatedSafe, dangerCount, avgEvacTime]);

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
    pushSample(metricHistoryRef.current.total, totalInStadium, now);
    pushSample(metricHistoryRef.current.safe, evacuatedSafe, now);
    pushSample(metricHistoryRef.current.danger, dangerCount, now);
    pushSample(metricHistoryRef.current.eta, avgEvacTime, now);
  }, [clockMs, totalInStadium, evacuatedSafe, dangerCount, avgEvacTime]);

  useEffect(() => {
    const fresh = alerts.filter((alert) => !seenAlertIdsRef.current.has(alert.id));
    if (fresh.length === 0) return;

    const toastable = fresh.filter((alert) => alert.reason !== "hazard_added");

    if (toastable.length > 0) {
      setToasts((prev) => [
        ...toastable.map((alert) => ({
          id: alert.id,
          reason: alert.reason,
          affected: alert.affected,
          oldExit: alert.old_exit,
          newExit: alert.new_exit
        })),
        ...prev
      ].slice(0, 6));
    }

    for (const alert of fresh) {
      seenAlertIdsRef.current.add(alert.id);
      if (alert.reason !== "hazard_added") {
        window.setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => toast.id !== alert.id));
        }, 6000);
      }
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

  const stats = [
    {
      key: "total",
      label: "Total In Stadium",
      value: totalInStadium.toLocaleString(),
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
      label: "Avg Evac Time",
      value: formatEta(avgEvacTime),
      delta: `${formatDelta(deltas.eta, "s")} vs 30s ago`,
      icon: Route,
      tone: "text-cyan-300"
    },
    {
      key: "hazard",
      label: "Active Hazards",
      value: hazards.length.toLocaleString(),
      delta: "across stadium",
      icon: Flame,
      tone: "text-amber-300"
    }
  ];

  return (
    <section className={darkMode ? "dark" : ""}>
      <BackgroundGradientAnimation
        interactive={false}
        gradientBackgroundStart="rgb(2, 6, 18)"
        gradientBackgroundEnd="rgb(6, 12, 28)"
        firstColor="18, 62, 158"
        secondColor="26, 84, 181"
        thirdColor="10, 86, 171"
        fourthColor="12, 42, 112"
        fifthColor="38, 72, 148"
        pointerColor="45, 81, 176"
        blendingValue="soft-light"
        containerClassName="min-h-screen !h-auto !w-full overflow-visible"
        className="min-h-screen font-hero-space text-[15px] text-[#F1F5F9] [&_.text-xs]:text-sm [&_.text-sm]:text-base"
      >
        <div className="fixed right-4 top-20 z-50 flex max-h-[70vh] flex-col gap-2 overflow-auto">
          {toasts.map((toast) => (
            <AlertToast key={toast.id} toast={toast} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
          ))}
        </div>

        <Glass className="top-3 z-40" width="w-[calc(100vw-1.5rem)]" height="h-12" effectClassName="opacity-20">
          <header className="flex h-full items-center justify-between px-3 text-slate-900 dark:text-slate-100">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-base font-bold tracking-widest text-slate-200">Dashboard</span>
              <span className="inline-flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-red-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                {liveMode} LIVE
              </span>
              <span className="font-mono-display text-xs text-slate-400">{formatClock(clockMs)}</span>
            </div>
            <div className="flex h-full items-center gap-2">
              <Link to="/map" className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 py-0 text-xs leading-none text-slate-900 transition hover:bg-white/35 dark:text-slate-100 dark:hover:bg-slate-700/45">
                <MapIcon className="h-4 w-4" />
                <span className="leading-none">Map View</span>
              </Link>
              <button
                type="button"
                onClick={() => setDarkMode((v) => !v)}
                className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 py-0 text-xs leading-none text-slate-900 transition hover:bg-white/35 dark:text-slate-100 dark:hover:bg-slate-700/45"
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span className="hidden leading-none sm:inline">{darkMode ? "Light" : "Dark"}</span>
              </button>
            </div>
          </header>
        </Glass>

        <main className="grid grid-cols-1 gap-4 px-3 pb-3 pt-16">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
              {stats.map((card) => {
                const Icon = card.icon;
                return (
                  <GlassCard glow key={card.key} className={`gap-0 border bg-white/[0.06] p-4 py-4 ${cardTone(card.key)}`}>
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{card.label}</p>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="font-mono text-3xl font-bold tabular-nums text-slate-100">{card.value}</p>
                      <Icon className={`h-5 w-5 ${card.tone}`} />
                    </div>
                    <p className={`mt-2 text-xs ${card.key === "danger" ? "text-red-300" : card.key === "safe" ? "text-emerald-300" : "text-slate-400"}`}>
                      {card.delta}
                    </p>
                  </GlassCard>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Link to="/map" className="block">
                <MiniMap agents={agents} exits={exits} hazards={hazards} />
              </Link>
              <CctvCard cctvSector={cctvSector} onSectorChange={setCctvSector} />
            </div>

            <div>
              <ExitControlTable
                exits={exits}
                onOverride={handleOverride}
                className="w-full"
                headerActions={
                  <>
                    <GlassButton size="sm" type="button" contentClassName="text-red-100">
                      <span className="inline-flex items-center gap-1.5">
                        <Bell className="h-4 w-4" />
                        Send Notification
                      </span>
                    </GlassButton>
                    <GlassButton size="sm" type="button" contentClassName="text-red-100">
                      <span className="inline-flex items-center gap-1.5">
                        <PhoneCall className="h-4 w-4" />
                        Call First Responders
                      </span>
                    </GlassButton>
                  </>
                }
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ExitLoadChart exits={exits} className="w-full" />
              <EvacuationProgressChart data={evacHistory} className="w-full" />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <AlertLog alerts={alerts} className="h-[21rem] w-full" />
              <SectorDensityChart
                agents={agents}
                orientation="vertical"
                showTotal={false}
                className="h-[21rem] w-full"
              />
            </div>
          </div>
        </main>
      </BackgroundGradientAnimation>
    </section>
  );
}
