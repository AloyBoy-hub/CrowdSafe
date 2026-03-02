import { Globe } from "@/components/ui/globe";

export function CrowdSafeGlobe() {
  return (
    <div className="relative flex size-full max-w-lg items-center justify-center overflow-hidden rounded-lg border border-slate-700 bg-slate-900 px-40 pb-40 pt-8 md:pb-60 md:shadow-xl">
      <span className="pointer-events-none whitespace-pre-wrap bg-gradient-to-b from-white to-slate-300/70 bg-clip-text text-center text-6xl font-semibold leading-none text-transparent md:text-8xl">
        CrowdSafe
      </span>
      <Globe className="top-28" />
      <div className="pointer-events-none absolute inset-0 h-full bg-[radial-gradient(circle_at_50%_200%,rgba(0,0,0,0.35),rgba(255,255,255,0))]" />
    </div>
  );
}
