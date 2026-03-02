import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Agent } from "../../lib/types";

interface SectorDensityChartProps {
  agents: Agent[];
}

const palette = ["#3B82F6", "#06B6D4", "#6366F1", "#8B5CF6", "#10B981", "#F59E0B"];

interface SectorPoint {
  name: string;
  value: number;
}

function densityLabel(pct: number): string {
  if (pct >= 40) return "Critical";
  if (pct >= 25) return "High";
  if (pct >= 12) return "Medium";
  return "Low";
}

export default function SectorDensityChart({ agents }: SectorDensityChartProps) {
  const bySector = new Map<number, number>();
  for (const agent of agents) {
    bySector.set(agent.sector, (bySector.get(agent.sector) ?? 0) + 1);
  }

  const data: SectorPoint[] = Array.from(bySector.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sector, count]) => ({ name: `Sector ${sector}`, value: count }));

  const total = agents.length || 1;

  return (
    <article className="ui-card border-[#1E2D4A] bg-[#0F1629] p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Crowd Distribution By Sector</p>
      <div className="mt-2 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={92} paddingAngle={2}>
              {data.map((point, idx) => (
                <Cell key={point.name} fill={palette[idx % palette.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#162040", border: "1px solid #1E2D4A", borderRadius: 10, color: "#F1F5F9" }}
              formatter={(value: unknown, _name: unknown, item) => {
                const numeric = Number(value ?? 0);
                const pct = Math.round((numeric / total) * 100);
                return [`${numeric} agents (${pct}%) - ${densityLabel(pct)}`, (item.payload as SectorPoint).name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        {data.map((point, idx) => {
          const pct = Math.round((point.value / total) * 100);
          return (
            <div key={point.name} className="flex items-center justify-between rounded-md border border-[#1E2D4A] bg-[#1A2540] px-2 py-1">
              <span className="flex items-center gap-1 text-slate-300">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: palette[idx % palette.length] }} />
                {point.name}
              </span>
              <span className="font-mono text-slate-400">
                {point.value} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-center">
        <p className="font-mono text-2xl font-bold text-slate-100">{agents.length.toLocaleString()}</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">Agents</p>
      </div>
    </article>
  );
}
