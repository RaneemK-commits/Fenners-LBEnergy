"use client";

import { useMemo } from "react";
import { DetailTopbar } from "@/src/shared/detail-topbar";
import { useFilters, formatRange } from "@/src/features/dashboard/filters/filters-context";
import { useSchedule } from "@/src/features/dashboard/queries/useScheduleQueries";
import { Thermometer, Flame, Clock, Zap } from "lucide-react";

type Ev = {
  id: string;
  name: string;
  start: string;
  end: string | null;
  preheatStart: string;
  leadHours: number;
  targetC: number;
  peakC: number;
  heatingKw: number;
  energyKwh: number;
  outsideC: number;
};

const dayKey = (s: string) =>
  new Date(s).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric" });
const hm = (s: string | null) =>
  s ? new Date(s).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : "—";

export default function SchedulePage() {
  const { range, coverage } = useFilters();
  const window = coverage.window === "cooling" ? "cooling" : "heating";
  const { data, isLoading } = useSchedule(window);

  const grouped = useMemo(() => {
    const evs: Ev[] = ((data?.events ?? []) as Ev[]).filter((e) => {
      const d = String(e.start).slice(0, 10);
      return d >= range.from && d <= range.to;
    });
    const map = new Map<string, Ev[]>();
    for (const e of evs) {
      const k = dayKey(e.start);
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return Array.from(map.entries());
  }, [data, range]);

  const total = grouped.reduce((s, [, e]) => s + e.length, 0);

  return (
    <>
      <DetailTopbar
        backHref="/dashboard"
        backLabel="Dashboard"
        title="Schedule"
        subtitle={`${total} sessions · ${formatRange(range)}`}
      />

      <main className="flex flex-col gap-6">
        {isLoading && <p className="text-sm text-graphite-600/70">Loading schedule…</p>}
        {!isLoading && total === 0 && (
          <p className="text-sm text-graphite-600/70">No events in the selected range.</p>
        )}

        {grouped.map(([day, entries]) => (
          <section key={day}>
            <h2 className="mb-3 text-sm font-bold text-graphite-900">{day}</h2>
            <div className="flex flex-col gap-2">
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 border border-line bg-white p-3 dark:bg-graphite-800"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center bg-coral-50 text-coral-500">
                      <Clock className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-graphite-900">{e.name}</p>
                      <p className="text-sm text-graphite-600">
                        Occupied {hm(e.start)}–{hm(e.end)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-coral-600">
                      <Flame className="h-4 w-4" />
                      Preheat {hm(e.preheatStart)}
                      <span className="font-normal text-graphite-600/60">
                        (−{e.leadHours.toFixed(1)} h)
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-graphite-900">
                      <Zap className="h-4 w-4 text-graphite-600" />
                      {e.heatingKw} kW · {Math.round(e.energyKwh)} kWh
                    </span>
                    <span className="flex items-center gap-1.5 text-graphite-900">
                      <Thermometer className="h-4 w-4 text-graphite-600" />
                      peak {e.peakC}°C
                      <span className="font-normal text-graphite-600/60">(target {e.targetC}°C)</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
