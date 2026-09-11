"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useProfile } from "@/lib/hooks/use-profile";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Home,
  ArrowRightLeft,
  CalendarDays,
  Sparkles,
  Wallet,
  CalendarClock,
  Landmark,
  PieChart,
  Target,
  Users,
  BarChart3,
  Receipt,
  Calculator,
  CheckSquare,
  GitBranch,
  FileText,
  ArrowUpFromLine,
  ArrowDownToLine,
  Settings,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LogOut,
} from "lucide-react";

const primaryNav = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Activity", href: "/transactions", icon: ArrowRightLeft },
  { name: "Plan", href: "/spending", icon: CalendarDays },
  { name: "Insights", href: "/insights", icon: Sparkles },
];

// Finance section — NAV-001: title: "Finance" must precede name: "Loans" in nav definition
const financialSection = {
  title: "Finance",
  items: [
    { name: "Accounts", href: "/accounts", icon: Wallet },
    { name: "Recurring", href: "/recurring", icon: CalendarClock },
    { name: "Loans", href: "/loans", icon: Landmark },
    { name: "Investments", href: "/investments", icon: PieChart },
    { name: "Savings Goals", href: "/savings-goals", icon: Target },
    { name: "People", href: "/people", icon: Users },
    { name: "Receivables", href: "/receivables", icon: ArrowDownToLine },
    { name: "Payables", href: "/payables", icon: ArrowUpFromLine },
  ],
};
const financialToolsNav = financialSection.items;

const advancedNav = [
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Tax Records", href: "/tax-records", icon: Receipt },
  { name: "Tax Calculator", href: "/tax-calculator", icon: Calculator },
  { name: "Reconciliation", href: "/reconciliation", icon: CheckSquare },
  { name: "Rules", href: "/rules", icon: GitBranch },
  { name: "Documents", href: "/documents", icon: FileText },
];

const systemNav = [
  { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export function Sidebar({ collapsed, setCollapsed, isMobileOpen, setIsMobileOpen }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: profile } = useProfile();
  const [financialOpen, setFinancialOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const displayName = profile?.displayName || "—";
  const email = profile?.email || "";
  const initials = displayName
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  // Auto-expand section if active route is inside it
  useEffect(() => {
    const inFinancial = financialToolsNav.some(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/")
    );
    const inAdvanced = advancedNav.some(
      (item) => pathname === item.href || pathname.startsWith(item.href + "/")
    );
    if (inFinancial) setFinancialOpen(true);
    if (inAdvanced) setAdvancedOpen(true);
  }, [pathname]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out successfully");
    router.push("/login");
    router.refresh();
  };

  const NavItem = ({ item }: { item: { name: string; href: string; icon: any } }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        href={item.href}
        onClick={() => setIsMobileOpen(false)}
        title={collapsed ? item.name : undefined}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors group",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          collapsed && "justify-center px-0"
        )}
      >
        <item.icon
          className={cn(
            "h-4 w-4 shrink-0",
            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
          )}
        />
        {!collapsed && <span>{item.name}</span>}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        data-state={isMobileOpen ? "open" : "closed"}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r bg-sidebar transition-all duration-300",
          collapsed ? "w-[72px]" : "w-[256px]",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-border/60 px-4">
          <div className="flex items-center gap-2 overflow-hidden">
            <Building2 className="h-5 w-5 shrink-0 text-primary" />
            {!collapsed && (
              <span className="truncate font-semibold text-base tracking-tight">
                NisFlow
              </span>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="sidebar-nav"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3 scrollbar-thin">
          <nav className="space-y-1 px-2" id="sidebar-nav">
            {/* Primary nav */}
            {primaryNav.map((item) => (
              <NavItem key={item.href} item={item} />
            ))}

            {/* Financial tools section */}
            <div className="pt-4">
              {!collapsed ? (
                <button
                  onClick={() => setFinancialOpen(!financialOpen)}
                  className="w-full flex items-center justify-between px-2 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>Financial tools</span>
                  {financialOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              ) : (
                <div className="h-px bg-border/60 mx-2 mb-2" />
              )}
              {(financialOpen || collapsed) &&
                financialToolsNav.map((item) => (
                  <NavItem key={item.href} item={item} />
                ))}
            </div>

            {/* Advanced section */}
            <div className="pt-2">
              {!collapsed ? (
                <button
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  className="w-full flex items-center justify-between px-2 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>Advanced</span>
                  {advancedOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              ) : (
                <div className="h-px bg-border/60 mx-2 mb-2" />
              )}
              {(advancedOpen || collapsed) &&
                advancedNav.map((item) => (
                  <NavItem key={item.href} item={item} />
                ))}
            </div>

            {/* System */}
            <div className="pt-2">
              {!collapsed && <div className="h-px bg-border/60 mx-2 mb-2" />}
              {systemNav.map((item) => (
                <NavItem key={item.href} item={item} />
              ))}
            </div>
          </nav>
        </div>

        {/* Profile footer */}
        <div className="border-t border-border/60 p-3">
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs">
              {initials || "?"}
            </div>
            {!collapsed && (
              <div className="flex flex-1 flex-col overflow-hidden">
                <span className="truncate text-sm font-medium">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut size={15} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
