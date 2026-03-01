import { Map as MapIcon } from "lucide-react";
import { Link } from "react-router-dom";

const statCards = [
  "Total Population",
  "Evacuated Count",
  "In Danger Zone",
  "Avg ETA to Exit",
  "Busiest Exit",
  "Active Hazards"
];

export default function Dashboard() {
  return (
    <section className="h-full overflow-auto bg-slate-100 px-4 py-4 sm:px-6 sm:py-6 md:px-8 md:py-8 lg:px-10 lg:py-10 xl:px-12 xl:py-12 dark:bg-slate-950">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-6">
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
          {statCards.map((label) => (
            <article
              key={label}
              className="ui-card p-4"
            >
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</h2>
              <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-200">--</p>
            </article>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-1 md:grid-cols-1 lg:grid-cols-[2fr_3fr] xl:grid-cols-[2fr_3fr]">
          <article className="ui-card p-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300">Campus Mini-Map</h3>
            <div className="mt-4 h-64 rounded-lg border border-dashed border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-950/50" />
          </article>

          <article className="ui-card p-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-300">Exit Control & Alert Log</h3>
            <div className="mt-4 h-64 rounded-lg border border-dashed border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-950/50" />
          </article>
        </div>
      </div>
    </section>
  );
}
