"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown, Check } from "lucide-react";

type Preset = "today" | "week" | "month";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last week" },
  { value: "month", label: "Last month" },
];

const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtFull = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function rangeLabel(preset: Preset): string {
  const today = new Date();
  if (preset === "today") return fmtFull(today);
  const start = new Date(today);
  start.setDate(today.getDate() - (preset === "week" ? 6 : 29));
  return `${fmtDay(start)} – ${fmtFull(today)}`;
}

export function DateRangePicker() {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<Preset>("week");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-sm text-graphite-900 shadow-panel transition hover:bg-canvas dark:bg-graphite-800"
      >
        <Calendar className="h-4 w-4 text-graphite-600" />
        {rangeLabel(preset)}
        <ChevronDown className="h-4 w-4 text-graphite-600" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-lg dark:bg-graphite-800">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => {
                setPreset(p.value);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-graphite-900 hover:bg-canvas"
            >
              {p.label}
              {preset === p.value && <Check className="h-4 w-4 text-coral-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
