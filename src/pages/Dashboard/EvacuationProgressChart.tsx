import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { GlassCard } from "../../components/ui/glass-card";
import { cn } from "../../lib/utils";
import type { EvacHistoryPoint } from "../../lib/dashboardMetrics";

interface EvacuationProgressChartProps {
  data: EvacHistoryPoint[];
  className?: string;
  chartHeightClass?: string;
}

function formatTs(value: number): string {
  const d = new Date(value);
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function EvacuationProgressChart({
  data,
  className,
  chartHeightClass = "h-64"
}: EvacuationProgressChartProps) {
  return (
    <GlassCard glow className={cn("gap-0 border-white/20 bg-white/[0.06] p-4 py-4", className)}>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Evacuation Status Over Time</p>
      <div className={cn("mt-3 w-full", chartHeightClass)}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid stroke="#1E2D4A" strokeDasharray="4 4" />
            <XAxis dataKey="ts" tickFormatter={formatTs} tick={{ fill: "#94A3B8", fontSize: 11 }} />
            <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
            <Tooltip
              labelFormatter={(label) => formatTs(Number(label))}
              contentStyle={{ background: "#162040", border: "1px solid #1E2D4A", borderRadius: 10, color: "#F1F5F9" }}
            />
            <Area type="monotone" dataKey="normal" stackId="1" stroke="#3B82F6" fill="#3B82F620" strokeWidth={2} />
            <Area type="monotone" dataKey="safe" stackId="1" stroke="#10B981" fill="#10B98120" strokeWidth={2} />
            <Area type="monotone" dataKey="evacuating" stackId="1" stroke="#F59E0B" fill="#F59E0B20" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </GlassCard>
  );
}
