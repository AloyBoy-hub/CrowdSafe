import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { EvacHistoryPoint } from "../../lib/dashboardMetrics";

interface EvacuationProgressChartProps {
  data: EvacHistoryPoint[];
}

function formatTs(value: number): string {
  const d = new Date(value);
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${mm}:${ss}`;
}

export default function EvacuationProgressChart({ data }: EvacuationProgressChartProps) {
  return (
    <article className="ui-card border-[#1E2D4A] bg-[#0F1629] p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Evacuation Status Over Time</p>
      <div className="mt-3 h-64 w-full">
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
            <Area type="monotone" dataKey="evacuating" stackId="1" stroke="#F59E0B" fill="#F59E0B20" strokeWidth={2} />
            <Area type="monotone" dataKey="safe" stackId="1" stroke="#10B981" fill="#10B98120" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

