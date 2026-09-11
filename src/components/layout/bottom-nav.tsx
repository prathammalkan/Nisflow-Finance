"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, ArrowRightLeft, CalendarDays, Sparkles } from "lucide-react";

const tabs = [
  { name: "Home", href: "/dashboard", icon: Home, exact: true },
  { name: "Activity", href: "/transactions", icon: ArrowRightLeft, exact: false },
  { name: "Plan", href: "/spending", icon: CalendarDays, exact: false },
  { name: "Insights", href: "/insights", icon: Sparkles, exact: false },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border/60 flex items-stretch md:hidden"
      aria-label="Mobile navigation"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href || pathname.startsWith(tab.href + "/")
          : pathname === tab.href || pathname.startsWith(tab.href + "/");

        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-label={tab.name}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] transition-colors",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div
              className={cn(
                "rounded-lg p-1.5 transition-colors",
                isActive ? "bg-primary/10" : ""
              )}
            >
              <tab.icon
                className="h-5 w-5"
                strokeWidth={isActive ? 2.5 : 1.8}
                aria-hidden="true"
              />
            </div>
            <span
              className={cn(
                "text-[10px] font-medium",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              {tab.name}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
