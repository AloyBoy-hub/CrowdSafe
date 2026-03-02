import type { Agent } from "../../lib/types";
import { GlassCard } from "../../components/ui/glass-card";
import { countAgentsBySector, SECTOR_NAMES, type SectorName } from "../../lib/sectors";

interface SectorDensityChartProps {
  agents: Agent[];
}

const palette: Record<SectorName, string> = {
  North: "#3B82F6",
  South: "#06B6D4",
  East: "#6366F1",
  West: "#8B5CF6"
};

export default function SectorDensityChart({ agents }: SectorDensityChartProps) {
  const bySector = countAgentsBySector(agents);
  const total = agents.length || 1;

  return (
    <GlassCard glow className="flex h-full flex-col gap-0 border-white/20 bg-white/[0.06] p-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Crowd by sector</p>
      <p className="mt-1 text-xs text-slate-400">North/South = lat; East/West = lng (relative to stadium center)</p>
      <div className="mt-3 grid flex-1 grid-cols-2 gap-2">
        {SECTOR_NAMES.map((name) => {
          const value = bySector[name];
          const pct = Math.round((value / total) * 100);
          return (
            <div
              key={name}
              className="flex items-center justify-between rounded-lg border border-[#1E2D4A] bg-[#1A2540] px-3 py-2"
            >
              <span className="flex items-center gap-2 text-slate-300">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: palette[name] }}
                />
                {name}
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums text-slate-100">
                {value}
                <span className="ml-1 text-xs font-normal text-slate-500">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-center">
        <p className="font-mono text-2xl font-bold text-slate-100">{agents.length.toLocaleString()}</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">Total agents</p>
      </div>
    </GlassCard>
  );
}
