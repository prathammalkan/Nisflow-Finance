import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkResetDataRateLimit } from '@/lib/security/rate-limit';

export type ResetLifecycleState =
  | 'PREPARING'
  | 'DATABASE_PURGING'
  | 'STORAGE_PURGING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED_REQUIRES_RETRY';

const CONFIRMATION = 'RESET MY DATA';

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const rateLimitResult = await checkResetDataRateLimit(user.id, req);
    if (rateLimitResult.status === 'rate_limited') {
      return NextResponse.json(
        { error: `Too many reset requests. Please wait ${rateLimitResult.retryAfter}s before retrying.` },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } },
      );
    }
    if (rateLimitResult.status === 'service_unavailable') {
      return NextResponse.json({ error: 'Reset service is temporarily unavailable.' }, { status: 503 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }

    const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
    if (input.confirmation !== CONFIRMATION) {
      return NextResponse.json({ error: `Type "${CONFIRMATION}" exactly to confirm.` }, { status: 400 });
    }

    const requestedResetId = typeof input.resetId === 'string' ? input.resetId : null;
    const retryStorage = input.action === 'retry_storage';
    const resetId = requestedResetId?.startsWith(`RESET:${user.id}:`)
      ? requestedResetId
      : `RESET:${user.id}:${crypto.randomUUID()}`;

    let dbDeletedCounts: Record<string, number> = {};
    let totalDbDeleted = 0;

    if (!retryStorage) {
      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('reset_user_data', {
        p_reset_id: resetId,
        p_confirmation_phrase: CONFIRMATION,
      });

      if (rpcError || !rpcData || !(rpcData as { success?: boolean }).success) {
        console.error('[DATA_RESET_DATABASE_FAILED]', {
          resetId,
          code: rpcError?.code,
          message: rpcError?.message,
        });
        return NextResponse.json(
          { success: false, lifecycleState: 'FAILED_REQUIRES_RETRY', resetId, error: 'Database reset could not be completed.' },
          { status: 500 },
        );
      }

      const result = rpcData as { totalDeleted?: number; deletedCounts?: Record<string, number> };
      dbDeletedCounts = result.deletedCounts || {};
      totalDbDeleted = result.totalDeleted || 0;
    }

    let storageDeletedCount = 0;
    try {
      const { data: fileList, error: listError } = await supabase.storage
        .from('documents')
        .list(user.id, { limit: 1000 });

      if (listError) throw new Error(listError.message);

      const filePaths = (fileList || []).map((file) => `${user.id}/${file.name}`);
      if (filePaths.length) {
        const { error: removeError } = await supabase.storage.from('documents').remove(filePaths);
        if (removeError) throw new Error(removeError.message);
        storageDeletedCount = filePaths.length;
      }
    } catch (error) {
      console.error('[DATA_RESET_STORAGE_FAILED]', { resetId, message: error instanceof Error ? error.message : 'unknown' });
      return NextResponse.json(
        {
          success: false,
          lifecycleState: 'FAILED_REQUIRES_RETRY',
          resetId,
          databaseDeleted: !retryStorage,
          storageDeleted: false,
          error: 'Database reset completed, but file cleanup needs to be retried.',
        },
        { status: 500 },
      );
    }

    // Authoritative post-reset verification uses the same DB function as the preview endpoint.
    const { data: previewData, error: verifyDbError } = await (supabase.rpc as any)('preview_user_data_reset');
    const remainingDbRecords = Number((previewData as { totalRecords?: number } | null)?.totalRecords || 0);

    const { data: remainingFiles, error: verifyStorageError } = await supabase.storage
      .from('documents')
      .list(user.id, { limit: 1000 });

    if (verifyDbError || remainingDbRecords !== 0 || verifyStorageError || (remainingFiles?.length || 0) !== 0) {
      console.error('[DATA_RESET_VERIFY_FAILED]', {
        resetId,
        verifyDbCode: verifyDbError?.code,
        remainingDbRecords,
        remainingFiles: remainingFiles?.length || 0,
      });
      return NextResponse.json(
        { success: false, lifecycleState: 'FAILED_REQUIRES_RETRY', resetId, error: 'Reset could not be fully verified. Please retry.' },
        { status: 500 },
      );
    }

    const durationMs = Date.now() - startTime;
    console.log('[DATA_RESET_COMPLETED]', { resetId, durationMs, totalDbDeleted, storageDeletedCount });

    return NextResponse.json({
      success: true,
      lifecycleState: 'COMPLETED',
      resetId,
      deletedCounts: { ...dbDeletedCounts, storage_documents: storageDeletedCount },
      totalDeleted: totalDbDeleted + storageDeletedCount,
      verification: { databaseClean: true, storageClean: true, zeroRecordsVerified: true },
      durationMs,
    });
  } catch (error) {
    console.error('[DATA_RESET_UNHANDLED_ERROR]', error);
    return NextResponse.json(
      { success: false, lifecycleState: 'FAILED_REQUIRES_RETRY', error: 'Reset service is temporarily unavailable.' },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed. Destructive reset requires POST with confirmation.' },
    { status: 405 },
  );
}
