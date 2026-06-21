"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import { Card, CardHeader } from "../../components/ui/card";
import { useFilters, formatRange } from "@/src/features/dashboard/filters/filters-context";
import { useOptimized } from "@/src/features/dashboard/queries/useEnergyQueries";

type Row = { ts?: string; power?: number; powerOptimized?: number };

const TARGET_POINTS = 240;
const EUR_PER_KWH = 0.3; // assumption
const KG_CO2_PER_KWH = 0.4; // assumption

function labelFor(ts: string, multiDay: boolean) {
  const d = new Date(ts);
  return multiDay
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit" }).format(d)
    : new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(d);
}

export function EnergyChart() {
  const { range, coverage } = useFilters();
  const window = coverage.window === "cooling" ? "cooling" : "heating";
  const { data, isLoading } = useOptimized(window);

  const { rows, peak, measuredKwh, optimizedKwh, savedKwh } = useMemo(() => {
    const all: Row[] = (data?.data ?? []) as Row[];
    const dt: number = data?.dtHours ?? 5 / 60;
    const inRange = all.filter((p) => {
      const d = String(p.ts ?? "").slice(0, 10);
      return d >= range.from && d <= range.to && typeof p.power === "number";
    });

    const measuredKwh = inRange.reduce((s, p) => s + (p.power as number) * dt, 0);
    const optimizedKwh = inRange.reduce((s, p) => s + (p.powerOptimized ?? p.power ?? 0) * dt, 0);
    const peak = inRange.reduce((m, p) => Math.max(m, p.power as number), 0);

    const multiDay = range.from !== range.to;
    const step = Math.max(1, Math.ceil(inRange.length / TARGET_POINTS));
    const rows = inRange
      .filter((_, i) => i % step === 0)
      .map((p) => ({
        label: labelFor(String(p.ts), multiDay),
        power: p.power as number,
        optimized: p.powerOptimized as number,
      }));

    return { rows, peak, measuredKwh, optimizedKwh, savedKwh: Math.max(0, measuredKwh - optimizedKwh) };
  }, [data, range]);

  const hasData = rows.length > 0;
  const savedEur = savedKwh * EUR_PER_KWH;

  return (
    <Card>
      <CardHeader
        title="Power Consumption"
        subtitle={`Measured vs. optimized control · ${formatRange(range)}`}
        action={
          hasData ? (
            <div className="flex items-center gap-4 text-xs text-graphite-600/80">
              <Legend color="#ff6148" label="Measured" />
              <Legend color="#1fa971" label="Optimized (model)" />
            </div>
          ) : null
        }
      />

      {!hasData ? (
        <div className="flex h-[280px] flex-col items-center justify-center gap-1 text-sm text-graphite-600/70">
          {isLoading ? (
            "Loading power data…"
          ) : (
            <>
              <p>No power data in the selected range.</p>
              <p className="text-xs">
                Use the <strong>Heating week</strong> or <strong>Cooling week</strong> preset.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-6">
            <Stat label="Peak" value={`${peak.toFixed(1)} kW`} />
            <Stat label="Measured" value={`${Math.round(measuredKwh).toLocaleString("en-US")} kWh`} />
            <Stat label="Optimized" value={`${Math.round(optimizedKwh).toLocaleString("en-US")} kWh`} />
            <Stat
              label="Saving"
              value={`${Math.round(savedKwh).toLocaleString("en-US")} kWh · €${Math.round(savedEur).toLocaleString("en-US")}`}
              accent
            />
          </div>

          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%" minHeight={0}>
              <ComposedChart data={rows} margin={{ top: 12, right: 12, left: -4, bottom: 10 }}>
                <defs>
                  <linearGradient id="power-actual-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff6148" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#ff6148" stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid stroke="#E7E9ED" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  minTickGap={48}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}`}
                />
                <Tooltip
                  formatter={(value, name) => [`${Number(value).toFixed(1)} kW`, name]}
                  labelStyle={{ fontSize: 12 }}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E7E9ED" }}
                />

                <Area
                  type="monotone"
                  dataKey="power"
                  stroke="#ff6148"
                  strokeWidth={2}
                  fill="url(#power-actual-fill)"
                  name="Measured"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="optimized"
                  stroke="#1fa971"
                  strokeWidth={2.5}
                  dot={false}
                  name="Optimized (model)"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-0.5 w-3.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase text-graphite-600/60">{label}</p>
      <p className={`tabular text-lg font-semibold ${accent ? "text-ember-600" : "text-graphite-900"}`}>{value}</p>
    </div>
  );
}
