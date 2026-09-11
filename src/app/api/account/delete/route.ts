import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { checkDeleteAccountRateLimit } from '@/lib/security/rate-limit';

const CONFIRMATION = 'DELETE MY ACCOUNT';

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
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
    if (input.confirmation !== CONFIRMATION) {
      return NextResponse.json(
        { error: `Type "${CONFIRMATION}" exactly to confirm account deletion.` },
        { status: 400 }
      );
    }

    const resetId = `DELETE_ACCOUNT:${user.id}:${crypto.randomUUID()}`;

    // Step 1: Authoritative purge of all user financial records via reset_user_data RPC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('reset_user_data', {
      p_reset_id: resetId,
      p_confirmation_phrase: 'RESET MY DATA',
    });

    if (rpcError || !rpcData || !(rpcData as { success?: boolean }).success) {
      console.error('[ACCOUNT_DELETE_DB_PURGE_FAILED]', {
        userId: user.id,
        code: rpcError?.code,
        message: rpcError?.message,
      });
      return NextResponse.json(
        { success: false, error: 'Database record purge failed. Account deletion aborted for safety.' },
        { status: 500 }
      );
    }

    // Step 2: Purge storage documents
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

    // Step 3: Remove user from public.profiles, public.user_access_control if any rows remain
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('user_access_control') as any).delete().eq('user_id', user.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('profiles') as any).delete().eq('user_id', user.id);

    // Step 4: Delete Auth User using the secure server-side Admin client
    const adminClient = createAdminClient();
    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      console.error('[ACCOUNT_DELETE_AUTH_FAILED]', {
        userId: user.id,
        message: deleteUserError.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Your financial data was removed, but auth user removal encountered an error. Please contact support.',
        },
        { status: 500 }
      );
    }

    // Step 5: Sign out and invalidate session cookies
    await supabase.auth.signOut();

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
