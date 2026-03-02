import { Globe } from "@/components/ui/globe";
import { useMemo } from "react";
import type { COBEOptions } from "cobe";

interface CrowdSafeGlobeProps {
  darkMode?: boolean;
}

export function CrowdSafeGlobe({ darkMode = true }: CrowdSafeGlobeProps) {
  // Globe theme is intentionally opposite of landing page theme.
  const isDarkTheme = !darkMode;

  const globeConfig = useMemo<COBEOptions>(
    () => ({
      width: 800,
      height: 800,
      onRender: () => {},
      devicePixelRatio: 2,
      phi: 0,
      theta: 0.3,
      dark: isDarkTheme ? 1 : 0,
      diffuse: 0.4,
      mapSamples: 16000,
      mapBrightness: isDarkTheme ? 0.85 : 1.2,
      baseColor: isDarkTheme ? [30 / 255, 41 / 255, 59 / 255] : [1, 1, 1],
      markerColor: isDarkTheme
        ? [56 / 255, 189 / 255, 248 / 255]
        : [251 / 255, 100 / 255, 21 / 255],
      glowColor: isDarkTheme ? [100 / 255, 116 / 255, 139 / 255] : [1, 1, 1],
      markers: [
        { location: [14.5995, 120.9842], size: 0.03 },
        { location: [19.076, 72.8777], size: 0.1 },
        { location: [23.8103, 90.4125], size: 0.05 },
        { location: [30.0444, 31.2357], size: 0.07 },
        { location: [39.9042, 116.4074], size: 0.08 },
        { location: [-23.5505, -46.6333], size: 0.1 },
        { location: [19.4326, -99.1332], size: 0.1 },
        { location: [40.7128, -74.006], size: 0.1 },
        { location: [34.6937, 135.5022], size: 0.05 },
        { location: [41.0082, 28.9784], size: 0.06 }
      ]
    }),
    [isDarkTheme]
  );

  return (
    <div
      className={`relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden px-4 sm:gap-8 ${
        darkMode ? "bg-slate-950" : "bg-slate-100"
      }`}
    >
      <span
        className={`pointer-events-none z-10 whitespace-pre-wrap bg-clip-text text-center text-6xl font-semibold leading-none text-transparent sm:text-7xl md:text-8xl ${
          darkMode
            ? "bg-gradient-to-b from-white to-slate-300/70"
            : "bg-gradient-to-b from-black to-slate-700/70"
        }`}
      >
        CrowdSafe
      </span>
      <div className="relative z-10 aspect-square w-full max-w-[700px]">
        <Globe className="top-0 max-w-[700px]" config={globeConfig} />
      </div>
      <div
        className={`pointer-events-none absolute inset-0 h-full ${
          darkMode
            ? "bg-[radial-gradient(circle_at_50%_120%,rgba(2,6,23,0.25),rgba(2,6,23,0))]"
            : "bg-[radial-gradient(circle_at_50%_120%,rgba(15,23,42,0.08),rgba(255,255,255,0))]"
        }`}
      />
    </div>
  );
}
