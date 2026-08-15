"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ArrowRightLeft,
  Users,
  BarChart3,
  Settings,
} from "lucide-react";

const tabs = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Transactions", href: "/transactions", icon: ArrowRightLeft },
  { name: "People", href: "/people", icon: Users },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex items-stretch md:hidden"
      aria-label="Mobile navigation"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {tabs.map((tab) => {
        const isActive =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors",
              isActive
                ? "text-primary"
                : "text-gray-500 hover:text-gray-700 active:text-primary"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <tab.icon
              className={cn(
                "h-5 w-5 transition-transform",
                isActive && "scale-110"
              )}
              strokeWidth={isActive ? 2.5 : 1.8}
            />
            <span>{tab.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
