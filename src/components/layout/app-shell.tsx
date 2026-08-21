"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { BottomNav } from "./bottom-nav";
import { cn } from "@/lib/utils";
import { useBiometricLock } from "@/lib/hooks/use-biometric-lock";
import { BiometricLockModal } from "@/components/auth/biometric-lock-modal";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { isLocked, authenticateBiometrics, loading } = useBiometricLock();

  useEffect(() => {
    if (isLocked) {
      authenticateBiometrics();
    }
  }, [isLocked, authenticateBiometrics]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BiometricLockModal
        isOpen={isLocked}
        onAuthenticate={authenticateBiometrics}
        loading={loading}
      />

      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        isMobileOpen={isMobileOpen}
        setIsMobileOpen={setIsMobileOpen}
      />

      <div
        className={cn(
          "flex flex-1 flex-col transition-all duration-300",
          collapsed ? "md:pl-[72px]" : "md:pl-[260px]"
        )}
      >
        <Header collapsed={collapsed} setIsMobileOpen={setIsMobileOpen} />

        {/* Extra bottom padding on mobile so content isn't hidden behind bottom nav */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-auto pb-24 md:pb-6 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — only visible on small screens */}
      <BottomNav />
    </div>
  );
}
