import { NavLink } from "react-router-dom";
import type { ConnectionState } from "../hooks/useSimulation";

interface NavBarProps {
  connectionState: ConnectionState;
}

function linkClass({ isActive }: { isActive: boolean }) {
  return [
    "ui-clickable rounded-lg px-3 py-2 text-sm font-medium shadow-sm ring-1",
    isActive
      ? "bg-blue-600 text-white ring-blue-600"
      : "bg-slate-200 text-slate-800 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700"
  ].join(" ");
}

export default function NavBar({ connectionState }: NavBarProps) {
  const statusColor =
    connectionState === "open"
      ? "bg-emerald-400"
      : connectionState === "connecting"
        ? "bg-amber-400"
        : "bg-rose-400";

  const statusText =
    connectionState === "open" ? "Connected" : connectionState === "connecting" ? "Connecting" : "Disconnected";

  return (
    <header className="border-b border-slate-200 bg-white/85 backdrop-blur dark:border-slate-800 dark:bg-slate-900/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">CrowdSafe</span>
          <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Module 1
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <NavLink className={linkClass} to="/">
            Map
          </NavLink>
          <NavLink className={linkClass} to="/dashboard">
            Dashboard
          </NavLink>
        </nav>
        <div className="ui-card flex items-center gap-2 px-2 py-1 text-xs text-slate-700 dark:text-slate-200">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
          <span>WS {statusText}</span>
        </div>
      </div>
    </header>
  );
}
