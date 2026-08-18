import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import { createClient } from '@/lib/supabase/server';
import Decimal from 'decimal.js';

import { checkChatRateLimit } from '@/lib/security/rate-limit';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Please sign in.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Distributed Rate limit check with 429 vs 503 differentiation
    const rateLimitResult = await checkChatRateLimit(user.id, req);

    if (rateLimitResult.status === 'rate_limited') {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait a moment before asking again.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(rateLimitResult.retryAfter),
          },
        }
      );
    }

    if (rateLimitResult.status === 'service_unavailable') {
      return new Response(
        JSON.stringify({ error: rateLimitResult.error }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid request body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Limit message history to prevent prompt injection via large payloads
    if (messages.length > 20) {
      return new Response(JSON.stringify({ error: 'Too many messages in history.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const sanitizedMessages = messages
      .map((m: any) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: String(m.content || '').slice(0, 2000),
      }))
      .filter((m) => m.content.trim().length > 0);

    // Fetch live user financial context
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      { data: accounts },
      { data: counterparties },
      { data: monthTransactions },
      { data: recentTransactions },
      { data: receivables },
      { data: payables },
    ] = await Promise.all([
      // Hardened Context: Fetch bounded subsets with minimal required fields (Least-Privilege context)
      supabase.from('accounts').select('id, name, type, balance').eq('user_id', user.id).eq('is_active', true).limit(50),
      supabase.from('counterparties').select('id, name').eq('user_id', user.id).limit(50),
      supabase.from('transactions').select('amount, direction, type').eq('user_id', user.id).gte('date', startOfMonth),
      supabase.from('transactions').select('date, amount, direction, type, description').eq('user_id', user.id).order('date', { ascending: false }).limit(10),
      supabase.from('receivables').select('amount, received_amount, status').eq('user_id', user.id).neq('status', 'settled'),
      supabase.from('payables').select('amount, paid_amount, status').eq('user_id', user.id).neq('status', 'settled'),
    ]);

    // Calculate balances
    let totalCash = new Decimal(0);
    let totalInvestments = new Decimal(0);
    const accountsList = (accounts || []).map((acc: any) => {
      const bal = new Decimal(acc.balance || 0);
      if (acc.type === 'investment') totalInvestments = totalInvestments.plus(bal);
      else totalCash = totalCash.plus(bal);
      return `- ${acc.name} (Type: ${acc.type}, ID: ${acc.id}): ₹${bal.toFixed(2)}`;
    }).join('\n') || 'No active accounts found.';

    const peopleList = (counterparties || []).map((p: any) => 
      `- ${p.name} (ID: ${p.id})`
    ).join('\n') || 'No counterparties recorded yet.';

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

    const todayDate = now.toISOString().split('T')[0];

    const systemPrompt = `You are NisFlow, a strictly finance-only AI companion built into the NisFlow Finance app.

Your purpose is to help the user understand and manage their personal finances inside this app, including answering inquiries AND helping them record new financial entries (transactions, loans, borrowings, lent money).

CURRENT USER LIVE FINANCIAL DATA (Real-time from database):
- Today's Date: ${todayDate}
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

User Counterparties / People:
${peopleList}

Recent Transactions:
${recentTxList}

RECORDING DATA & ACTIONS:
When the user states that they spent, received, borrowed, or lent money (e.g., "I borrowed ₹5,000 from Rahul", "Paid ₹500 for groceries", "Received ₹20,000 salary in HDFC account", "Lent ₹2,000 to Amit", "Got ₹3,000 from Rohit"), you must:
1. Provide a short, friendly conversational message confirming what you parsed (1-2 sentences).
2. At the end of your message, output a strict JSON action block enclosed in [ACTION] and [/ACTION] tags.

Action Block Schema:
[ACTION]
{
  "actionType": "transaction" | "payable" | "receivable",
  "amount": <number>,
  "description": "<string summary>",
  "type": "expense" | "income" | "transfer",
  "direction": "in" | "out",
  "accountName": "<matched or mentioned account name or empty>",
  "accountId": "<matched account ID from list above if found>",
  "personName": "<person name if mentioned>",
  "personId": "<matched person ID from list above if found>",
  "date": "${todayDate}",
  "notes": "<optional additional context>"
}
[/ACTION]

Classification Guide for actionType:
- "payable": user borrowed money or owes someone (e.g. "borrowed 5000 from Rahul", "need to pay 2000 to Priya").
- "receivable": someone borrowed from user or owes user (e.g. "lent 2000 to Amit", "Rahul owes me 1500").
- "transaction": normal expense, income, or transfer (e.g. "bought groceries for 800", "salary of 50000 in Kotak").
  - type: "expense" (direction: "out")
  - type: "income" (direction: "in")
  - type: "transfer" (direction: "out" from source)

STRICT SCOPE AND BEHAVIOR RULES:
1. You MUST REFUSE any question that is not related to personal finance or the user's NisFlow financial data. If the user asks about coding, creative writing, science, general trivia, entertainment, weather, or anything unrelated to personal finance, respond ONLY with:
"I'm a finance-only assistant. I can only help you with your accounts, transactions, budgets, and financial data inside NisFlow."
2. Always format currency amounts in Indian Rupees with the ₹ symbol (e.g. ₹12,500.00).
3. If the user is only asking a question (e.g. "What is my balance?", "How much did I spend?"), answer directly and DO NOT append [ACTION]. Only append [ACTION] when recording/logging new data.
4. Keep answers concise, professional, and directly actionable.`;

    const result = streamText({
      model: google('gemini-3.6-flash'),
      system: systemPrompt,
      messages: sanitizedMessages,
    });

    return result.toTextStreamResponse({
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'NisFlow AI is temporarily unavailable. Try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
