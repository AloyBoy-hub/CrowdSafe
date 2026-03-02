import { ArrowRight, LayoutDashboard, Map as MapIcon, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CrowdSafeGlobe } from "@/components/ui/crowdsafe-globe";
import { EventCard } from "@/components/ui/event-card";

const EVENT_IMAGES = [
  {
    title: "Campus Open House - North Spine",
    imageUrl:
      "https://images.unsplash.com/photo-1519452575417-564c1401ecc0?auto=format&fit=crop&w=900&q=80"
  },
  {
    title: "Night Sports Carnival - Main Field",
    imageUrl:
      "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=900&q=80"
  },
  {
    title: "Faculty Summit - Conference Block",
    imageUrl:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=900&q=80"
  }
];

export default function LandingPage() {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("campuswatch-dark-mode") !== "light"
  );

  useEffect(() => {
    localStorage.setItem("campuswatch-dark-mode", darkMode ? "dark" : "light");
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  return (
    <div className={darkMode ? "dark" : ""}>
      <section className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-4 sm:p-6 md:p-8 lg:p-10 xl:p-12">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              className="ui-button inline-flex items-center gap-2 border border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
              {darkMode ? "Light Mode" : "Dark Mode"}
            </button>
          </div>

          <header className="ui-card grid gap-6 border-slate-300 bg-slate-100/90 p-6 dark:border-slate-700 dark:bg-slate-900/90 md:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <p className="font-mono-display text-xs uppercase tracking-[0.2em] text-cyan-300">
              Real-time Crowd Intelligence
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">CrowdSafe</h1>
            <p className="max-w-xl text-sm text-slate-600 dark:text-slate-300 sm:text-base">
              Live campus crowd simulation, hazard response, and evacuation command
              center for rapid decision-making.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/map"
                className="ui-button inline-flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950"
              >
                <MapIcon size={16} />
                Open Map
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/dashboard"
                className="ui-button inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <LayoutDashboard size={16} />
                Open Dashboard
              </Link>
            </div>
          </div>
          <div className="relative h-[280px] md:h-[320px]">
            <CrowdSafeGlobe />
          </div>
          </header>

          <section className="ui-card border-slate-300 bg-slate-100/90 p-6 dark:border-slate-700 dark:bg-slate-900/90">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Current Events</h2>
              <p className="font-mono-display text-xs text-slate-500 dark:text-slate-400">4 cards</p>
            </div>
            <div className="flex flex-wrap gap-4">
              {EVENT_IMAGES.map((event) => (
                <EventCard key={event.title} title={event.title} imageUrl={event.imageUrl} />
              ))}
              <EventCard isAddCard />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
