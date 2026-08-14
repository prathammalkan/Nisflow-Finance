"use client";

import { Search, Bell, Sun, Moon, Menu, Plus } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/search/global-search";

interface HeaderProps {
  collapsed: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export function Header({ collapsed, setIsMobileOpen }: HeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4 shadow-sm sm:px-6">
      <button
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden flex h-9 w-9 items-center justify-center rounded-md border bg-background hover:bg-muted"
      >
        <Menu size={18} />
      </button>

      <div className="flex flex-1 items-center gap-4">
        <div className="w-full max-w-md hidden md:flex">
          <GlobalSearch />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button className="hidden sm:inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2 gap-2">
          <Plus size={16} />
          Transaction
        </button>
        
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </button>

        <button className="inline-flex h-9 w-9 relative items-center justify-center rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-destructive" />
        </button>
      </div>
    </header>
  );
}
