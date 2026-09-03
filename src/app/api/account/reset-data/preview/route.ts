import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkPreviewRateLimit } from '@/lib/security/rate-limit';


export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    // LOW-11/BE-02: Use separate preview rate-limit bucket (20/60s) independent of execute bucket (5/600s)
    const rateLimitResult = await checkPreviewRateLimit(user.id, req);

    if (rateLimitResult.status === 'rate_limited') {
      return NextResponse.json(
        { error: `Too many reset preview requests. Please wait ${rateLimitResult.retryAfter}s before retrying.` },
        { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } },
      );
    }
    if (rateLimitResult.status === 'service_unavailable') {
      return NextResponse.json({ error: 'Reset preview service is temporarily unavailable.' }, { status: 503 });
    }

    const { data: previewData, error: rpcError } = await (supabase.rpc as any)('preview_user_data_reset');
    if (rpcError || !previewData) {
      console.error('[RESET_PREVIEW_ERROR]', { code: rpcError?.code, message: rpcError?.message });
      return NextResponse.json({ error: 'Unable to generate the reset preview right now.' }, { status: 500 });
    }

    let storageFilesCount = 0;
    const { data: fileList, error: storageError } = await supabase.storage
      .from('documents')
      .list(user.id, { limit: 1000 });

    if (!storageError && fileList) storageFilesCount = fileList.length;

    const typedPreview = previewData as { totalRecords?: number; breakdown?: Record<string, number> };
    const databaseRecords = Number(typedPreview.totalRecords || 0);

    return NextResponse.json({
      success: true,
      totalRecords: databaseRecords + storageFilesCount,
      databaseRecords,
      storageFilesCount,
      breakdown: { ...(typedPreview.breakdown || {}), storage_documents: storageFilesCount },
    });
  } catch (error) {
    console.error('[RESET_PREVIEW_UNHANDLED_ERROR]', error);
    return NextResponse.json({ error: 'Unable to generate the reset preview right now.' }, { status: 500 });
  }
}
