"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Zap,
  AlertTriangle,
  FileText,
  Settings,
  MapPin,
} from "lucide-react";
import { getRole } from "@/src/features/auth/role";
import { useAlarms } from "@/src/features/dashboard/queries/useAlarms";

type NavItem = { href: string; label: string; icon: React.ElementType; exact?: boolean };

const MANAGER_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/schedule", label: "Scheduler", icon: Calendar },
  { href: "/dashboard/energy", label: "Energy & Savings", icon: Zap },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
  { href: "/dashboard/alerts", label: "Alerts", icon: AlertTriangle },
  { href: "/dashboard/configuration", label: "Configuration", icon: Settings },
];

const TECHNICIAN_NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Diagnostics", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/schedule", label: "Schedule", icon: Calendar },
  { href: "/dashboard/alerts", label: "Faults", icon: AlertTriangle },
  { href: "/dashboard/configuration", label: "Configuration", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const role = getRole();
  const navItems = role === "technician" ? TECHNICIAN_NAV_ITEMS : MANAGER_NAV_ITEMS;

  // Day-scoped alarm count (from the snapshot fault feed) → sidebar notification.
  const { activeCount } = useAlarms();

  return (
    <aside className="flex h-screen w-[260px] shrink-0 flex-col justify-between bg-[#191919] px-4 py-6 text-white">
      <div>
        <Link href="/dashboard" className="mb-8 flex items-center gap-2.5 px-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/lb-energy-logo-white.svg" alt="LB Energy" className="h-8 w-auto" />
          <span className="text-sm font-bold tracking-wide">LB ENERGY</span>
        </Link>

        <nav className="flex flex-col gap-1">
          {navItems.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname?.startsWith(href);
            const badge = href === "/dashboard/alerts" && activeCount > 0 ? activeCount : undefined;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-coral-500 font-semibold text-white"
                    : "text-white/55 hover:bg-white/5 hover:text-white/90"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon size={17} strokeWidth={2} />
                  {label}
                </span>
                {badge ? (
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                      active ? "bg-white/25" : "bg-coral-600"
                    }`}
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="bg-white/5 p-4">
        <div className="mb-2 flex items-center gap-1.5 text-coral-500">
          <MapPin size={14} />
        </div>
        <p className="text-sm font-bold leading-tight">Building of the Future</p>
        <p className="mt-1 text-xs leading-snug text-white/45">
          Intelligent Control of Mobile Structures
        </p>
      </div>
    </aside>
  );
}
