"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ArrowRightLeft,
  Wallet,
  CreditCard,
  Users,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  PieChart,
  Target,
  BarChart3,
  CheckSquare,
  FileText,
  GitBranch,
  Receipt,
  Settings,
  Building2,
  ChevronLeft,
  ChevronRight,
  LogOut
} from "lucide-react";

const navigation = [
  {
    title: "Overview",
    items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Finance",
    items: [
      { name: "Transactions", href: "/transactions", icon: ArrowRightLeft },
      { name: "Accounts", href: "/accounts", icon: Wallet },
      { name: "Spending", href: "/spending", icon: CreditCard },
    ],
  },
  {
    title: "People",
    items: [
      { name: "People", href: "/people", icon: Users },
      { name: "Receivables", href: "/receivables", icon: ArrowDownToLine },
      { name: "Payables", href: "/payables", icon: ArrowUpFromLine },
    ],
  },
  {
    title: "Investments",
    items: [
      { name: "IPOs", href: "/ipos", icon: TrendingUp },
      { name: "Investments", href: "/investments", icon: PieChart },
      { name: "Savings Goals", href: "/savings-goals", icon: Target },
    ],
  },
  {
    title: "Tools",
    items: [
      { name: "Reports", href: "/reports", icon: BarChart3 },
      { name: "Reconciliation", href: "/reconciliation", icon: CheckSquare },
      { name: "Documents", href: "/documents", icon: FileText },
      { name: "Rules", href: "/rules", icon: GitBranch },
    ],
  },
  {
    title: "System",
    items: [
      { name: "Tax Records", href: "/tax-records", icon: Receipt },
      { name: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed, isMobileOpen, setIsMobileOpen }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-sidebar transition-all duration-300",
          collapsed ? "w-[72px]" : "w-[260px]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <Building2 className="h-6 w-6 shrink-0 text-primary" />
            {!collapsed && (
              <span className="truncate font-semibold tracking-tight text-lg">
                NisFlow
              </span>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 scrollbar-thin">
          <nav className="space-y-6 px-2">
            {navigation.map((group, i) => (
              <div key={i} className="flex flex-col gap-1">
                {!collapsed && (
                  <h4 className="px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    {group.title}
                  </h4>
                )}
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors group",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        collapsed && "justify-center px-0"
                      )}
                      title={collapsed ? item.name : undefined}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                      {!collapsed && <span>{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t p-4">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
              JD
            </div>
            {!collapsed && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate text-sm font-medium">John Doe</span>
                <span className="truncate text-xs text-muted-foreground">john@example.com</span>
              </div>
            )}
            {!collapsed && (
              <button className="text-muted-foreground hover:text-foreground">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
