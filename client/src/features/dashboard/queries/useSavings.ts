"use client";

import { useMemo } from "react";
import { useFilters } from "@/src/features/dashboard/filters/filters-context";
import { useOptimized } from "@/src/features/dashboard/queries/useEnergyQueries";

type Row = { ts?: string; power?: number; powerOptimized?: number };

const EUR_PER_KWH = 0.3; // assumption (matches the consumption chart)
const KG_CO2_PER_KWH = 0.4; // assumption

export type Savings = {
  savedKwh: number;
  savedEur: number;
  savedCo2Kg: number;
  measuredKwh: number;
  optimizedKwh: number;
  pct: number;
  events: number; // distinct days in range (≈ heating pulses)
  hasData: boolean;
  isLoading: boolean;
};

/**
 * Single source of truth for energy/cost/CO₂ saved, derived from the consumption
 * graph: the measured vs. optimized power difference over the selected range.
 * Used by the Overview KPIs, the Energy & Savings page and the Power chart so
 * every savings figure on the dashboard matches.
 */
export function useSavings(): Savings {
  const { range, coverage } = useFilters();
  const window = coverage.window === "cooling" ? "cooling" : "heating";
  const { data, isLoading } = useOptimized(window);

  return useMemo(() => {
    const all: Row[] = (data?.data ?? []) as Row[];
    const dt: number = data?.dtHours ?? 0.25;

    const inRange = all.filter((p) => {
      const d = String(p.ts ?? "").slice(0, 10);
      return d >= range.from && d <= range.to && typeof p.power === "number";
    });

    const measuredKwh = inRange.reduce((s, p) => s + (p.power ?? 0) * dt, 0);
    const optimizedKwh = inRange.reduce((s, p) => s + (p.powerOptimized ?? p.power ?? 0) * dt, 0);
    const savedKwh = Math.max(0, measuredKwh - optimizedKwh);
    const days = new Set(inRange.map((p) => String(p.ts).slice(0, 10))).size;

    return {
      savedKwh,
      savedEur: savedKwh * EUR_PER_KWH,
      savedCo2Kg: savedKwh * KG_CO2_PER_KWH,
      measuredKwh,
      optimizedKwh,
      pct: measuredKwh > 0 ? Math.round((savedKwh / measuredKwh) * 100) : 0,
      events: days,
      hasData: inRange.length > 0,
      isLoading,
    };
  }, [data, range, isLoading]);
}
