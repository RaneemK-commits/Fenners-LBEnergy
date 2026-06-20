"use client";

import { Card, CardHeader } from "../../components/ui/card";
import { AlertResponse, AlertSeverity } from "../../@types/alert.type";
import { useAlerts } from "./queries/useAlertQueries";

type AlertTone = "coral" | "amber" | "sky";

const SEVERITY_TONE: Record<AlertSeverity, AlertTone> = {
  critical: "coral",
  high: "coral",
  medium: "amber",
  low: "sky",
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 60) return `${Math.max(mins, 0)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

function AlertIcon({ tone }: { tone: AlertTone }) {
  if (tone === "sky") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8h.01M12 11v5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3 2 20h20L12 3Z" strokeLinejoin="round" />
      <path d="M12 10v4" strokeLinecap="round" />
      <circle cx="12" cy="17" r="0.5" fill="currentColor" />
    </svg>
  );
}

const TONE_BG: Record<AlertTone, string> = {
  coral: "bg-coral-50 text-coral-500",
  amber: "bg-amber-50 text-amber-500",
  sky: "bg-sky-50 text-sky-500",
};

export function Alerts() {
  // Live alerts from the model API (GET /alerts) — real comfort-risk events.
  const { data, isLoading } = useAlerts();
  const alerts: AlertResponse[] = data ?? [];

  return (
    <Card>
      <CardHeader title="Alerts" action={<button className="text-xs font-medium text-ember-600">View all</button>} />
      <div className="flex flex-col gap-1">
        {isLoading && <p className="py-4 text-xs text-graphite-600/60">Loading alerts…</p>}
        {!isLoading && alerts.length === 0 && (
          <p className="py-4 text-xs text-graphite-600/60">No active alerts.</p>
        )}
        {alerts.map((a, i) => {
          const tone = SEVERITY_TONE[a.severity] ?? "amber";
          return (
            <button
              key={a.id}
              className={`flex items-center gap-3 rounded-lg py-2.5 text-left transition-colors hover:bg-graphite-700/[0.03] ${
                i !== alerts.length - 1 ? "border-b border-b-line" : ""
              }`}
            >
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${TONE_BG[tone]}`}>
                <AlertIcon tone={tone} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-graphite-900">{a.title}</p>
                <p className="truncate text-xs text-graphite-600/70">{a.message}</p>
              </div>
              <span className="flex-shrink-0 text-xs text-graphite-600/50">{relativeTime(a.createdAt)}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
