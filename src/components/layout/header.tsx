"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, Menu, LogOut, Settings } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "@/components/search/global-search";
import { NotificationPanel } from "@/components/notifications/notification-panel";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/hooks/use-profile";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  collapsed: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export function Header({ collapsed, setIsMobileOpen }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const { data: profile } = useProfile();
  const [signingOut, setSigningOut] = useState(false);

  const initials = (profile?.displayName || "U")
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      toast.success("Signed out successfully");
      router.push("/login");
      router.refresh();
    } catch {
      toast.error("Failed to sign out");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-4 border-b border-border/60 bg-background/95 backdrop-blur-sm px-4 sm:px-6">
      <button
        onClick={() => setIsMobileOpen(true)}
        className="md:hidden flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background hover:bg-muted transition-colors"
        aria-label="Open menu"
      >
        <Menu size={16} />
      </button>

      <div className="flex flex-1 items-center gap-4">
        <div className="hidden sm:flex items-center">
          <GlobalSearch />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border/60 bg-background hover:bg-muted transition-colors relative"
          aria-label="Toggle theme"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </button>

        {/* Notifications */}
        <NotificationPanel />

        {/* User avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/20 text-primary font-semibold text-xs hover:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="User menu"
              title={profile?.displayName || "User menu"}
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="font-medium text-foreground truncate">{profile?.displayName || "User"}</p>
              <p className="text-xs text-muted-foreground truncate font-normal">{profile?.email || ""}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2 cursor-pointer w-full text-foreground">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
              disabled={signingOut}
            >
              <LogOut className="h-4 w-4" />
              <span>{signingOut ? "Signing out..." : "Sign out"}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
