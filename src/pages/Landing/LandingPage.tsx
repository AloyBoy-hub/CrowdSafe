import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ThemeSwitcher, type Theme } from "../../components/ui/apple-liquid-glass-switcher";
import { StackedCards, type StackedEventCard } from "../../components/ui/glass-cards";
import { GlassFilter, LiquidButton } from "../../components/ui/liquid-glass-button";
import { MagicTextReveal } from "../../components/ui/magic-text-reveal";
import { SparklesCore } from "../../components/ui/sparkles";

const LIVE_EVENTS: StackedEventCard[] = [
  {
    id: 1,
    title: "Coldplay concert at National Stadium",
    description: "High inbound density near Gate 6 and central concourse. Crowd flow monitoring is active across stadium entry corridors.",
    timeLabel: "Now • 19:00 - 23:00",
    crowdLabel: "Approx. 45,000 attendees",
    accentRgb: "56, 189, 248",
    imageUrl:
      "https://images.unsplash.com/photo-1519452575417-564c1401ecc0?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: 2,
    title: "Championship Watch Party",
    description: "Steady ingress at north stand. Medical and ops teams monitoring density near food court lanes.",
    timeLabel: "Live • Kickoff + 20 min",
    crowdLabel: "Approx. 6,200 attendees",
    accentRgb: "74, 222, 128",
    imageUrl:
      "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: 3,
    title: "Convention Hall Tech Summit",
    description: "Panel transition in progress. Exit 2 expected to absorb the highest outflow in the next 15 minutes.",
    timeLabel: "In Session • Hall B",
    crowdLabel: "Approx. 4,100 attendees",
    accentRgb: "251, 146, 60",
    imageUrl:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: 4,
    title: "Open-Air Campus Carnival",
    description: "Multiple micro-hotspots detected. Dynamic wayfinding signs are redirecting flow to outer pathways.",
    timeLabel: "Ongoing • Zone C",
    crowdLabel: "Approx. 7,300 attendees",
    accentRgb: "244, 114, 182",
    imageUrl:
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?auto=format&fit=crop&w=900&q=80"
  }
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [themeMode, setThemeMode] = useState<Theme>(() => {
    const stored = localStorage.getItem("landing-theme-mode");
    if (stored === "light" || stored === "dark" || stored === "dim") return stored;
    return "dark";
  });

  const darkMode = themeMode !== "light";
  const dimMode = themeMode === "dim";

  useEffect(() => {
    localStorage.setItem("landing-theme-mode", themeMode);
  }, [themeMode]);

  return (
    <div className={darkMode ? "dark" : ""}>
      <section
        className={`min-h-screen text-slate-900 transition-colors duration-300 ${
          darkMode ? (dimMode ? "bg-slate-900 text-slate-50" : "bg-slate-950 text-slate-50") : "bg-slate-100"
        }`}
      >
        <GlassFilter />
        <div className="fixed right-4 top-4 z-50">
          <ThemeSwitcher value={themeMode} onValueChange={setThemeMode} />
        </div>

        <div
          className={`relative flex min-h-[34rem] flex-col items-center justify-center overflow-hidden px-4 pt-20 ${
            darkMode ? (dimMode ? "bg-slate-900" : "bg-slate-950") : "bg-slate-100"
          }`}
        >
          <div className="absolute inset-0 z-0">
            <SparklesCore
              id="crowdsafe-sparkles"
              background="transparent"
              minSize={0.4}
              maxSize={1.1}
              particleDensity={1000}
              className="h-full w-full"
              particleColor={darkMode ? (dimMode ? "#CBD5E1" : "#E2E8F0") : "#0F172A"}
              speed={1.2}
            />
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-56 bg-gradient-to-b from-black/25 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-56 bg-gradient-to-t from-black/40 to-transparent dark:from-slate-950/70" />

          <div className="relative z-20 mx-auto flex max-w-4xl flex-col items-center gap-3 text-center">
            <p className="rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
              Crowd Safety Intelligence
            </p>
            <MagicTextReveal
              text="CrowdSafe"
              color={darkMode ? "rgba(226, 232, 240, 0.98)" : "rgba(15, 23, 42, 0.98)"}
              fontSize={88}
              fontFamily="Zodiak, Sora, Outfit, Segoe UI, serif"
              fontWeight={700}
              spread={32}
              speed={0.45}
              density={4}
              paddingScale={0.32}
              alwaysShowText
              className="mx-auto"
              style={{
                backgroundColor: "transparent",
                border: "none",
                backdropFilter: "none",
                cursor: "default",
                minWidth: "unset",
                minHeight: "unset"
              }}
            />
            <p className={`max-w-2xl text-sm sm:text-base ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
              Live crowd monitoring, hazard-aware rerouting, and faster evacuation decisions for high-density events.
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
              <LiquidButton
                size="lg"
                className={`rounded-full ${darkMode ? "text-slate-100" : "text-slate-900"}`}
                onClick={() => navigate("/map")}
              >
                Open Live Map
              </LiquidButton>
              <LiquidButton
                size="lg"
                className={`rounded-full ${darkMode ? "text-slate-100" : "text-slate-900"}`}
                onClick={() => navigate("/dashboard")}
              >
                View Dashboard
              </LiquidButton>
            </div>
          </div>
        </div>

        <div
          className={`relative ${
            darkMode ? (dimMode ? "bg-slate-900" : "bg-slate-950") : "bg-slate-100"
          }`}
        >
          <div className="pointer-events-none absolute inset-0 z-0">
            <SparklesCore
              id="crowdsafe-events-sparkles"
              background="transparent"
              minSize={0.3}
              maxSize={0.8}
              particleDensity={160}
              className="h-full w-full"
              particleColor={darkMode ? (dimMode ? "#94A3B8" : "#CBD5E1") : "#334155"}
              speed={0.55}
            />
          </div>
          <div className="relative z-10">
            <StackedCards
              cards={LIVE_EVENTS}
              className="bg-transparent"
              onCardClick={(card) => {
                if (card.title === "Coldplay concert at National Stadium") {
                  navigate("/map");
                }
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
