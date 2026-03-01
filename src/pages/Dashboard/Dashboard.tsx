import { Map as MapIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../../lib/api";
import type { ExitStatus } from "../../lib/types";
import { useSimStore } from "../../store/useSimStore";

function reasonLabel(reason: string): string {
  return reason.replace(/_/g, " ");
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
  const agents = useSimStore((state) => state.agents);
  const exits = useSimStore((state) => state.exits);
  const hazards = useSimStore((state) => state.hazards);
  const alerts = useSimStore((state) => state.alerts);

  const [workingExit, setWorkingExit] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = agents.length;
    const evacuated = agents.filter((agent) => agent.status === "safe").length;
    const danger = agents.filter((agent) => agent.status === "danger").length;
    const etaAgents = agents.filter((agent) => agent.status === "evacuating" && agent.path_eta_s !== null);
    const avgEta = etaAgents.length
      ? Math.round(etaAgents.reduce((sum, agent) => sum + (agent.path_eta_s ?? 0), 0) / etaAgents.length)
      : 0;

    const busiestExit = exits.length ? [...exits].sort((a, b) => b.queue - a.queue)[0]?.id ?? "N/A" : "N/A";

    return {
      total,
      evacuated,
      danger,
      avgEta,
      busiestExit,
      activeHazards: hazards.length
    };
  }, [agents, exits, hazards.length]);

  const sortedAlerts = useMemo(
    () => [...alerts].sort((a, b) => b.ts - a.ts || b.id.localeCompare(a.id)).slice(0, 40),
    [alerts]
  );

  const cycleStatus = async (exitId: string, current: ExitStatus) => {
    setWorkingExit(exitId);
    try {
      await apiClient.setExitStatus(exitId, { status: nextStatus(current) });
    } catch (error) {
      console.error("Failed to update exit", error);
    } finally {
      setWorkingExit(null);
    }
  };

  return (
    <section className="h-full overflow-auto bg-slate-100 px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 lg:px-10 lg:py-10 xl:px-12 xl:py-12 dark:bg-slate-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">CrowdSafe Dashboard</h1>
          <Link
            to="/"
            className="ui-button flex items-center gap-2 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <MapIcon className="h-4 w-4" />
            <span>Map</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article className="ui-card p-4"><p className="text-xs uppercase text-slate-500">Total Population</p><p className="mt-2 text-2xl font-semibold">{stats.total}</p></article>
          <article className="ui-card p-4"><p className="text-xs uppercase text-slate-500">Evacuated</p><p className="mt-2 text-2xl font-semibold text-emerald-600">{stats.evacuated}</p></article>
          <article className="ui-card p-4"><p className="text-xs uppercase text-slate-500">In Danger</p><p className="mt-2 text-2xl font-semibold text-rose-600">{stats.danger}</p></article>
          <article className="ui-card p-4"><p className="text-xs uppercase text-slate-500">Avg ETA</p><p className="mt-2 text-2xl font-semibold">{stats.avgEta}s</p></article>
          <article className="ui-card p-4"><p className="text-xs uppercase text-slate-500">Busiest Exit</p><p className="mt-2 text-2xl font-semibold">{stats.busiestExit}</p></article>
          <article className="ui-card p-4"><p className="text-xs uppercase text-slate-500">Active Hazards</p><p className="mt-2 text-2xl font-semibold">{stats.activeHazards}</p></article>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
          <article className="ui-card p-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300">Exit Control Table (Open {"->"} Congested {"->"} Blocked)</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-300">
                    <th className="px-2 py-2">Exit</th>
                    <th className="px-2 py-2">Queue</th>
                    <th className="px-2 py-2">Capacity</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Override</th>
                    <th className="px-2 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {exits.map((exitData) => (
                    <tr key={exitData.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-2 font-medium">{exitData.id}</td>
                      <td className="px-2 py-2">{exitData.queue}</td>
                      <td className="px-2 py-2">{exitData.capacity}</td>
                      <td className="px-2 py-2">{exitData.status}</td>
                      <td className="px-2 py-2 text-xs">{exitData.override ? "Manual" : "Auto"}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          className="ui-button border border-slate-300 bg-white text-xs dark:border-slate-700 dark:bg-slate-800"
                          disabled={workingExit === exitData.id}
                          onClick={() => cycleStatus(exitData.id, exitData.status)}
                        >
                          Cycle
                        </button>
                      </td>
                    </tr>
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
