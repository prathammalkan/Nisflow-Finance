import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { createClient } from '@/lib/supabase/server';
import Decimal from 'decimal.js';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response('Invalid request body', { status: 400 });
    }

    // Fetch live user financial context
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { data: accounts },
      { data: monthTransactions },
      { data: recentTransactions },
      { data: receivables },
      { data: payables },
    ] = await Promise.all([
      supabase.from('accounts').select('name, type, balance, is_active').eq('user_id', user.id).eq('is_active', true),
      supabase.from('transactions').select('amount, direction, type').eq('user_id', user.id).gte('date', startOfMonth),
      supabase.from('transactions').select('date, amount, direction, type, description').eq('user_id', user.id).order('date', { ascending: false }).limit(10),
      supabase.from('receivables').select('amount, received_amount, person_name, status').eq('user_id', user.id).neq('status', 'settled'),
      supabase.from('payables').select('amount, paid_amount, person_name, status').eq('user_id', user.id).neq('status', 'settled'),
    ]);

    // Calculate balances
    let totalCash = new Decimal(0);
    let totalInvestments = new Decimal(0);
    const accountsList = (accounts || []).map((acc: any) => {
      const bal = new Decimal(acc.balance || 0);
      if (acc.type === 'investment') totalInvestments = totalInvestments.plus(bal);
      else totalCash = totalCash.plus(bal);
      return `- ${acc.name} (${acc.type}): ₹${bal.toFixed(2)}`;
    }).join('\n') || 'No active accounts found.';

    // Calculate this month spending & income
    let monthIncome = new Decimal(0);
    let monthExpenses = new Decimal(0);
    (monthTransactions || []).forEach((tx: any) => {
      const amt = new Decimal(tx.amount || 0);
      if (tx.direction === 'in') monthIncome = monthIncome.plus(amt);
      else if (tx.direction === 'out') monthExpenses = monthExpenses.plus(amt);
    });

    // Calculate outstanding receivables and payables
    let totalReceivables = new Decimal(0);
    (receivables || []).forEach((r: any) => {
      const rem = new Decimal(r.amount || 0).minus(r.received_amount || 0);
      if (rem.greaterThan(0)) totalReceivables = totalReceivables.plus(rem);
    });

    let totalPayables = new Decimal(0);
    (payables || []).forEach((p: any) => {
      const rem = new Decimal(p.amount || 0).minus(p.paid_amount || 0);
      if (rem.greaterThan(0)) totalPayables = totalPayables.plus(rem);
    });

    const netWorth = totalCash.plus(totalInvestments).plus(totalReceivables).minus(totalPayables);

    const recentTxList = (recentTransactions || []).map((tx: any) => 
      `- ${tx.date?.substring(0, 10)}: ${tx.direction === 'in' ? '+' : '-'}₹${tx.amount} (${tx.type || 'transaction'}) "${tx.description || 'No description'}"`
    ).join('\n') || 'No recent transactions recorded.';

    const systemPrompt = `You are NisFlow, a strictly finance-only AI companion built into the NisFlow Finance app.

Your ONLY purpose is to help the user understand and manage their personal finances inside this app.

CURRENT USER LIVE FINANCIAL DATA (Real-time from database):
- Current Month: ${now.toLocaleString('default', { month: 'long', year: 'numeric' })}
- Total Net Worth: ₹${netWorth.toFixed(2)}
- Available Liquid Cash: ₹${totalCash.toFixed(2)}
- Total Investments: ₹${totalInvestments.toFixed(2)}
- This Month Income: ₹${monthIncome.toFixed(2)}
- This Month Expenses: ₹${monthExpenses.toFixed(2)}
- Net Monthly Cashflow: ₹${monthIncome.minus(monthExpenses).toFixed(2)}
- Total Receivables (Money owed to user): ₹${totalReceivables.toFixed(2)}
- Total Payables (Money user owes): ₹${totalPayables.toFixed(2)}

User Accounts:
${accountsList}

Recent Transactions:
${recentTxList}

STRICT SCOPE AND BEHAVIOR RULES:
1. You MUST REFUSE any question that is not related to personal finance or the user's NisFlow financial data. If the user asks about coding, creative writing, science, general trivia, entertainment, weather, or anything unrelated to personal finance, respond ONLY with:
"I'm a finance-only assistant. I can only help you with your accounts, transactions, budgets, and financial data inside NisFlow."
2. Always format currency amounts in Indian Rupees with the ₹ symbol (e.g. ₹12,500.00).
3. Use the live data provided above to give direct, accurate, and concise answers to the user's questions.
4. Keep your answers brief, professional, and directly actionable. Avoid unnecessary disclaimers or filler text.`;

    const result = streamText({
      model: google('gemini-2.0-flash'),
      system: systemPrompt,
      messages: messages.map((m: any) => ({
        role: m.role,
        content: m.content || '',
      })),
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
