"use client";

import { Card } from "../../components/ui/card";
import { useEnergyStatistics } from "./queries/useEnergyQueries";

interface Stat {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  footnote: string;
  icon: React.ReactNode;
  iconBg: string;
}

function Icon({ name }: { name: "bolt" | "euro" | "leaf" | "pump" }) {
  const common = "h-5 w-5";
  switch (name) {
    case "bolt":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" strokeLinejoin="round" />
        </svg>
      );
    case "euro":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 7a6.5 6.5 0 1 0 0 10M4 10h9M4 14h9" strokeLinecap="round" />
        </svg>
      );
    case "leaf":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 21c4-3 7-6.5 7-11a7 7 0 0 0-14 0c0 4.5 3 8 7 11Z" strokeLinejoin="round" />
          <path d="M12 17V9" strokeLinecap="round" />
        </svg>
      );
    case "pump":
      return (
        <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h2" strokeLinecap="round" />
        </svg>
      );
  }
}

const fmt = (n: number | undefined, d = 0) =>
  n === undefined ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d });

export function KpiRow() {
  // Live KPIs from the model API (GET /energy/statistics). See useEnergyQueries.
  const { data, isLoading } = useEnergyStatistics();
  const pct = data?.pctSaved !== undefined ? `${data.pctSaved}%` : undefined;

  const stats: Stat[] = [
    {
      label: "Energy Saved",
      value: fmt(data?.energySavedKwh),
      unit: "kWh",
      delta: pct,
      footnote: "vs current system",
      icon: <Icon name="bolt" />,
      iconBg: "bg-ember-50 text-ember-600",
    },
    {
      label: "Cost Saved",
      value: data?.costSavedEur === undefined ? "—" : `€${fmt(data.costSavedEur)}`,
      delta: pct,
      footnote: "vs current system",
      icon: <Icon name="euro" />,
      iconBg: "bg-sky-50 text-sky-500",
    },
    {
      label: "CO₂ Saved",
      value: fmt(data?.co2SavedKg),
      unit: "kg",
      delta: pct,
      footnote: "vs current system",
      icon: <Icon name="leaf" />,
      iconBg: "bg-ember-50 text-ember-600",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {stats.map((s) => (
        <Card key={s.label} className="flex items-start gap-3.5">
          <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${s.iconBg}`}>
            {s.icon}
          </span>
          <div>
            <p className="text-[13px] text-graphite-600/80">{s.label}</p>
            <p className={`tabular mt-0.5 text-[22px] font-semibold leading-none text-graphite-900 ${isLoading ? "animate-pulse" : ""}`}>
              {s.value}
              {s.unit && <span className="ml-1 text-sm font-medium text-graphite-600/70">{s.unit}</span>}
            </p>
            <p className="mt-1.5 flex items-center gap-1 text-xs">
              {s.delta && (
                <span className="flex items-center gap-0.5 font-medium text-ember-600">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 19 19 5M9 5h10v10" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {s.delta}
                </span>
              )}
              <span className="text-graphite-600/60">{s.footnote}</span>
            </p>
          </div>
        </Card>
      ))}

      <Card className="flex items-start gap-3.5">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-coral-50 text-coral-500">
          <Icon name="pump" />
        </span>
        <div>
          <p className="text-[13px] text-graphite-600/80">Heat Pumps</p>
          <p className="tabular mt-0.5 text-[22px] font-semibold leading-none text-graphite-900">{fmt(data?.heatPumps)}</p>
          <p className="mt-1.5 text-xs text-graphite-600/70">
            <span className="text-graphite-900">
              {data?.onTimeRate !== undefined ? `${Math.round(data.onTimeRate * 100)}% on-time` : "—"}
            </span>{" "}
            · comfort
          </p>
        </div>
      </Card>
    </div>
  );
}
