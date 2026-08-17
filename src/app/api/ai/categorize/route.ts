import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

// Rate limiter: 60 categorize requests per user per minute
const catRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkCatRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = catRateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    catRateLimitMap.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 60) return false;
  entry.count++;
  return true;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!checkCatRateLimit(user.id)) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    const body = await req.json();
    const { description } = body;

    if (!description || typeof description !== 'string') {
      return NextResponse.json({ error: 'Invalid description' }, { status: 400 });
    }

    // Cap description length to prevent prompt injection
    const sanitizedDescription = String(description).slice(0, 200);

    // Fetch user's categories
    const { data: categories, error } = await supabase
      .from('categories')
      .select('id, name, type, is_system')
      .order('name');

    if (error || !categories) {
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    // Prepare categories string for the AI prompt
    const categoryList = ((categories as any[]) || [])
      .map((c) => `- ID: ${c.id} | Name: ${c.name} | Type: ${c.type}`)
      .join('\n');

    // Use Gemini to categorize
    const { object } = await generateObject({
      model: google('gemini-2.0-flash'),
      schema: z.object({
        categoryId: z.string().uuid().describe('The ID of the best matching category'),
        confidence: z.number().min(0).max(1).describe('Confidence score from 0 to 1'),
      }),
      prompt: `You are a smart financial categorizer.
Given a transaction description, you must pick the single best matching category from the user's available categories.

User's Categories:
${categoryList}

Transaction Description: "${sanitizedDescription}"

If it's an expense like "Starbucks", "Uber", or "Rent", pick the matching expense category.
If it's income like "Salary", pick an income category.
If no exact match exists, pick the closest general category (like "Other Expense" or "Other Income").
Return ONLY the category ID and a confidence score.`,
    });

    return NextResponse.json({
      categoryId: object.categoryId,
      confidence: object.confidence,
    });
  } catch (error) {
    console.error('Categorize API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
