"use client";

import { ShieldCheck, Fingerprint, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BiometricLockModalProps {
  isOpen: boolean;
  onAuthenticate: () => void;
  loading?: boolean;
}

export function BiometricLockModal({ isOpen, onAuthenticate, loading }: BiometricLockModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-md p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-2xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20">
          <Fingerprint className="h-10 w-10 animate-pulse" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">NisFlow Locked</h2>
          <p className="text-sm text-muted-foreground">
            Verify your identity with Touch ID, Face ID, or Device Fingerprint to access your personal ledger.
          </p>
        </div>

        <div className="pt-2 space-y-3">
          <Button
            size="lg"
            className="w-full gap-2 text-base font-medium shadow-lg"
            onClick={onAuthenticate}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
            {loading ? "Verifying..." : "Unlock with Biometrics"}
          </Button>
        </div>

        <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Lock className="h-3 w-3" />
          End-to-End Hardware Encrypted Protection
        </div>
      </div>
    </div>
  );
}
