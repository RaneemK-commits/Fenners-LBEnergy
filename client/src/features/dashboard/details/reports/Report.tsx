"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DetailTopbar } from "@/src/shared/detail-topbar";
import { ChevronDown, ChevronRight, FileText, Loader2, Check, AlertCircle } from "lucide-react";
import { useRole } from "@/src/features/auth/use-role";

type ReportType = "financial" | "sustainability";

type Week = {
  id: string;
  start: string; // YYYY-MM-DD (Monday)
  end: string;   // YYYY-MM-DD (Sunday)
  hasData: boolean;
};

const WEEKS: Week[] = [
  { id: "2026-03-23", start: "2026-03-23", end: "2026-03-29", hasData: false },
  { id: "2026-03-30", start: "2026-03-30", end: "2026-04-05", hasData: true },
];

const REPORT_OPTIONS: { value: ReportType; title: string }[] = [
  { value: "financial", title: "Energy Savings — Financial Report" },
  { value: "sustainability", title: "Sustainability Report" },
];

type RunState =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; filename: string }
  | { kind: "error"; message: string };

export default function ReportsPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReportType | null>(null);
  const [run, setRun] = useState<RunState>({ kind: "idle" });

  // Technicians may not access Reports — redirect them to the dashboard.
  const router = useRouter();
  const role = useRole();
  useEffect(() => {
    if (role === "technician") router.replace("/dashboard");
  }, [role, router]);

  function toggleWeek(week: Week) {
    if (!week.hasData) return;
    setExpanded((prev) => (prev === week.id ? null : week.id));
    setSelected(null);
    setRun({ kind: "idle" });
  }

  async function createDocument() {
    if (!selected) return;
    setRun({ kind: "running" });
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: selected }),
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

  if (role === "technician") return null;

  return (
    <>
      <DetailTopbar
        backHref="/dashboard"
        backLabel="Dashboard"
        title="Reports"
        subtitle={`${WEEKS.length} weeks · ${WEEKS.filter((w) => w.hasData).length} with data`}
      />

      <main className="flex flex-col gap-3">
        {WEEKS.map((week) => {
          const isExpanded = expanded === week.id;
          const Chevron = isExpanded ? ChevronDown : ChevronRight;
          return (
            <section
              key={week.id}
              className={`rounded-2xl bg-white ${
                week.hasData ? "" : "opacity-60"
              }`}
            >
              <button
                type="button"
                onClick={() => toggleWeek(week)}
                disabled={!week.hasData}
                className={`flex w-full items-center justify-between px-5 py-4 text-left ${
                  week.hasData ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed"
                } rounded-2xl`}
              >
                <div className="flex items-center gap-3">
                  <Chevron size={18} className="text-slate-400" />
                  <div>
                    <p className="font-semibold text-sm text-graphite-900">
                      Week of {week.start}
                    </p>
                    <p className="text-xs text-slate-500">
                      {week.start} → {week.end}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-md ${
                    week.hasData
                      ? "bg-green-50 text-green-600"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {week.hasData ? "Data available" : "No data"}
                </span>
              </button>

              {isExpanded && week.hasData && (
                <div className="border-t border-slate-100 px-5 pt-5 pb-5">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Choose a report type
                  </p>
                  <div className="flex flex-col gap-2">
                    {REPORT_OPTIONS.map((opt) => {
                      const active = selected === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSelected(opt.value)}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors ${
                            active
                              ? "border-coral-500 bg-coral-50 text-graphite-900"
                              : "border-slate-200 bg-white text-graphite-900 hover:border-slate-300"
                          }`}
                        >
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-full ${
                              active ? "bg-coral-500 text-white" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            <FileText size={15} />
                          </span>
                          <span className="font-medium">{opt.title}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={createDocument}
                      disabled={!selected || run.kind === "running"}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                        selected && run.kind !== "running"
                          ? "bg-graphite-900 text-white hover:bg-graphite-700"
                          : "bg-slate-200 text-slate-400 cursor-not-allowed"
                      }`}
                    >
                      {run.kind === "running" ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>Create Document</>
                      )}
                    </button>

                    {run.kind === "done" && (
                      <span className="flex items-center gap-1.5 text-xs text-green-600">
                        <Check size={14} /> Downloaded {run.filename}
                      </span>
                    )}
                    {run.kind === "error" && (
                      <span className="flex items-center gap-1.5 text-xs text-red-600">
                        <AlertCircle size={14} /> {run.message}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </main>
    </>
  );
}
