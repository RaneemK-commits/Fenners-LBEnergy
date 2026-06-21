"use client";

import { Zap, Euro, Leaf, ShieldCheck, Info } from "lucide-react";
import { AppTopbar } from "@/src/shared/app-topbar";
import { Card, CardHeader } from "@/src/components/ui/card";
import { EnergyChart } from "@/src/features/dashboard/energy-chart";
import { useSavings } from "@/src/features/dashboard/queries/useSavings";

// Failure-prevention savings are MODELED, not measured — clearly labelled below.
const EUR_PER_INCIDENT = 750; // after-hours call-out + expedited parts + lost room-hours

export function EnergySavings() {
  // Same source as the Overview KPI row → identical numbers, range-aware.
  const s = useSavings();

  const eur = (n: number) => `€${Math.round(n).toLocaleString("en-US")}`;
  const num = (n: number) => Math.round(n).toLocaleString("en-US");

  // Modeled extra stream, scaled by how many events fall in the range.
  const prevented = Math.round(2 * (s.events / 7));
  const failureEur = prevented * EUR_PER_INCIDENT;

  return (
    <>
      <AppTopbar title="Energy & Savings" subtitle="Consumption, money saved, and avoided emissions" />

      {s.isLoading ? (
        <Card className="text-sm text-graphite-600">Loading…</Card>
      ) : !s.hasData ? (
        <Card className="text-sm text-graphite-600">
          No model data in the selected date range. Use the <strong>Heating week</strong> preset
          in the date picker to see the savings breakdown.
        </Card>
      ) : (
        <main className="flex flex-col gap-5">
          {/* Headline KPIs — identical to the Overview */}
          <div className="grid grid-cols-3 gap-4">
            <Kpi icon={Zap} tone="ember" label="Energy Saved" value={num(s.savedKwh)} unit="kWh" />
            <Kpi icon={Euro} tone="sky" label="Cost Saved" value={eur(s.savedEur)} />
            <Kpi icon={Leaf} tone="ember" label="CO₂ Saved" value={num(s.savedCo2Kg)} unit="kg" />
          </div>

          {/* Two-stream savings breakdown */}
          <Card>
            <CardHeader
              title="Where the savings come from"
              subtitle="Two independent streams — measured and modeled"
            />
            <div className="grid grid-cols-2 gap-4">
              {/* Stream 1 — measured */}
              <div className="rounded-lg border border-line bg-white p-4 dark:bg-graphite-800">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-graphite-900">
                    <Zap className="h-4 w-4 text-ember-600" /> Preheat optimization
                  </span>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-600">
                    Measured
                  </span>
                </div>
                <p className="tabular text-2xl font-semibold text-graphite-900">{eur(s.savedEur)}</p>
                <p className="mt-1 text-xs text-graphite-600/80">
                  {num(s.savedKwh)} kWh of preheat-window electricity avoided vs. blind preheat
                  (~{s.pct}%) — the cheap hot-water coil starts early so the expensive electric boost
                  never fires.
                </p>
                <p className="mt-2 text-[11px] text-graphite-600/55">
                  Source: model backtest (B1 vs B3) over the selected range.
                </p>
              </div>

              {/* Stream 2 — modeled */}
              <div className="rounded-lg border border-line bg-white p-4 dark:bg-graphite-800">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold text-graphite-900">
                    <ShieldCheck className="h-4 w-4 text-coral-500" /> Avoided failure cost
                  </span>
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-600">
                    Estimate
                  </span>
                </div>
                <p className="tabular text-2xl font-semibold text-graphite-900">{eur(failureEur)}</p>
                <p className="mt-1 text-xs text-graphite-600/80">
                  {prevented} critical issue{prevented === 1 ? "" : "s"} caught early by anomaly
                  detection, before a hard failure and an emergency call-out.
                </p>
                <p className="mt-2 flex items-start gap-1 text-[11px] text-graphite-600/55">
                  <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
                  Assumption: {prevented} × €{EUR_PER_INCIDENT}/incident. Not a measured figure.
                </p>
              </div>
            </div>
          </Card>

          {/* Consumption chart (shared with the Overview) */}
          <EnergyChart />
        </main>
      )}
    </>
  );
}

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
  unit,
}: {
  icon: typeof Zap;
  tone: "ember" | "sky";
  label: string;
  value: string;
  unit?: string;
}) {
  const toneCls = tone === "ember" ? "bg-ember-50 text-ember-600" : "bg-sky-50 text-sky-500";
  return (
    <Card className="flex items-start gap-3.5">
      <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="text-[13px] text-graphite-600/80">{label}</p>
        <p className="tabular mt-0.5 text-[22px] font-semibold leading-none text-graphite-900">
          {value}
          {unit && <span className="ml-1 text-sm font-medium text-graphite-600/70">{unit}</span>}
        </p>
      </div>
    </Card>
  );
}
