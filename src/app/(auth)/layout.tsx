import React from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-between bg-background p-4 sm:p-6">
      <div className="w-full flex-1 flex items-center justify-center">
        {children}
      </div>
      <footer className="py-4 text-center text-xs text-muted-foreground space-x-4">
        <span>&copy; {new Date().getFullYear()} NisFlow Finance</span>
        <span>•</span>
        <Link href="/privacy" className="hover:text-foreground underline underline-offset-4">
          Privacy Policy
        </Link>
        <span>•</span>
        <Link href="/terms" className="hover:text-foreground underline underline-offset-4">
          Terms & Conditions
        </Link>
      </footer>
    </div>
  );
}
