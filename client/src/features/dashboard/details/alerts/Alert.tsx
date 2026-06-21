"use client";

import { Clock, Wrench, CheckCircle2 } from "lucide-react";
import { AppTopbar } from "@/src/shared/app-topbar";
import { Card } from "@/src/components/ui/card";
import { useAlarms } from "@/src/features/dashboard/queries/useAlarms";
import type { FaultAlert, FaultSeverity } from "@/src/@types/fault.type";

const SEVERITY_STYLE: Record<FaultSeverity, string> = {
  critical: "bg-coral-50 text-coral-600",
  high: "bg-amber-50 text-amber-600",
  medium: "bg-sky-50 text-sky-600",
  low: "bg-slate-100 text-slate-600",
};

const shortDevice = (id: string) => id.slice(0, 8).toUpperCase();
const dt = (s?: string) =>
  s
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(s))
    : "—";
const dayFmt = (s: string) =>
  new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(new Date(s + "T00:00:00"));

export default function AlertsPage() {
  const { active, past, activeCount, day, isLoading } = useAlarms();

  return (
    <>
      <AppTopbar
        title="Alerts"
        subtitle={`${activeCount} active on ${dayFmt(day)} · ${past.length} earlier resolved`}
      />

      <main className="flex flex-col gap-6">
        {isLoading ? (
          <Card className="text-sm text-graphite-600/70">Loading alarms from heat-pump telemetry…</Card>
        ) : (
          <>
            {/* ── Active now ─────────────────────────────────────── */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-graphite-900">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-coral-500/60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-coral-500" />
                </span>
                Active now
                <span className="rounded-full bg-coral-500 px-2 py-0.5 text-[11px] font-bold text-white">
                  {activeCount}
                </span>
              </h2>

              {active.length === 0 ? (
                <Card className="flex items-center gap-2 text-sm text-graphite-600/70">
                  <CheckCircle2 className="h-4 w-4 text-ember-600" /> No active alarms on this day.
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {active.map((a) => (
                    <ActiveRow key={a.id} a={a} />
                  ))}
                </div>
              )}
            </section>

            {/* ── Past / resolved ───────────────────────────────── */}
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-graphite-900">
                <Clock className="h-4 w-4 text-graphite-600" />
                Past
                <span className="text-xs font-normal text-graphite-600/60">{past.length} resolved</span>
              </h2>

              {past.length === 0 ? (
                <Card className="text-sm text-graphite-600/70">No earlier alarms in this range.</Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {past.map((a) => (
                    <PastRow key={a.id} a={a} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

function ActiveRow({ a }: { a: FaultAlert }) {
  return (
    <div className="border border-l-4 border-line border-l-coral-500 bg-white p-3 dark:bg-graphite-800">
      <div className="flex items-start gap-3">
        <span className={`flex-shrink-0 px-2 py-1 text-[11px] font-semibold uppercase ${SEVERITY_STYLE[a.severity]}`}>
          {a.severity}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-graphite-900">{a.title}</p>
            <span className="rounded-full bg-coral-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
              Active
            </span>
          </div>
          <p className="mt-0.5 text-xs text-graphite-600/75">
            Pump {shortDevice(a.deviceId)} · started {dt(a.createdAt)}
            {a.temperature != null && a.setpoint != null
              ? ` · ${a.temperature}°C / target ${a.setpoint}°C`
              : ""}
          </p>
          {a.recommendedAction && (
            <p className="mt-1.5 flex items-start gap-1 text-xs text-graphite-600/80">
              <Wrench className="mt-0.5 h-3 w-3 flex-shrink-0 text-coral-500" />
              {a.recommendedAction}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PastRow({ a }: { a: FaultAlert }) {
  return (
    <div className="flex items-center gap-3 border border-line bg-white p-3 opacity-80 dark:bg-graphite-800">
      <span className={`flex-shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_STYLE[a.severity]}`}>
        {a.severity}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-graphite-900">{a.title}</p>
        <p className="truncate text-xs text-graphite-600/70">
          Pump {shortDevice(a.deviceId)} · resolved {dt(a.resolvedAt)} · {Math.round(a.durationMinutes)} min
        </p>
      </div>
      <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-ember-600" />
    </div>
  );
}
