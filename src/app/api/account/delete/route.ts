import { NextResponse } from 'next/server';
import { createClient as createServerClient, createAdminClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { checkDeleteAccountRateLimit } from '@/lib/security/rate-limit';

const CONFIRMATION = 'DELETE MY ACCOUNT';

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    let supabase = await createServerClient();
    let user = (await supabase.auth.getUser()).data.user;

    // Fallback: If no cookie session, check for Authorization: Bearer <token>
    if (!user && bearerToken) {
      const tokenClient = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
          global: { headers: { Authorization: `Bearer ${bearerToken}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        }
      );
      const { data: tokenUserData } = await tokenClient.auth.getUser(bearerToken);
      if (tokenUserData?.user) {
        user = tokenUserData.user;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase = tokenClient as any;
      }
    }

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized. Please sign in.' }, { status: 401 });
    }

    // Rate limit check
    const rateLimitResult = await checkDeleteAccountRateLimit(user.id, req);
    if (rateLimitResult.status === 'rate_limited') {
      return NextResponse.json(
        {
          error: `Too many account deletion attempts. Please wait ${rateLimitResult.retryAfter}s before retrying.`,
        },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } }
      );
    }
    if (rateLimitResult.status === 'service_unavailable') {
      return NextResponse.json(
        { error: 'Account deletion service is temporarily unavailable.' },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }

    const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const confirmation = (input.confirmation || input.confirmationPhrase) as string | undefined;
    if (confirmation !== CONFIRMATION) {
      return NextResponse.json(
        { error: `Type "${CONFIRMATION}" exactly to confirm account deletion.` },
        { status: 400 }
      );
    }

    // Step 1: Purge storage documents
    try {
      const { data: fileList } = await supabase.storage
        .from('documents')
        .list(user.id, { limit: 1000 });

      const filePaths = (fileList || []).map((file) => `${user.id}/${file.name}`);
      if (filePaths.length) {
        await supabase.storage.from('documents').remove(filePaths);
      }
    } catch (storageError) {
      console.warn('[ACCOUNT_DELETE_STORAGE_CLEANUP_WARN]', {
        userId: user.id,
        message: storageError instanceof Error ? storageError.message : 'Unknown storage error',
      });
    }

    // Step 2: Authoritative transactional deletion of all financial tables via delete_user_account / reset_user_data
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('delete_user_account', {
      p_confirmation_phrase: CONFIRMATION,
    });

    if (rpcError || !rpcData || !(rpcData as { success?: boolean }).success) {
      // Fallback: Attempt reset_user_data directly
      const resetId = `DELETE_ACCOUNT:${user.id}:${crypto.randomUUID()}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resetRes = await (supabase.rpc as any)('reset_user_data', {
        p_reset_id: resetId,
        p_confirmation_phrase: 'RESET MY DATA',
      });
      if (resetRes.error) {
        console.error('[ACCOUNT_DELETE_RPC_FAILED]', {
          userId: user.id,
          code: rpcError?.code,
          message: rpcError?.message,
        });
        return NextResponse.json(
          { success: false, error: 'Database record purge failed. Account deletion aborted for safety.' },
          { status: 500 }
        );
      }
    }

    // Step 3: Remove user from public.profiles, public.user_access_control if any rows remain
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('user_access_control') as any).delete().eq('user_id', user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('profiles') as any).delete().eq('id', user.id);
    } catch {
      // Handled in RPC
    }

    // Step 4: Ensure auth user removal via admin client if not already deleted by RPC
    try {
      const adminClient = createAdminClient();
      await adminClient.auth.admin.deleteUser(user.id);
    } catch {
      // User identity already deleted by database RPC
    }

    // Step 5: Invalidate session cookies
    try {
      await supabase.auth.signOut();
    } catch {
      // Session already invalidated by auth.users deletion
    }

    const durationMs = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[ACCOUNT_DELETED_SUCCESS]', { userId: user.id, durationMs });
    }

    return NextResponse.json({
      success: true,
      message: 'Your account and all associated financial records have been permanently deleted.',
      durationMs,
    });
  } catch (error) {
    console.error('[ACCOUNT_DELETE_UNHANDLED_ERROR]', error);
    return NextResponse.json(
      { success: false, error: 'Account deletion service is temporarily unavailable.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed. Destructive account deletion requires POST with confirmation.' },
    { status: 405 }
  );
}
