import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Flame,
  Map as MapIcon,
  Moon,
  Route,
  Siren,
  Sun,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../lib/api";
import type { ExitStatus } from "../../lib/types";
import { useSimStore } from "../../store/useSimStore";

type ExitStatus = "open" | "congested" | "blocked";

interface ExitRuntime {
  id: string;
  label: string;
  coordinate: [number, number];
  capacity: number;
  queue: number;
  status: ExitStatus;
  override: boolean;
}

interface AlertItem {
  id: string;
  ts: number;
  reason: string;
  message: string;
  affected: number;
}

type ExitMetricSnapshot = {
  ts: number;
  totalAgents: number;
  queues: number[];
};

const TOTAL_POPULATION = 1500;
const CAPACITY_BY_EXIT: number[] = [420, 360, 300];
const DASHBOARD_EXIT_METRICS_KEY = "campussafe-exit-metrics-v1";

function statusLabel(status: ExitStatus): string {
  if (status === "blocked") return "Blocked";
  if (status === "congested") return "Congested";
  return "Open";
}

function statusPill(status: ExitStatus): string {
  if (status === "blocked") return "border-rose-500/50 bg-rose-500/20 text-rose-300";
  if (status === "congested") return "border-amber-400/50 bg-amber-400/20 text-amber-200";
  return "border-emerald-500/50 bg-emerald-500/20 text-emerald-300";
}

function formatTs(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString();
}

function nextStatus(current: ExitStatus): ExitStatus {
  if (current === "open") return "congested";
  if (current === "congested") return "blocked";
  return "open";
}

export default function Dashboard() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("campuswatch-dark-mode") !== "light");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [totalPopulation, setTotalPopulation] = useState(TOTAL_POPULATION);
  const [evacuatedCount, setEvacuatedCount] = useState(0);
  const [dangerCount, setDangerCount] = useState(0);
  const [hazardCount] = useState(1);
  const [exits, setExits] = useState<ExitRuntime[]>(
    EXIT_POINTS.map((exit, i) => ({
      id: exit.id,
      label: exit.label,
      coordinate: exit.coordinate,
      capacity: CAPACITY_BY_EXIT[i] ?? 300,
      queue: 0,
      status: "open",
      override: false
    }))
  );
  const [alerts, setAlerts] = useState<AlertItem[]>([
    {
      id: "boot",
      ts: Date.now(),
      reason: "system_online",
      message: "Dashboard online. Monitoring all configured exits.",
      affected: TOTAL_POPULATION
    }
  ]);

  useEffect(() => {
    localStorage.setItem("campuswatch-dark-mode", darkMode ? "dark" : "light");
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  useEffect(() => {
    function syncFromMap() {
      const raw = localStorage.getItem(DASHBOARD_EXIT_METRICS_KEY);
      if (!raw) return;
      try {
        const payload = JSON.parse(raw) as ExitMetricSnapshot;
        if (!Array.isArray(payload.queues)) return;
        setTotalPopulation(Number.isFinite(payload.totalAgents) ? Math.max(0, Math.round(payload.totalAgents)) : TOTAL_POPULATION);
        setExits((prev) =>
          prev.map((exit, i) => ({
            ...exit,
            queue: Math.max(0, Math.round(payload.queues[i] ?? exit.queue))
          }))
        );
      } catch (error) {
        console.warn("Unable to parse exit metric snapshot", error);
      }
    }

    const timer = window.setInterval(() => {
      setElapsedSec((v) => v + 1);
      syncFromMap();
    }, 1000);

    syncFromMap();
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const storageHandler = (event: StorageEvent) => {
      if (event.key !== DASHBOARD_EXIT_METRICS_KEY) return;
      // Fallback for cross-tab updates
      const snapshot = event.newValue;
      if (!snapshot) return;
      try {
        const payload = JSON.parse(snapshot) as ExitMetricSnapshot;
        if (!Array.isArray(payload.queues)) return;
        setTotalPopulation(Number.isFinite(payload.totalAgents) ? Math.max(0, Math.round(payload.totalAgents)) : TOTAL_POPULATION);
        setExits((prev) =>
          prev.map((exit, i) => ({
            ...exit,
            queue: Math.max(0, Math.round(payload.queues[i] ?? exit.queue))
          }))
        );
      } catch (error) {
        console.warn("Unable to parse exit metric snapshot", error);
      }
    };

    window.addEventListener("storage", storageHandler);
    return () => window.removeEventListener("storage", storageHandler);
  }, []);

  const busiestExit = useMemo(() => {
    if (exits.length === 0) return "N/A";
    return exits.reduce((a, b) => (a.queue / a.capacity > b.queue / b.capacity ? a : b)).label;
  }, [exits]);

  const avgEtaSeconds = useMemo(() => {
    if (exits.length === 0) return 0;
    const total = exits.reduce((sum, exit) => {
      const load = exit.queue / Math.max(1, exit.capacity);
      const penalty = exit.status === "blocked" ? 220 : exit.status === "congested" ? 140 : 70;
      return sum + Math.round(45 + load * penalty);
    }, 0);
    return Math.round(total / exits.length);
  }, [exits]);

  const totalQueued = useMemo(() => exits.reduce((sum, exit) => sum + exit.queue, 0), [exits]);

  const miniMapBounds = useMemo(() => {
    const lngs = exits.map((e) => e.coordinate[0]);
    const lats = exits.map((e) => e.coordinate[1]);
    const minLng = Math.min(...lngs) - 0.0002;
    const maxLng = Math.max(...lngs) + 0.0002;
    const minLat = Math.min(...lats) - 0.0002;
    const maxLat = Math.max(...lats) + 0.0002;
    return { minLng, maxLng, minLat, maxLat };
  }, [exits]);

  function setExitStatus(exitId: string, status: ExitStatus): void {
    const current = exits.find((e) => e.id === exitId);
    if (!current || current.status === status) return;

    setExits((prev) => prev.map((exit) => (exit.id === exitId ? { ...exit, status, override: true } : exit)));
    if (status === "blocked") setDangerCount((v) => v + 8);

    const affected = Math.max(15, Math.round(current.queue * 0.5));
    const message = `${current.label} set to ${statusLabel(status)} by responder override.`;
    setAlerts((prev) => [
      {
        id: `${Date.now()}-${exitId}-${status}`,
        ts: Date.now(),
        reason: "exit_override",
        message,
        affected
      },
      ...prev
    ].slice(0, 18));
  }

  const stats = [
    { label: "Total Population", value: totalPopulation.toLocaleString(), icon: Users, tone: "text-cyan-300" },
    { label: "Evacuated Count", value: evacuatedCount.toLocaleString(), icon: CheckCircle2, tone: "text-emerald-300" },
    { label: "In Danger Zone", value: dangerCount.toLocaleString(), icon: AlertTriangle, tone: "text-rose-300" },
    { label: "Avg ETA to Exit", value: formatMmSs(avgEtaSeconds), icon: Route, tone: "text-amber-300" },
    { label: "Busiest Exit", value: busiestExit, icon: Siren, tone: "text-orange-300" },
    { label: "Active Hazards", value: hazardCount.toLocaleString(), icon: Flame, tone: "text-rose-300" }
  ];

  return (
    <section className={darkMode ? "dark" : ""}>
      <div className="min-h-screen overflow-auto bg-slate-100 px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 lg:px-10 lg:py-10 xl:px-12 xl:py-12 dark:bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <div className="ui-card border-slate-300 bg-slate-100/95 p-4 dark:border-slate-700 dark:bg-slate-900/95">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">CrowdSafe Dashboard</h1>
                <p className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Clock3 className="h-4 w-4" />
                  <span className="font-mono-display">Live Session {formatClock(Date.now())}</span>
                  <span className="font-mono-display">Elapsed {formatHms(elapsedSec)}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDarkMode((v) => !v)}
                  className="ui-button flex items-center gap-2 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <span>{darkMode ? "Light" : "Dark"}</span>
                </button>
                <Link
                  to="/"
                  className="ui-button flex items-center gap-2 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <MapIcon className="h-4 w-4" />
                  <span>Map</span>
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
            {stats.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.label} className="ui-card border-slate-300 bg-slate-100/95 p-4 dark:border-slate-700 dark:bg-slate-900/95">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.label}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="font-mono-display text-2xl text-slate-900 dark:text-slate-100">{item.value}</p>
                    <Icon className={`h-5 w-5 ${item.tone}`} />
                  </div>
                </article>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
            <article className="ui-card border-slate-300 bg-slate-100/95 p-4 dark:border-slate-700 dark:bg-slate-900/95">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300">Campus Mini-Map</h3>
                <span className="font-mono-display text-xs text-slate-500 dark:text-slate-400">queued: {totalQueued} agents</span>
              </div>
              <div className="mt-4 h-72 rounded-lg border border-slate-300 bg-slate-200/70 p-3 dark:border-slate-700 dark:bg-slate-950/50">
                <div className="relative h-full w-full rounded-md border border-slate-300 bg-gradient-to-br from-slate-200 to-slate-100 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
                  {exits.map((exit) => {
                    const x = ((exit.coordinate[0] - miniMapBounds.minLng) / (miniMapBounds.maxLng - miniMapBounds.minLng)) * 100;
                    const y = 100 - ((exit.coordinate[1] - miniMapBounds.minLat) / (miniMapBounds.maxLat - miniMapBounds.minLat)) * 100;
                    return (
                      <div
                        key={exit.id}
                        className="absolute"
                        style={{ left: `${x}%`, top: `${y}%`, transform: "translate(-50%, -50%)" }}
                      >
                        <div className="h-3 w-3 rounded-full bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.25)]" />
                        <div className="mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-300 bg-slate-100/95 px-2 py-1 text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200">
                          {exit.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Non-interactive situational preview. Exit markers shown as red dots.</p>
            </article>

            <div className="grid grid-cols-1 gap-4">
              <article className="ui-card border-slate-300 bg-slate-100/95 p-4 dark:border-slate-700 dark:bg-slate-900/95">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300">Exit Control Table</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead>
                      <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                        <th className="px-2 py-2">Exit</th>
                        <th className="px-2 py-2">Capacity</th>
                        <th className="px-2 py-2">Queue</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Override</th>
                        <th className="px-2 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exits.map((exit) => (
                        <tr key={exit.id} className="border-b border-slate-200 dark:border-slate-800">
                          <td className="px-2 py-3 font-mono-display text-slate-800 dark:text-slate-200">{exit.label}</td>
                          <td className="px-2 py-3 font-mono-display text-slate-700 dark:text-slate-300">{exit.capacity}</td>
                          <td className="px-2 py-3 font-mono-display text-slate-700 dark:text-slate-300">
                            {exit.queue} ({Math.round((exit.queue / exit.capacity) * 100)}%)
                          </td>
                          <td className="px-2 py-3">
                            <span className={`inline-flex items-center rounded-md border px-2 py-1 text-xs ${statusPill(exit.status)}`}>
                              {statusLabel(exit.status)}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-xs text-slate-600 dark:text-slate-400">{exit.override ? "Yes" : "No"}</td>
                          <td className="px-2 py-3">
                            <div className="flex flex-wrap items-center gap-1">
                              <button type="button" onClick={() => setExitStatus(exit.id, "open")} className="ui-button border border-emerald-500/40 bg-emerald-600 px-2 py-1 text-xs text-white">Open</button>
                              <button type="button" onClick={() => setExitStatus(exit.id, "congested")} className="ui-button border border-amber-500/40 bg-amber-500 px-2 py-1 text-xs text-slate-900">Congested</button>
                              <button type="button" onClick={() => setExitStatus(exit.id, "blocked")} className="ui-button border border-rose-500/40 bg-rose-600 px-2 py-1 text-xs text-white">Blocked</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="ui-card border-slate-300 bg-slate-100/95 p-4 dark:border-slate-700 dark:bg-slate-900/95">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300">Alert Log</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{alerts.length} total</span>
                </div>
                <div className="mt-3 space-y-2 overflow-auto max-h-64">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="rounded-md border border-slate-300 bg-slate-100 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatClock(alert.ts)} · {alert.reason}</p>
                      <p className="mt-1 text-sm text-slate-800 dark:text-slate-200">{alert.message}</p>
                      <p className="mt-1 font-mono-display text-xs text-cyan-600 dark:text-cyan-300">affected_agents: {alert.affected}</p>
                    </div>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="ui-card p-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300">Reroute Alert Log</h3>
            <div className="mt-4 max-h-72 space-y-2 overflow-auto pr-1">
              {sortedAlerts.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
                  No alerts yet
                </p>
              ) : (
                sortedAlerts.map((alert) => (
                  <article key={alert.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{reasonLabel(alert.reason)}</p>
                      <p className="text-xs text-slate-500">{formatTs(alert.ts)}</p>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      Affected: {alert.affected}
                      {alert.old_exit ? ` | ${alert.old_exit}` : ""}
                      {alert.new_exit ? ` -> ${alert.new_exit}` : ""}
                    </p>
                  </article>
                ))
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
