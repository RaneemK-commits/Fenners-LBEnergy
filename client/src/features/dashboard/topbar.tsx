"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { LocationSwitcher } from "@/src/features/dashboard/locations/location-switcher";
import { DateRangePicker } from "@/src/features/dashboard/date-range-picker";

export function Topbar() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const el = document.documentElement;
    const next = !el.classList.contains("dark");
    el.classList.toggle("dark", next);
    try {
      localStorage.theme = next ? "dark" : "light";
    } catch {}
    setDark(next);
  }

  return (
    <header className="flex items-center justify-between px-2 pb-6">
      <div>
        <h1 className="flex items-center gap-2 text-[22px] font-bold text-graphite-900">
          Good morning <span className="text-xl">👋</span>
        </h1>

        <p className="mt-0.5 text-sm text-graphite-600/80">
          Here&rsquo;s what&rsquo;s happening with your buildings today.
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Location selector */}
        <LocationSwitcher />

        {/* Date Range */}
        <DateRangePicker />

        {/* Dark-mode toggle */}
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          aria-pressed={dark}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-graphite-600 shadow-panel transition hover:bg-canvas dark:bg-graphite-800"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
