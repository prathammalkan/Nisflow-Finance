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

  // Pre-fetch access status server-side to guarantee instant, buffer-free rendering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accessData } = await (supabase as any).rpc('get_current_access_status');
  const initialStatus = accessData || { status: 'approved' as const, is_admin: false };

  return (
    <AppShell>
      <AccessGate initialStatus={initialStatus}>
        {children}
      </AccessGate>
      <CompanionDrawer />
    </AppShell>
  );
}
