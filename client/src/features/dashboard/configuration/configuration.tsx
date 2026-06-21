"use client";

import { useEffect, useState } from "react";
import { AppTopbar } from "@/src/shared/app-topbar";
import { Card } from "@/src/components/ui/card";
import { Flame, Repeat, Snowflake, Fan, Minus, Plus } from "lucide-react";

type Mode = "heating" | "auto" | "cooling";

const MODES: {
  value: Mode;
  label: string;
  icon: React.ReactNode;
  activeClass: string;
}[] = [
  { value: "heating", label: "Heating", icon: <Flame className="h-4 w-4" />, activeClass: "bg-coral-500 text-white" },
  { value: "auto", label: "Auto", icon: <Repeat className="h-4 w-4" />, activeClass: "bg-graphite-950 text-white" },
  { value: "cooling", label: "Cooling", icon: <Snowflake className="h-4 w-4" />, activeClass: "bg-ocean-500 text-white" },
];

const KEY = "lb-config";
const clampTarget = (v: number) => Math.min(30, Math.max(5, Math.round(v * 2) / 2));
const clampFan = (v: number) => Math.min(100, Math.max(0, Math.round(v || 0)));

type Config = { fan: number; mode: Mode; target: number };

function persist(cfg: Config) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {}
}

export default function ConfigurationPage() {
  const [fan, setFan] = useState(60);
  const [mode, setMode] = useState<Mode>("auto");
  const [target, setTarget] = useState(21);
  const [saved, setSaved] = useState(false);

  // Load saved configuration on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const c = JSON.parse(raw) as Partial<Config>;
      if (typeof c.fan === "number") setFan(clampFan(c.fan));
      if (c.mode === "heating" || c.mode === "auto" || c.mode === "cooling") setMode(c.mode);
      if (typeof c.target === "number") setTarget(clampTarget(c.target));
    } catch {}
  }, []);

  // Persist explicitly on each change (saved values stay after reopening).
  function changeFan(v: number) {
    const next = clampFan(v);
    setFan(next);
    persist({ fan: next, mode, target });
  }
  function changeMode(m: Mode) {
    setMode(m);
    persist({ fan, mode: m, target });
  }
  function changeTarget(v: number) {
    const next = clampTarget(v);
    setTarget(next);
    persist({ fan, mode, target: next });
  }
  function apply() {
    persist({ fan, mode, target });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <>
      <AppTopbar title="Configuration" subtitle="Heat pump control" />

      <main className="flex max-w-2xl flex-col gap-5">
        {/* Operating mode — connected segmented buttons, only one active */}
        <Card>
          <h2 className="text-[15px] font-bold text-graphite-900">Operating mode</h2>
          <p className="mt-0.5 text-xs text-graphite-600/70">
            Only one mode can be active at a time.
          </p>

          <div className="mt-4 flex w-full overflow-hidden border border-line">
            {MODES.map((m, i) => {
              const active = mode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => changeMode(m.value)}
                  className={`flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${
                    i > 0 ? "border-l border-line" : ""
                  } ${active ? m.activeClass : "bg-white text-graphite-600 hover:bg-canvas dark:bg-graphite-800"}`}
                >
                  {m.icon}
                  {m.label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Fan air supply — 0%..100% slider */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-graphite-900">
                <Fan className="h-4 w-4 text-coral-500" />
                Fan air supply
              </h2>
              <p className="mt-0.5 text-xs text-graphite-600/70">Supply fan strength.</p>
            </div>
            <span className="tabular text-3xl font-bold text-graphite-900">{fan}%</span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={fan}
            onChange={(e) => changeFan(Number(e.target.value))}
            className="mt-4 h-2 w-full cursor-pointer accent-coral-500"
            aria-label="Fan air supply percentage"
          />
          <div className="mt-1 flex justify-between text-[11px] text-graphite-600/60">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </Card>

        {/* Target temperature */}
        <Card>
          <h2 className="text-[15px] font-bold text-graphite-900">Target temperature</h2>
          <p className="mt-0.5 text-xs text-graphite-600/70">
            Setpoint the room should reach.
          </p>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              aria-label="Decrease target temperature"
              onClick={() => changeTarget(target - 0.5)}
              className="flex h-11 w-11 items-center justify-center border border-line text-graphite-900 transition-colors hover:border-coral-500 hover:text-coral-500"
            >
              <Minus className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-1 border border-line px-5 py-2.5">
              <input
                type="number"
                value={target}
                min={5}
                max={30}
                step={0.5}
                onChange={(e) => changeTarget(Number(e.target.value))}
                className="tabular w-16 bg-transparent text-center text-2xl font-bold text-graphite-900 outline-none"
                aria-label="Target temperature in Celsius"
              />
              <span className="text-lg font-semibold text-graphite-600">°C</span>
            </div>

            <button
              type="button"
              aria-label="Increase target temperature"
              onClick={() => changeTarget(target + 0.5)}
              className="flex h-11 w-11 items-center justify-center border border-line text-graphite-900 transition-colors hover:border-coral-500 hover:text-coral-500"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </Card>

        <div className="flex justify-start">
          <button type="button" onClick={apply} className="btn-cta">
            {saved ? "Saved ✓" : "Apply settings"}
          </button>
        </div>
      </main>
    </>
  );
}
