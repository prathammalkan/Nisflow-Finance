import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

// Shared in-memory rate limiter: 10 insight requests per user per hour
const insightRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkInsightRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const maxReqs = 10;
  const entry = insightRateLimitMap.get(userId);
  if (!entry || now > entry.resetAt) {
    insightRateLimitMap.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxReqs) return false;
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

    // Rate limit: max 10 insight requests per user per hour
    if (!checkInsightRateLimit(user.id)) {
      return NextResponse.json(
        { error: 'Too many requests. Insight generation is limited to 10 per hour.' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Fetch current month's transactions (capped at 100 to prevent huge prompts)
    const { data: currentMonthData, error } = await supabase
      .from('transactions')
      .select('amount, direction, type, description, date, categories!transactions_category_id_fkey(name)')
      .eq('user_id', user.id)
      .gte('date', currentMonthStart)
      .order('date', { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }

    if (!currentMonthData || currentMonthData.length === 0) {
      return NextResponse.json({
        insight: "You haven't recorded any transactions this month yet! Start tracking to get personalized insights.",
      });
    }

    // Format data for AI — sanitise strings to prevent prompt injection
    const summary = (currentMonthData as any[]).map(tx =>
      `${String(tx.date).substring(0, 10)}: ${tx.direction === 'in' ? '+' : '-'}Rs.${Number(tx.amount).toFixed(2)} (${String(tx.type || '').substring(0, 30)}) - ${String(tx.description || '').substring(0, 60)} [${(tx.categories as any)?.name || 'Uncategorized'}]`
    ).join('\n');

    const { text } = await generateText({
      model: google('gemini-3.6-flash'),
      system: `You are NisFlow Finance, a concise financial assistant. 
Review the user's transaction list and write a short 2–3 paragraph markdown summary.
Mention their biggest expense category, highlight any income or savings, and give one actionable tip.
Always use Rs. prefix for currency (Indian Rupees).
Be direct, professional, and encouraging. Do not list individual transactions.`,
      prompt: `My transactions this month:\n\n${summary}`,
    });

    return NextResponse.json({ insight: text });
  } catch (error) {
    console.error('Insights API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
