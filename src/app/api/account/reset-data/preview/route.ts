import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkResetDataRateLimit } from '@/lib/security/rate-limit';

/**
 * GET /api/account/reset-data/preview
 * 
 * Provides an authoritative, read-only pre-flight count of all user-owned records
 * across all 35 database tables and documents storage.
 * 
 * Security:
 * - Requires active authenticated session (auth.uid())
 * - Never mutates database or storage
 * - Tenant-isolated via server session
 * - Rate-limited to prevent abuse
 */
export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Authentication required to preview reset data.' },
        { status: 401 }
      );
    }

    // Rate Limiting Check
    const rateLimitResult = await checkResetDataRateLimit(user.id, req);
    if (rateLimitResult.status === 'rate_limited') {
      return NextResponse.json(
        { error: `Too many reset preview requests. Please wait ${rateLimitResult.retryAfter}s before retrying.` },
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

    // Call PostgreSQL RPC preview_user_data_reset()
    const { data: previewData, error: rpcError } = await supabase.rpc('preview_user_data_reset');

    if (rpcError) {
      console.error('[RESET_PREVIEW_ERROR]', rpcError);
      return NextResponse.json(
        { error: rpcError.message || 'Failed to retrieve reset preview data.' },
        { status: 500 }
      );
    }

    // Count storage files in documents bucket for this user
    let storageFilesCount = 0;
    try {
      const { data: fileList, error: storageErr } = await supabase.storage
        .from('documents')
        .list(user.id, { limit: 1000 });

      if (!storageErr && fileList) {
        storageFilesCount = fileList.length;
      }
    } catch (err) {
      console.warn('[RESET_PREVIEW_STORAGE_WARN] Could not count storage objects:', err);
    }

    const typedPreview = previewData as { totalRecords: number; breakdown: Record<string, number> } || {
      totalRecords: 0,
      breakdown: {},
    };

    return NextResponse.json({
      success: true,
      totalRecords: (typedPreview.totalRecords || 0) + storageFilesCount,
      databaseRecords: typedPreview.totalRecords || 0,
      storageFilesCount,
      breakdown: {
        ...typedPreview.breakdown,
        storage_documents: storageFilesCount,
      },
    });
  } catch (error: any) {
    console.error('[RESET_PREVIEW_UNHANDLED_ERROR]', error);
    return NextResponse.json(
      { error: error?.message || 'An unexpected error occurred while generating preview.' },
      { status: 500 }
    );
  }
}
