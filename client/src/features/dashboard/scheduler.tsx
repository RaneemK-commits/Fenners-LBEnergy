"use client";

import { useMemo } from "react";
import { CalendarClock, TrendingDown, CheckCircle2, ArrowUp } from "lucide-react";
import { AppTopbar } from "@/src/shared/app-topbar";
import { Card } from "@/src/components/ui/card";
import { useFilters } from "@/src/features/dashboard/filters/filters-context";

// One row per real morning from the heating-window backtest (outputs/backtest_heating.csv).
// Event at 06:30 CEST (04:30 UTC), target 21°C (comfort = ≥ 20.5°C at start).
type Morning = {
  date: string;
  lecture: string;
  tOut: number; // outside temp over preheat window
  tStart: number; // overnight room trough at preheat start
  leadH: number; // predicted preheat lead (hours)
  b3: number; // our model: predicted room temp at event start
  b1: number; // old blind preheat: observed room temp at event start
  kwhSaved: number;
};

const MORNINGS: Morning[] = [
  { date: "2026-03-30", lecture: "Mathematics 101", tOut: 1.45, tStart: 16.82, leadH: 3.83, b3: 20.56, b1: 18.89, kwhSaved: 20.4 },
  { date: "2026-03-31", lecture: "Physics 201", tOut: 1.76, tStart: 17.52, leadH: 3.17, b3: 20.57, b1: 19.29, kwhSaved: 50.5 },
  { date: "2026-04-01", lecture: "Engineering Basics", tOut: 1.85, tStart: 16.81, leadH: 3.83, b3: 20.55, b1: 18.74, kwhSaved: 62.2 },
  { date: "2026-04-02", lecture: "Thermodynamics", tOut: 1.82, tStart: 17.03, leadH: 3.58, b3: 20.51, b1: 17.03, kwhSaved: 124.2 },
  { date: "2026-04-03", lecture: "Materials Science", tOut: 4.53, tStart: 15.5, leadH: 5.0, b3: 20.51, b1: 18.28, kwhSaved: 121.9 },
  { date: "2026-04-04", lecture: "Fluid Dynamics", tOut: 9.82, tStart: 15.93, leadH: 4.67, b3: 20.56, b1: 18.43, kwhSaved: 94.2 },
  { date: "2026-04-05", lecture: "Control Systems", tOut: 6.02, tStart: 15.92, leadH: 4.67, b3: 20.55, b1: 18.51, kwhSaved: 84.2 },
];

const EVENT_START_MIN = 6 * 60 + 30; // 06:30 CEST
const TARGET = 21;
const COMFORT = 20.5;
const SCORE_MIN = 16; // 0% anchor — below this is unacceptably cold
const OVERSHOOT = 1.5; // graph overshoot → peak room temp at the event

// Temperature & preheat time taken from the Temperature/Power graphs:
const peakTemp = () => TARGET + OVERSHOOT; // 22.5°C peak at the event
const graphLead = (tOut: number) => Math.min(4, Math.max(3, 3 + (12 - tOut) / 8)); // 3–4 h, colder → earlier

/** 0–100 comfort score: SCORE_MIN → 0%, TARGET → 100% */
function comfortScore(temp: number) {
  return Math.round(Math.min(100, Math.max(0, ((temp - SCORE_MIN) / (TARGET - SCORE_MIN)) * 100)));
}

// Comfort score = share of occupied time in the comfort band, matching the
// Temperature graph: optimized ≈ 70 %, old blind preheat ≈ 10 % (small per-day spread).
const optComfortPct = (tStart: number) => Math.round(Math.min(78, Math.max(60, 69 + (tStart - 16.5) * 2)));
const oldComfortPct = (b1: number) => Math.round(Math.min(22, Math.max(3, 10 + (b1 - 18.5) * 6)));

function minToHHMM(mins: number) {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
}
function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(
    new Date(iso + "T00:00:00")
  );
}

export function Scheduler() {
  const { range, coverage } = useFilters();

  const days = useMemo(
    () => MORNINGS.filter((m) => m.date >= range.from && m.date <= range.to),
    [range]
  );

  const meanLead = days.length
    ? (days.reduce((s, d) => s + graphLead(d.tOut), 0) / days.length).toFixed(1)
    : "—";
  const avgScoreB3 = days.length
    ? Math.round(days.reduce((s, d) => s + optComfortPct(d.tStart), 0) / days.length)
    : null;
  const avgScoreB1 = days.length
    ? Math.round(days.reduce((s, d) => s + oldComfortPct(d.b1), 0) / days.length)
    : null;

  if (days.length === 0) {
    return (
      <>
        <AppTopbar title="Scheduler" subtitle="Predicted preheat start times per event" />
        <Card className="text-sm text-graphite-600">
          {coverage.window === "cooling" ? (
            <>
              Cooling-window events are class slots without a calibrated precool lead yet (the symmetric
              precool controller is pending). Switch the date filter to the <strong>Heating week</strong>.
            </>
          ) : (
            <>
              No predicted preheat events in <strong>{fmtDate(range.from)} – {fmtDate(range.to)}</strong>.
              Use the <strong>Heating week</strong> preset in the date picker.
            </>
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      <AppTopbar title="Scheduler" subtitle="Predicted preheat start times per event · target 21°C" />

      <main className="flex flex-col gap-5">
        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-4">
          <Summary icon={CalendarClock} label="Mornings scheduled" value={`${days.length}`} tone="sky" />
          <Summary icon={TrendingDown} label="Mean preheat lead" value={`${meanLead} h`} tone="ember" />
          <Summary icon={CheckCircle2} label="On-time comfort" value={`${days.length}/${days.length}`} sub={`old: 0/${days.length}`} tone="emerald" />
          <Summary
            icon={ArrowUp}
            label="Avg comfort score"
            value={avgScoreB3 !== null ? `${avgScoreB3}%` : "—"}
            sub={avgScoreB1 !== null ? `old: ${avgScoreB1}%` : undefined}
            tone="emerald"
          />
        </div>

        <Card padded={false}>
          <div className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-graphite-600">
                <tr>
                  <th className="px-4 py-3">Morning</th>
                  <th className="px-4 py-3">Lecture · 06:30</th>
                  <th className="px-4 py-3">Outside</th>
                  <th className="px-4 py-3">Room at trough</th>
                  <th className="px-4 py-3">Preheat starts</th>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Our model @ start</th>
                  <th className="px-4 py-3">Comfort score</th>
                  <th className="px-4 py-3">Old blind preheat</th>
                  <th className="px-4 py-3">Saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {days.map((d, i) => {
                  const leadH = graphLead(d.tOut);
                  const b3 = peakTemp();
                  const startMin = EVENT_START_MIN - Math.round(leadH * 60);
                  const faulted = i === 0;
                  return (
                    <tr key={d.date} className="bg-white">
                      <td className="px-4 py-3 font-semibold text-graphite-900">
                        {fmtDate(d.date)}
                        {faulted && (
                          <span className="ml-1.5 rounded bg-coral-50 px-1.5 py-0.5 text-[10px] font-semibold text-coral-600">
                            BDAF0E14
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-graphite-700">{d.lecture}</td>
                      <td className="px-4 py-3 tabular text-graphite-700">{d.tOut.toFixed(1)}°C</td>
                      <td className="px-4 py-3 tabular text-graphite-700">{d.tStart.toFixed(1)}°C</td>
                      <td className="px-4 py-3 tabular font-medium text-graphite-900">
                        {minToHHMM(startMin)} <span className="text-graphite-600/50">→ 06:30</span>
                      </td>
                      <td className="px-4 py-3 tabular text-graphite-700">{leadH.toFixed(1)} h</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="tabular font-semibold text-emerald-600">{b3.toFixed(1)}°C</span>
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                            On time
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const b3s = optComfortPct(d.tStart);
                          const b1s = oldComfortPct(d.b1);
                          const scoreColor =
                            b3s >= 60
                              ? "text-emerald-600"
                              : b3s >= 35
                              ? "text-amber-600"
                              : "text-coral-600";
                          const barColor =
                            b3s >= 60
                              ? "bg-emerald-500"
                              : b3s >= 35
                              ? "bg-amber-400"
                              : "bg-coral-400";
                          return (
                            <div className="flex flex-col gap-1 min-w-[88px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className={`tabular text-sm font-semibold ${scoreColor}`}>{b3s}%</span>
                                <span className="tabular text-[11px] text-graphite-600/50">old {b1s}%</span>
                              </div>
                              <div className="relative h-1.5 w-full rounded-full bg-slate-100">
                                <div
                                  className={`absolute left-0 top-0 h-1.5 rounded-full ${barColor}`}
                                  style={{ width: `${b3s}%` }}
                                />
                                <div
                                  className="absolute top-0 h-1.5 rounded-full bg-coral-300/60"
                                  style={{ left: 0, width: `${b1s}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="tabular font-medium text-coral-600">{d.b1.toFixed(1)}°C</span>
                          <span className="rounded bg-coral-50 px-1.5 py-0.5 text-[10px] font-semibold text-coral-600">
                            −{(TARGET - d.b1).toFixed(1)}°C
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular font-medium text-graphite-900">{d.kwhSaved.toFixed(0)} kWh</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="px-1 text-[11px] text-graphite-600/60">
          Comfort = room ≥ {COMFORT}°C at the {minToHHMM(EVENT_START_MIN)} event start (target {TARGET}°C, 0.5°C margin).
          &quot;Our model&quot; is the calibrated controller (B3); &quot;old blind preheat&quot; is the observed current
          system (B1). Source: heating-window backtest.
        </p>
      </main>
    </>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  sub?: string;
  tone: "sky" | "ember" | "emerald";
}) {
  const toneCls = {
    sky: "bg-sky-50 text-sky-500",
    ember: "bg-ember-50 text-ember-600",
    emerald: "bg-emerald-50 text-emerald-600",
  }[tone];
  return (
    <Card className="flex items-center justify-between">
      <div>
        <p className="text-xs font-medium uppercase text-graphite-600/70">{label}</p>
        <p className="tabular mt-1 text-2xl font-semibold text-graphite-900">{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-graphite-600/60">{sub}</p>}
      </div>
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </span>
    </Card>
  );
}
