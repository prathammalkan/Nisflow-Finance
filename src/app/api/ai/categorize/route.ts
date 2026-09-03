import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateObject } from 'ai';
import { z } from 'zod';

import { checkCategorizeRateLimit } from '@/lib/security/rate-limit';
import {
  getGoogleAIProvider,
  getCanonicalAIModel,
  normalizeAIProviderError,
} from '@/lib/ai/config';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Distributed Rate limit check
    const rateLimitResult = await checkCategorizeRateLimit(user.id, req);

    if (rateLimitResult.status === 'rate_limited') {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment before trying again.' },
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

    const body = await req.json();
    const { description } = body;

    if (!description || typeof description !== 'string') {
      return NextResponse.json({ error: 'Invalid description' }, { status: 400 });
    }

    // Cap description length to prevent prompt injection
    const sanitizedDescription = String(description).slice(0, 200);

    // Fetch user's categories — scoped by user_id (system categories use user_id filter via RLS)
    const { data: categories, error } = await supabase
      .from('transaction_categories')
      .select('id, name, type, is_system')
      .order('name');

    if (error || !categories) {
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    const categoryRows = (categories as any[]) || [];

    // LOW-01: Use positional index instead of UUID in AI prompt to prevent UUID leakage to external provider
    // LOW-12: After AI returns an index, resolve it to UUID server-side and validate ownership
    const categoryList = categoryRows
      .map((c, i) => `- [${i}] ${c.name} (${c.type})`)
      .join('\n');

    const google = getGoogleAIProvider();
    const model = getCanonicalAIModel();

    // Use Gemini to categorize — AI returns a positional index, not a UUID
    const { object } = await generateObject({
      model: google(model),
      schema: z.object({
        categoryIndex: z.number().int().min(0).describe('The zero-based index of the best matching category from the list'),
        confidence: z.number().min(0).max(1).describe('Confidence score from 0 to 1'),
      }),
      prompt: `You are a smart financial categorizer.
Given a transaction description, you must pick the single best matching category from the user's available categories.

User's Categories (use the number index [N] to identify them):
${categoryList}

Transaction Description: "${sanitizedDescription}"

If it's an expense like "Starbucks", "Uber", or "Rent", pick the matching expense category.
If it's income like "Salary", pick an income category.
If no exact match exists, pick the closest general category (like "Other Expense" or "Other Income").
Return ONLY the category index number and a confidence score.`,
    });

    // LOW-12: Validate that the returned index is within bounds (server-side ownership validation)
    const idx = object.categoryIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx >= categoryRows.length) {
      return NextResponse.json({ error: 'AI returned invalid category selection.' }, { status: 422 });
    }

    // Resolve index to UUID server-side — the client never had a UUID to manipulate
    const resolvedCategory = categoryRows[idx];

    return NextResponse.json({
      categoryId: resolvedCategory.id,
      confidence: object.confidence,
    });
  } catch (error) {
    const normalized = normalizeAIProviderError(error);
    return NextResponse.json(
      { error: normalized.error },
      {
        status: normalized.statusCode,
        headers: normalized.statusCode === 429 ? { 'Retry-After': '30' } : undefined,
      }
    );
  }
}

