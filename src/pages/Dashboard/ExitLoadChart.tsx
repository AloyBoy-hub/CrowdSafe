import type { TooltipProps } from "recharts";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { GlassCard } from "../../components/ui/glass-card";
import { cn } from "../../lib/utils";
import type { Exit } from "../../lib/types";

interface ExitLoadChartProps {
  exits: Exit[];
  className?: string;
  chartHeightClass?: string;
}

const EXIT_OCCUPANCY_BASELINE = 150;

interface ExitLoadPoint {
  id: string;
  label: string;
  queue: number;
  pct: number;
  status: Exit["status"];
}

function barColor(point: ExitLoadPoint): string {
  if (point.status === "blocked") return "#EF4444";
  if (point.pct >= 85) return "#EF4444";
  if (point.pct >= 60) return "#F59E0B";
  return "#10B981";
}

export default function ExitLoadChart({
  exits,
  className,
  chartHeightClass = "h-64"
}: ExitLoadChartProps) {
  const data: ExitLoadPoint[] = exits.map((exit) => {
    const queue = Math.max(0, Math.round(exit.queue));
    const pct = Math.round((queue / EXIT_OCCUPANCY_BASELINE) * 100);
    return {
      id: exit.id,
      label: (exit.name ?? exit.id).replace(/_/g, " "),
      queue,
      pct: Math.max(0, Math.min(100, pct)),
      status: exit.status
    };
  });

  return (
    <GlassCard glow className={cn("gap-0 border-white/20 bg-white/[0.06] p-4 py-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Exit Congestion (Current Occupancy)</p>
      <div className={cn("mt-3 w-full", chartHeightClass)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
            <CartesianGrid stroke="#1E2D4A" strokeDasharray="4 4" />
            <XAxis type="number" domain={[0, 100]} tick={{ fill: "#94A3B8", fontSize: 11 }} />
            <YAxis dataKey="label" type="category" tick={{ fill: "#CBD5E1", fontSize: 11 }} width={96} />
            <Tooltip
              contentStyle={{ background: "#162040", border: "1px solid #1E2D4A", borderRadius: 10, color: "#F1F5F9" }}
              labelStyle={{ color: "#F1F5F9" }}
              itemStyle={{ color: "#F1F5F9" }}
              formatter={(_, __, item) => {
                const p = item.payload as ExitLoadPoint;
                return [`${p.queue} / ${EXIT_OCCUPANCY_BASELINE} (${p.pct}%)`, "Congestion"];
              }}
            />
            <ReferenceLine x={60} stroke="#F59E0B" strokeDasharray="4 4" />
            <ReferenceLine x={85} stroke="#EF4444" strokeDasharray="4 4" />
            <Bar
              dataKey="pct"
              radius={[4, 4, 4, 4]}
              label={{ position: "right", fill: "#94A3B8", fontSize: 11, formatter: (v) => `${Number(v ?? 0)}%` }}
            >
              {data.map((point) => (
                <Cell key={point.id} fill={barColor(point)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
