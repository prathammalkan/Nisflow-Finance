import { AppShell } from "@/components/layout/app-shell";
import { redirect } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // TODO: Add real auth check
  const isAuthenticated = true;
  if (!isAuthenticated) {
    redirect("/login");
  }

  return <AppShell>{children}</AppShell>;
}
