"use client";

import { useState } from "react";
import { AppTopbar } from "@/src/shared/app-topbar";
import { useFilters, formatRange } from "@/src/features/dashboard/filters/filters-context";
import { useLocations } from "@/src/features/dashboard/locations/locations-context";
import { useSavings } from "@/src/features/dashboard/queries/useSavings";
import { Card, CardHeader } from "@/src/components/ui/card";
import {
  FileText,
  Loader2,
  Check,
  AlertCircle,
  CalendarRange,
  MapPin,
  Euro,
  Leaf,
  Download,
  Building2,
} from "lucide-react";

type ReportType = "financial" | "sustainability";

const REPORT_OPTIONS: {
  value: ReportType;
  title: string;
  blurb: string;
  icon: typeof Euro;
  accent: string; // icon chip classes
  includes: string[];
}[] = [
  {
    value: "financial",
    title: "Energy Savings — Financial Report",
    blurb: "Cost and consumption breakdown for finance & facility management.",
    icon: Euro,
    accent: "bg-sky-50 text-sky-500",
    includes: [
      "Energy saved (kWh) vs. blind preheat",
      "Cost saved (€) at €0.30/kWh",
      "Measured vs. optimized consumption",
      "Per-day savings over the period",
    ],
  },
  {
    value: "sustainability",
    title: "Sustainability Report",
    blurb: "Emissions and efficiency summary for ESG & compliance.",
    icon: Leaf,
    accent: "bg-ember-50 text-ember-600",
    includes: [
      "CO₂ avoided (kg) at 0.4 kg/kWh",
      "Energy efficiency improvement (%)",
      "Comfort compliance vs. target",
      "Equivalent emissions context",
    ],
  },
];

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; filename: string }
  | { kind: "error"; message: string };

export default function ReportsPage() {
  const [selected, setSelected] = useState<ReportType | null>(null);
  const [run, setRun] = useState<RunState>({ kind: "idle" });
  const { range } = useFilters();
  const { selected: location } = useLocations();
  const s = useSavings();

  async function createDocument() {
    if (!selected) return;
    setRun({ kind: "running" });
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report: selected,
          location: location.name,
          units: location.units,
          from: range.from,
          to: range.to,
        }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (res.ok && contentType.includes("application/pdf")) {
        const blob = await res.blob();
        const disposition = res.headers.get("content-disposition") || "";
        const match = disposition.match(/filename="?([^";]+)"?/i);
        const filename = match?.[1] || `${selected}.pdf`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);

        setRun({ kind: "done", filename });
        return;
      }

      const payload = await res.json().catch(() => ({}));
      setRun({
        kind: "error",
        message: payload.error || payload.stderr || `HTTP ${res.status}`,
      });
    } catch (err) {
      setRun({ kind: "error", message: (err as Error).message });
    }
  }

  return (
    <>
      <AppTopbar
        title="Reports"
        subtitle={`Financial & sustainability reports · ${location.name}`}
      />

      <main className="flex flex-col gap-5">
        {/* ── Report period (from the top date selector) ───────────── */}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-coral-50 text-coral-500">
                <CalendarRange className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-graphite-600/70">
                  Reporting period
                </p>
                <p className="text-lg font-bold text-graphite-900">{formatRange(range)}</p>
                <p className="mt-0.5 text-[11px] text-graphite-600/60">
                  Follows the date selector at the top — change it there to re-scope the report.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2 text-sm text-graphite-700">
                <MapPin className="h-4 w-4 text-graphite-600/60" />
                {location.name}
              </div>
              <div className="flex items-center gap-2 text-sm text-graphite-700">
                <Building2 className="h-4 w-4 text-graphite-600/60" />
                {location.units} units
              </div>
              <span
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  s.hasData
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {s.hasData ? "Data available" : "No data in range"}
              </span>
            </div>
          </div>
        </Card>

        {/* ── Report type selection ────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Choose a report type"
            subtitle="Both cover the selected period and location"
          />
          <div className="grid grid-cols-2 gap-4">
            {REPORT_OPTIONS.map((opt) => {
              const active = selected === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setSelected(opt.value);
                    setRun({ kind: "idle" });
                  }}
                  className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? "border-coral-500 bg-coral-50/40"
                      : "border-line bg-white hover:border-slate-300 dark:bg-graphite-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-full ${opt.accent}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        active ? "border-coral-500 bg-coral-500 text-white" : "border-slate-300"
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-graphite-900">{opt.title}</p>
                    <p className="mt-0.5 text-xs text-graphite-600/75">{opt.blurb}</p>
                  </div>
                  <ul className="mt-1 flex flex-col gap-1.5">
                    {opt.includes.map((line) => (
                      <li key={line} className="flex items-start gap-2 text-xs text-graphite-700">
                        <FileText className="mt-0.5 h-3 w-3 flex-shrink-0 text-graphite-600/50" />
                        {line}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          {/* ── Generate ───────────────────────────────────────────── */}
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
            <div className="text-xs text-graphite-600/70">
              {selected
                ? `Ready to generate the ${
                    selected === "financial" ? "Financial" : "Sustainability"
                  } report as a PDF.`
                : "Select a report type to continue."}
            </div>
            <div className="flex items-center gap-3">
              {run.kind === "done" && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <Check size={14} /> Downloaded {run.filename}
                </span>
              )}
              {run.kind === "error" && (
                <span className="flex items-center gap-1.5 text-xs text-coral-600">
                  <AlertCircle size={14} /> {run.message}
                </span>
              )}
              <button
                type="button"
                onClick={createDocument}
                disabled={!selected || !s.hasData || run.kind === "running"}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  selected && s.hasData && run.kind !== "running"
                    ? "bg-graphite-900 text-white hover:bg-graphite-700"
                    : "cursor-not-allowed bg-slate-200 text-slate-400"
                }`}
              >
                {run.kind === "running" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Download size={14} />
                    Create Document
                  </>
                )}
              </button>
            </div>
          </div>
        </Card>
      </main>
    </>
  );
}
