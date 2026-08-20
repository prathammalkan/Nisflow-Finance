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

/**
 * POST /api/account/reset-data
 * 
 * Production-grade, multi-stage destructive reset endpoint.
 * Purges all database records and storage objects belonging to the authenticated user.
 * 
 * Security:
 * - Strictly requires authenticated server session (auth.uid())
 * - Never accepts client user_id as authority
 * - Rate-limited to prevent abuse
 * - Requires exact case-sensitive confirmation phrase: "RESET MY DATA"
 * - Atomic PostgreSQL purge + explicit storage purge + dual verification
 * - Logs safe audit events without sensitive contents
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  let lifecycleState: ResetLifecycleState = 'PREPARING';

  try {
    // 1. Authentication Check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authentication required to reset financial data.' },
        { status: 401 }
      );
    }

    // 2. Distributed Rate Limiting Check
    const rateLimitResult = await checkResetDataRateLimit(user.id, req);
    if (rateLimitResult.status === 'rate_limited') {
      return NextResponse.json(
        { error: `Too many reset requests. Please wait ${rateLimitResult.retryAfter}s before retrying.` },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimitResult.retryAfter) },
        }
      );
    }
    if (rateLimitResult.status === 'service_unavailable') {
      return NextResponse.json(
        { error: rateLimitResult.error },
        { status: 503 }
      );
    }

    // 3. Request Body & Confirmation Phrase Validation
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON request body.' },
        { status: 400 }
      );
    }

    const { confirmation, resetId: clientResetId, action } = body;

    // Strict exact confirmation phrase check
    if (confirmation !== 'RESET MY DATA') {
      return NextResponse.json(
        {
          error: 'Confirmation phrase mismatch. You must explicitly type "RESET MY DATA" (exact match).',
        },
        { status: 400 }
      );
    }

    // Deterministic Reset Operation Identifier
    const resetId = clientResetId && clientResetId.startsWith(`RESET:${user.id}:`)
      ? clientResetId
      : `RESET:${user.id}:${crypto.randomUUID()}`;

    console.log(`[DATA_RESET_STARTED] ResetId=${resetId} User=${user.id.slice(0, 8)}... Timestamp=${new Date().toISOString()}`);

    // =========================================================================
    // PHASE 1: DATABASE PURGE (Atomic PostgreSQL RPC)
    // =========================================================================
    let dbDeletedCounts: Record<string, number> = {};
    let totalDbDeleted = 0;

    // Skip DB purge if this is purely a storage retry action
    if (action !== 'retry_storage') {
      lifecycleState = 'DATABASE_PURGING';

      const { data: rpcData, error: rpcError } = await (supabase.rpc as any)('reset_user_data', {
        p_reset_id: resetId,
        p_confirmation_phrase: 'RESET MY DATA',
      });


      if (rpcError || !rpcData || !(rpcData as any).success) {
        const errorMsg = rpcError?.message || 'Database reset procedure failed.';
        console.error(`[DATA_RESET_DATABASE_FAILED] ResetId=${resetId}:`, errorMsg);
        return NextResponse.json(
          {
            success: false,
            lifecycleState: 'FAILED_REQUIRES_RETRY',
            resetId,
            error: errorMsg,
          },
          { status: 500 }
        );
      }

      const rpcResult = rpcData as { totalDeleted: number; deletedCounts: Record<string, number>; verified: boolean };
      dbDeletedCounts = rpcResult.deletedCounts || {};
      totalDbDeleted = rpcResult.totalDeleted || 0;

      console.log(`[DATA_RESET_DATABASE_COMPLETE] ResetId=${resetId} TotalPurged=${totalDbDeleted}`);
    }

    // =========================================================================
    // PHASE 2: STORAGE PURGE (Supabase Storage 'documents' bucket)
    // =========================================================================
    lifecycleState = 'STORAGE_PURGING';
    let storageDeletedCount = 0;
    let storageErrorMsg: string | null = null;

    try {
      // 1. List all files in user's isolated folder in documents bucket
      const { data: fileList, error: listError } = await supabase.storage
        .from('documents')
        .list(user.id, { limit: 1000 });

      if (listError) {
        throw new Error(`Failed to list user files in storage: ${listError.message}`);
      }

      if (fileList && fileList.length > 0) {
        const filePaths = fileList.map((file) => `${user.id}/${file.name}`);
        const { error: removeError } = await supabase.storage
          .from('documents')
          .remove(filePaths);

        if (removeError) {
          throw new Error(`Failed to delete files from storage: ${removeError.message}`);
        }

        storageDeletedCount = filePaths.length;
      }

      console.log(`[DATA_RESET_STORAGE_COMPLETE] ResetId=${resetId} FilesRemoved=${storageDeletedCount}`);
    } catch (storageErr: any) {
      console.error(`[DATA_RESET_STORAGE_FAILED] ResetId=${resetId}:`, storageErr?.message || storageErr);
      storageErrorMsg = storageErr?.message || 'Failed to remove files from storage bucket.';
    }

    // If storage deletion failed, enter FAILED_REQUIRES_RETRY state
    if (storageErrorMsg) {
      return NextResponse.json(
        {
          success: false,
          lifecycleState: 'FAILED_REQUIRES_RETRY',
          resetId,
          databaseDeleted: true,
          storageDeleted: false,
          error: `Database reset succeeded, but storage file cleanup encountered an error: ${storageErrorMsg}. You can safely retry to complete file purging.`,
        },
        { status: 500 }
      );
    }

    // =========================================================================
    // PHASE 3: DUAL VERIFICATION (PostgreSQL + Storage)
    // =========================================================================
    lifecycleState = 'VERIFYING';

    // 1. Storage Verification: Must have 0 objects remaining
    const { data: remainingFiles, error: verifyStorageError } = await supabase.storage
      .from('documents')
      .list(user.id, { limit: 10 });

    if (verifyStorageError || (remainingFiles && remainingFiles.length > 0)) {
      console.error(`[DATA_RESET_STORAGE_VERIFY_FAILED] ResetId=${resetId} RemainingFiles=${remainingFiles?.length || 0}`);
      return NextResponse.json(
        {
          success: false,
          lifecycleState: 'FAILED_REQUIRES_RETRY',
          resetId,
          error: 'Reset could not be fully verified: Storage files remain in user bucket.',
        },
        { status: 500 }
      );
    }

    // 2. Database Verification: Check accounts and transactions
    const [{ count: accCount }, { count: txCount }] = await Promise.all([
      supabase.from('accounts').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

    if ((accCount || 0) > 0 || (txCount || 0) > 0) {
      console.error(`[DATA_RESET_DB_VERIFY_FAILED] ResetId=${resetId} Accs=${accCount} Txs=${txCount}`);
      return NextResponse.json(
        {
          success: false,
          lifecycleState: 'FAILED_REQUIRES_RETRY',
          resetId,
          error: 'Reset could not be fully verified: Financial records remain in database.',
        },
        { status: 500 }
      );
    }

    // =========================================================================
    // PHASE 4: COMPLETED
    // =========================================================================
    lifecycleState = 'COMPLETED';
    const durationMs = Date.now() - startTime;

    console.log(`[DATA_RESET_COMPLETED] ResetId=${resetId} Duration=${durationMs}ms TotalPurged=${totalDbDeleted + storageDeletedCount}`);

    return NextResponse.json({
      success: true,
      lifecycleState: 'COMPLETED',
      resetId,
      deletedCounts: {
        ...dbDeletedCounts,
        storage_documents: storageDeletedCount,
      },
      totalDeleted: totalDbDeleted + storageDeletedCount,
      verification: {
        databaseClean: true,
        storageClean: true,
        zeroRecordsVerified: true,
      },
      durationMs,
    });
  } catch (error: any) {
    console.error('[DATA_RESET_UNHANDLED_ERROR]', error);
    return NextResponse.json(
      {
        success: false,
        lifecycleState: 'FAILED_REQUIRES_RETRY',
        error: error?.message || 'An unexpected error occurred during data reset.',
      },
      { status: 500 }
    );
  }
}

/**
 * Reject any non-POST requests to prevent query-string or accidental GET invocation.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Method Not Allowed. Destructive reset requires POST with confirmation.' },
    { status: 405 }
  );
}
