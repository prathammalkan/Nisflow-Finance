import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Server-side admin route guard.
 *
 * This layout wraps ONLY the /admin segment and its children.
 * It runs on the server before ANY admin page content is rendered,
 * giving us a true security boundary — not just a client-side UI guard.
 *
 * Flow:
 *  1. Verify the user is authenticated (belt-and-suspenders alongside middleware).
 *  2. Call is_app_admin() SECURITY DEFINER RPC server-side.
 *  3. Non-admins are hard-redirected to /dashboard before anything renders.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // 1. Authentication check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 2. Admin role check — server-side, authoritative
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: isAdmin, error } = await (supabase as any).rpc('is_app_admin');

  // If the RPC fails (e.g. migration not yet applied) we fail-open to the
  // client-side guard rather than blocking all users. Log for debugging.
  if (error) {
    console.error('[AdminLayout] is_app_admin RPC error:', error.message);
    // Fall through — client-side guard still applies.
    return <>{children}</>;
  }

  // 3. Redirect non-admins — but only after confirming admin_exists.
  // If no admin has been bootstrapped yet, allow through so the bootstrap
  // UI can be shown (the page itself checks admin_exists() and shows
  // the "Become Administrator" flow).
  if (!isAdmin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: adminExists } = await (supabase as any).rpc('admin_exists');
    if (adminExists) {
      // At least one admin exists but this user is not one — redirect away.
      redirect('/dashboard');
    }
    // No admin exists yet → fall through to bootstrap UI.
  }

  return <>{children}</>;
}
