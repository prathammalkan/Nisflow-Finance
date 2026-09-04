import { createClient } from '@/lib/supabase/server';
import { AppShell } from "@/components/layout/app-shell";
import { CompanionDrawer } from "@/components/ai/companion-drawer";
import { AccessGate } from "@/components/admin/access-gate";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <AccessGate>
        {children}
      </AccessGate>
      <CompanionDrawer />
    </AppShell>
  );
}
