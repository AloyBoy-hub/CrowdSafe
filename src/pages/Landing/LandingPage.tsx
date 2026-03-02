import { useEffect, useState } from "react";
import { CrowdSafeGlobe } from "@/components/ui/crowdsafe-globe";
import { EventCard } from "@/components/ui/event-card";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const EVENT_CARDS = [
  {
    imageUrl:
      "https://images.unsplash.com/photo-1519452575417-564c1401ecc0?auto=format&fit=crop&w=900&q=80"
  },
  {
    imageUrl:
      "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=900&q=80"
  },
  {
    imageUrl:
      "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=900&q=80"
  }
];

export default function LandingPage() {
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("landing-theme-mode") !== "light"
  );

  useEffect(() => {
    localStorage.setItem("landing-theme-mode", darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <div className={darkMode ? "dark" : ""}>
      <section
        className={`text-slate-900 transition-colors duration-300 ${
          darkMode ? "bg-slate-950 text-slate-50" : "bg-slate-100"
        }`}
      >
        <div className="fixed right-4 top-4 z-50">
          <ThemeToggle isDark={darkMode} onToggle={setDarkMode} />
        </div>
        <CrowdSafeGlobe darkMode={darkMode} />
        <div
          className={`mx-auto flex w-full max-w-7xl flex-wrap justify-center gap-5 px-4 pb-10 pt-8 transition-colors duration-300 sm:px-6 md:px-8 lg:px-10 xl:px-12 ${
            darkMode ? "bg-slate-950" : "bg-slate-100"
          }`}
        >
          {EVENT_CARDS.map((card, idx) => (
            <EventCard
              key={`event-card-${idx + 1}`}
              imageUrl={card.imageUrl}
            />
          ))}
          <EventCard isAddCard />
        </div>
      </section>
    </div>
  );
}
