import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/types/database';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

/**
 * Creates an administrative Supabase client using SUPABASE_SECRET_KEY.
 * SECURITY: Must ONLY be called in verified server-side background execution contexts (e.g. CRON).
 * NEVER expose to client components or public API callers.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error('SUPABASE_SECRET_KEY is not configured for administrative execution.');
  }

  // Use createServerClient without session persistence for admin operations
  return createServerClient<Database>(
    supabaseUrl,
    secretKey,
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    }
  );
}
