import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    
    // Fetch current month's transactions
    const { data: currentMonthData, error } = await supabase
      .from('transactions')
      .select('amount, direction, type, description, date, categories!transactions_category_id_fkey(name)')
      .eq('user_id', user.id)
      .gte('date', currentMonthStart)
      .order('date', { ascending: false });

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }

    if (!currentMonthData || currentMonthData.length === 0) {
      return NextResponse.json({ insight: "You haven't recorded any transactions this month yet! Start tracking to get personalized insights." });
    }

    // Format data for AI
    const summary = ((currentMonthData as any[]) || []).map(tx => 
      `${tx.date}: ${tx.direction === 'in' ? '+' : '-'}₹${tx.amount} (${tx.type}) - ${tx.description} [Category: ${(tx.categories as any)?.name || 'None'}]`
    ).join('\n');

    // Use Gemini to generate insight
    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      system: 'You are NisFlow Finance, an expert and encouraging financial assistant. Review the provided list of the user\'s transactions for this month. Write a short, highly professional, 2-3 paragraph markdown summary. Point out their biggest expense category, applaud any savings/income, and give one actionable tip for the rest of the month. Use ₹ for currency. Do not list out every transaction. Be concise.',
      prompt: `Here are my transactions for this month:\n\n${summary}`,
    });

    return NextResponse.json({ insight: text });
  } catch (error) {
    console.error('Insights API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
