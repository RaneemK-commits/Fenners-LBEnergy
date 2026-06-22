"use client";

import { useMemo } from "react";
import { useFilters } from "@/src/features/dashboard/filters/filters-context";
import { useFaults } from "@/src/features/dashboard/queries/useFaultQueries";
import type { FaultAlert, FaultSeverity } from "@/src/@types/fault.type";

const SEV_ORDER: Record<FaultSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Splits the real snapshot-derived faults into "active on the selected day" vs
 * "past / resolved", driven by the calendar (range.to = the day in focus).
 * Shared by the Alerts page and the sidebar badge so both always agree.
 */
export function useAlarms() {
  const { range, coverage } = useFilters();
  const window = coverage.window === "cooling" ? "cooling" : "heating";
  const { data, isLoading } = useFaults(window);

  return useMemo(() => {
    const all: FaultAlert[] = data?.alerts ?? [];
    const day = range.to; // the end of the selected range = the day in focus ("today")
    const from = range.from;

    const dateOf = (s?: string) => (s ?? "").slice(0, 10);

    // Alarm overlaps `day` → it is active on that day.
    const isActive = (a: FaultAlert) => {
      const c = dateOf(a.createdAt);
      const r = a.resolvedAt ? dateOf(a.resolvedAt) : "";
      return c <= day && (!r || r >= day);
    };

    const inRange = all.filter((a) => {
      const c = dateOf(a.createdAt);
      return c >= from && c <= day;
    });

    const active = inRange
      .filter(isActive)
      .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.createdAt < b.createdAt ? 1 : -1));

    const past = inRange
      .filter((a) => !isActive(a))
      .sort((a, b) => ((a.resolvedAt ?? "") < (b.resolvedAt ?? "") ? 1 : -1));

    return {
      active,
      past,
      activeCount: active.length,
      day,
      isLoading,
      summary: data?.summary,
    };
  }, [data, range]);
}
