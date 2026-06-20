"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardHeader } from "../../components/ui/card";
import { useEnergyComparison } from "./queries/useEnergyQueries";

interface EnergyData {
  day: string;
  ours: number;     // B3 — our controller
  current: number;  // B1 — current system
}

interface BacktestEvent {
  event_start: string;
  E_B1_kwh: number;
  E_B3_kwh: number;
}

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: "short" });
};

export function EnergyChart() {
  // Live B1-vs-B3 per-event energy from the model API (GET /backtest).
  const { data } = useEnergyComparison("heating");
  const events: BacktestEvent[] = data?.events ?? [];
  const chartData: EnergyData[] = events.map((e) => ({
    day: dayLabel(e.event_start),
    ours: e.E_B3_kwh,
    current: e.E_B1_kwh,
  }));
  const maxY = Math.max(100, ...chartData.map((d) => d.current));

  return (
    <Card>
      <CardHeader
        title="Energy Consumption — current vs. ours"
        action={
          <div className="flex items-center gap-4 text-xs text-graphite-600/80">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 rounded-full bg-green-500" />
              Our controller
            </span>

            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 border-t-2 border-dashed border-gray-400" />
              Current system
            </span>
          </div>
        }
      />

      <div className="h-[280px] w-full">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-graphite-600/60">
            Loading energy data…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 10 }}>
              <defs>
                <linearGradient id="energy-chart-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="#E7E9ED" vertical={false} strokeDasharray="0" />

              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />

              <YAxis
                domain={[0, Math.ceil(maxY / 50) * 50]}
                tickFormatter={(value) => (value === 0 ? "0" : `${value}`)}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12 }}
              />

              {/* Area fill (ours) */}
              <Area type="monotone" dataKey="ours" stroke="none" fill="url(#energy-chart-gradient)" />

              {/* Current system (dashed) */}
              <Line
                type="monotone"
                dataKey="current"
                stroke="#9AA3AF"
                strokeWidth={2}
                strokeDasharray="5 6"
                dot={false}
              />

              {/* Our controller */}
              <Line
                type="monotone"
                dataKey="ours"
                stroke="#22C55E"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, stroke: "#22C55E", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
