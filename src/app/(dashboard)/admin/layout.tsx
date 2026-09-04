import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Server-side admin route guard.
 *
 * This layout wraps ONLY the /admin segment and its children.
 * It runs on the server before ANY admin page content is rendered,
 * giving us a true security boundary — not just a client-side UI guard.
 *
 * SECURITY POLICY: FAIL CLOSED.
 * If authorization cannot be positively confirmed (RPC error, DB outage,
 * migration not applied, or any unexpected condition), redirect to /dashboard.
 * Admin UI is NEVER rendered unless authorization is explicitly confirmed.
 *
 * Flow:
 *  1. Verify the user is authenticated (belt-and-suspenders alongside middleware).
 *  2. Call is_app_admin() SECURITY DEFINER RPC server-side.
 *  3. On RPC error → fail closed → redirect('/dashboard').
 *  4. Non-admins redirect to /dashboard unless no admin exists yet (bootstrap flow).
 *  5. On admin_exists() RPC error → fail closed → redirect('/dashboard').
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

  // SECURITY: Fail CLOSED on any authorization RPC error.
  // If is_app_admin() cannot be verified for any reason (DB error, migration not
  // applied, network timeout, etc.), we NEVER render admin children.
  // Redirect to /dashboard to maintain security without exposing admin UI.
  if (error) {
    console.error('[AdminLayout] is_app_admin RPC error — failing closed:', error.message);
    redirect('/dashboard');
  }

  // 3. Redirect non-admins — but only after confirming admin_exists.
  // If no admin has been bootstrapped yet, allow through so the bootstrap
  // UI can be shown (the page itself checks admin_exists() and shows
  // the "Become Administrator" flow).
  if (!isAdmin) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: adminExists, error: adminExistsError } = await (supabase as any).rpc('admin_exists');

    // SECURITY: Fail CLOSED on admin_exists RPC error.
    // We cannot safely determine whether the bootstrap path is appropriate — redirect.
    if (adminExistsError) {
      console.error('[AdminLayout] admin_exists RPC error — failing closed:', adminExistsError.message);
      redirect('/dashboard');
    }

    if (adminExists) {
      // At least one admin exists but this user is not one — redirect away.
      redirect('/dashboard');
    }
    // No admin exists yet → fall through to bootstrap UI.
  }

  return <>{children}</>;
}
