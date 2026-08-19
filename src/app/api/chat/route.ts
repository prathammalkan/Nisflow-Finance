import { createGoogle } from '@ai-sdk/google';
import { streamText } from 'ai';
import { createClient } from '@/lib/supabase/server';
import Decimal from 'decimal.js';
import { checkChatRateLimit } from '@/lib/security/rate-limit';
import {
  getCounterpartyAuthoritativeBalance,
  getPersonLedgerHistory,
} from '@/lib/ledger/people';
import { getLoanAuthoritativeBalance } from '@/lib/ledger/loans';

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

    const tContextStart = performance.now();

    // Fetch live user financial context concurrently (Authoritative Double-Entry Ledger Source of Truth)
    const [
      { data: accounts },
      { data: counterparties },
      { data: loans },
      { data: holdings },
      { data: recentTransactions },
      { data: ledgerAccounts },
      { data: journalLines },
    ] = await Promise.all([
      // Hardened Context: Fetch bounded subsets with minimal required fields (Least-Privilege context)
      supabase.from('accounts').select('id, name, type, balance, current_balance').eq('user_id', user.id).eq('is_active', true).limit(50),
      supabase.from('counterparties').select('id, name').eq('user_id', user.id).limit(50),
      supabase.from('loans').select('id, name, type, loan_amount').eq('user_id', user.id).limit(20),
      supabase.from('holdings').select('id, symbol, name, quantity, average_buy_price').eq('user_id', user.id).limit(20),
      supabase.from('transactions').select('date, amount, direction, type, description').eq('user_id', user.id).order('date', { ascending: false }).limit(10),
      supabase.from('ledger_accounts').select('id, account_type, entity_type, entity_id').eq('user_id', user.id),
      supabase.from('journal_lines').select(`
        ledger_account_id,
        debit_amount,
        credit_amount,
        journal_entries!inner (status)
      `).eq('user_id', user.id).eq('journal_entries.status', 'posted'),
    ]);

    // 1. Build authoritative ledger account balance map from journal lines
    const ledgerBalanceMap = new Map<string, Decimal>();
    for (const line of (journalLines as any[]) || []) {
      const accId = line.ledger_account_id;
      const netDelta = new Decimal(line.debit_amount || 0).minus(new Decimal(line.credit_amount || 0));
      const current = ledgerBalanceMap.get(accId) || new Decimal(0);
      ledgerBalanceMap.set(accId, current.plus(netDelta));
    }

    // 2. Map account entity IDs to authoritative ledger balances
    const entityLedgerMap = new Map<string, Decimal>();
    for (const la of (ledgerAccounts as any[]) || []) {
      if (la.entity_type === 'account' && la.entity_id) {
        const netDebit = ledgerBalanceMap.get(la.id) || new Decimal(0);
        const authBalance = la.account_type === 'asset' ? netDebit : netDebit.negated();
        entityLedgerMap.set(la.entity_id, authBalance);
      }
    }

    const lastUserMsg = [...sanitizedMessages].reverse().find((m) => m.role === 'user')?.content.toLowerCase() || '';

    // 3. Least-Privilege Person Scoping (Only fetch detailed ledger history when user mentions person)
    const cpList: Array<{ id: string; name: string }> = (counterparties as any) || [];
    const matchedPerson = cpList.find((p) =>
      p.name && lastUserMsg.includes(p.name.toLowerCase())
    );

    let personSpecificContext = '';
    if (matchedPerson) {
      try {
        const [pBalances, pHistory] = await Promise.all([
          getCounterpartyAuthoritativeBalance(supabase as any, user.id, matchedPerson.id),
          getPersonLedgerHistory(supabase as any, user.id, matchedPerson.id),
        ]);

        const recentLines = (pHistory || []).slice(-5).map(
          (h) => `- ${h.transactionDate}: ${h.description} | Net Balance: ₹${h.runningNetBalance} (${h.direction})`
        ).join('\n') || 'No previous transactions.';

        personSpecificContext = `
TARGET PERSON LEDGER CONTEXT (Authoritative Double-Entry from Ledger):
- Person: ${matchedPerson.name} (ID: ${matchedPerson.id})
- Receivable Balance (Amount they owe you): ₹${pBalances.receivableBalance.toFixed(2)}
- Payable Balance (Amount you owe them): ₹${pBalances.payableBalance.toFixed(2)}
- Net Position: ₹${pBalances.netBalance.toFixed(2)} (${pBalances.direction})
- Total Lent: ₹${pBalances.totalLent.toFixed(2)} | Total Received: ₹${pBalances.totalReceived.toFixed(2)}
- Total Borrowed: ₹${pBalances.totalBorrowed.toFixed(2)} | Total Repaid: ₹${pBalances.totalRepaid.toFixed(2)}
- Recent Postings:
${recentLines}
`;
      } catch (personErr) {
        console.warn('Could not load person-specific ledger context:', personErr);
      }
    }

    // 4. Least-Privilege Loan Scoping (Only fetch loan ledger balance when loan/emi is mentioned)
    const loanList: Array<{ id: string; name: string; type: string }> = (loans as any) || [];
    const matchedLoan = loanList.find((l) =>
      l.name && (lastUserMsg.includes(l.name.toLowerCase()) || lastUserMsg.includes('loan') || lastUserMsg.includes('emi'))
    );

    let loanSpecificContext = '';
    if (matchedLoan) {
      try {
        const loanBal = await getLoanAuthoritativeBalance(supabase as any, user.id, matchedLoan.id);
        loanSpecificContext = `
TARGET LOAN LEDGER CONTEXT (Authoritative Double-Entry from Ledger):
- Loan: ${loanBal.loanName} (Type: ${matchedLoan.type}, ID: ${matchedLoan.id})
- Outstanding Principal: ₹${loanBal.outstandingPrincipal.toFixed(2)}
- Total Disbursed: ₹${loanBal.originalDisbursed.toFixed(2)}
- Total Principal Repaid: ₹${loanBal.totalPrincipalPaid.toFixed(2)}
- Total Interest Paid: ₹${loanBal.totalInterestPaid.toFixed(2)}
`;
      } catch (loanErr) {
        console.warn('Could not load loan-specific ledger context:', loanErr);
      }
    }

    // 5. Least-Privilege Investment Scoping
    const holdingList: Array<{ id: string; symbol: string; name: string; quantity: number; average_buy_price: number }> = (holdings as any) || [];
    const matchedHolding = holdingList.find((h) =>
      (h.symbol && lastUserMsg.includes(h.symbol.toLowerCase())) ||
      (h.name && lastUserMsg.includes(h.name.toLowerCase()))
    );

    let holdingSpecificContext = '';
    if (matchedHolding) {
      holdingSpecificContext = `
TARGET INVESTMENT HOLDING CONTEXT:
- Asset: ${matchedHolding.symbol} (${matchedHolding.name})
- Quantity: ${matchedHolding.quantity} units
- Average Buy Price: ₹${matchedHolding.average_buy_price}
`;
    }

    // Compute Authoritative Total Cash, Investments, and Net Worth exclusively from Ledger
    let totalCash = new Decimal(0);
    let totalInvestments = new Decimal(0);
    const accRows: Array<{ id: string; name: string; type?: string; balance?: number; current_balance?: number }> = (accounts as any) || [];
    const accountsListFormatted: string[] = [];

    for (const acc of accRows) {
      const authBal = entityLedgerMap.has(acc.id)
        ? entityLedgerMap.get(acc.id)!
        : new Decimal(acc.current_balance ?? acc.balance ?? 0);

      if (acc.type === 'investment') {
        totalInvestments = totalInvestments.plus(authBal);
      } else {
        totalCash = totalCash.plus(authBal);
      }

      accountsListFormatted.push(`- ${acc.name} (Type: ${acc.type}, Balance: ₹${authBal.toFixed(2)}, ID: ${acc.id})`);
    }

    const netWorth = totalCash.plus(totalInvestments);
    const accountsList = accountsListFormatted.join('\n') || 'No active accounts found.';

    const peopleList = matchedPerson
      ? `- ${matchedPerson.name} (ID: ${matchedPerson.id}) [Target of inquiry]`
      : cpList.slice(0, 15).map((p) => `- ${p.name} (ID: ${p.id})`).join('\n') || 'No counterparties recorded yet.';

    const recentTxList = (recentTransactions || []).map((tx: any) => 
      `- ${tx.date?.substring(0, 10)}: ${tx.direction === 'in' ? '+' : '-'}₹${tx.amount} (${tx.type || 'transaction'}) "${tx.description || 'No description'}"`
    ).join('\n') || 'No recent transactions recorded.';

    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];

    const systemPrompt = `You are NisFlow, a strictly finance-only AI companion built into the NisFlow Finance app.

Your purpose is to help the user understand and manage their personal finances inside this app, including answering inquiries AND helping them record new financial entries (transactions, debts, loans, investments).

CURRENT USER LIVE FINANCIAL DATA (Real-time from double-entry ledger):
- Today's Date: ${todayDate}
- Current Month: ${now.toLocaleString('default', { month: 'long', year: 'numeric' })}
- Total Net Worth: ₹${netWorth.toFixed(2)}
- Available Liquid Cash: ₹${totalCash.toFixed(2)}
- Total Investments: ₹${totalInvestments.toFixed(2)}
${personSpecificContext}${loanSpecificContext}${holdingSpecificContext}
User Accounts:
${accountsList}

Known Counterparties / People:
${peopleList}

Recent Transactions:
${recentTxList}

RECORDING DATA & ACTIONS:
When the user states that they spent, received, borrowed, lent money, paid loan EMI, bought/sold investments, or want to reverse an entry (e.g., "Paid ₹350 for lunch from Kotak", "Borrowed ₹5,000 from Rahul", "Lent ₹2,000 to Amit", "Paid EMI ₹15,000 for Car Loan", "Got ₹3,000 repayment from Rohit"), you must:
1. Provide a short, friendly conversational message confirming what you prepared for review (1-2 sentences).
CRITICAL: Do NOT claim that you have already recorded, posted, or saved the transaction. Clearly state that you have prepared the transaction details for the user to review and confirm below (e.g., "I've prepared a ₹1,000.00 deposit from Papa into your Bob account. Please review and confirm below.").
2. At the end of your message, output a strict JSON action block enclosed in [ACTION] and [/ACTION] tags.

Action Block Schema:
[ACTION]
{
  "actionType": "expense" | "income" | "transfer" | "lending" | "borrowing" | "receivable_repayment" | "payable_repayment" | "loan_emi" | "investment_buy" | "investment_sell" | "investment_dividend" | "reversal",
  "actionId": "<stable action slug, e.g. act-1>",
  "amount": <number>,
  "description": "<string summary>",
  "accountName": "<matched or mentioned account name>",
  "accountId": "<matched account ID from list above if found>",
  "toAccountName": "<destination account name for transfer>",
  "toAccountId": "<destination account ID for transfer>",
  "personName": "<person name if mentioned>",
  "personId": "<matched person ID from list above if found>",
  "loanName": "<loan name if mentioned>",
  "loanId": "<matched loan ID if found>",
  "principalAmount": <number for EMI principal portion>,
  "interestAmount": <number for EMI interest portion>,
  "assetSymbol": "<stock/fund symbol if investment>",
  "date": "${todayDate}",
  "notes": "<optional additional context>"
}
[/ACTION]

Classification Guide:
- "expense": user spent money (e.g. "paid 500 for groceries", "swiped card for 1200")
- "income": user received money (e.g. "salary 50000 credited", "freelance income 10000")
- "transfer": user moved money between own accounts (e.g. "transferred 5000 from HDFC to Kotak")
- "lending": user gave loan / lent money to someone (e.g. "lent 2000 to Amit")
- "borrowing": user took loan / borrowed money from someone (e.g. "borrowed 5000 from Rahul")
- "receivable_repayment": someone repaid money to user (e.g. "Amit repaid 2000")
- "payable_repayment": user paid back debt to someone (e.g. "repaid 5000 to Rahul")
- "loan_emi": user paid EMI for bank loan (e.g. "paid 15000 car loan EMI")
- "investment_buy": user bought stock/mutual fund (e.g. "bought 10 shares of RELIANCE for 25000")
- "investment_sell": user sold stock/mutual fund (e.g. "sold 5 shares of TCS for 18000")
- "investment_dividend": dividend payout received (e.g. "received 500 dividend from INFY")
- "reversal": corrective reversal of an erroneous entry

STRICT SCOPE AND BEHAVIOR RULES:
1. You MUST REFUSE any question that is not related to personal finance or the user's NisFlow financial data. If the user asks about coding, creative writing, science, general trivia, entertainment, weather, or anything unrelated to personal finance, respond ONLY with:
"I'm a finance-only assistant. I can only help you with your accounts, transactions, budgets, and financial data inside NisFlow."
2. Always format currency amounts in Indian Rupees with the ₹ symbol (e.g. ₹12,500.00).
3. If the user is only asking a question (e.g. "What is my balance?", "How much did I spend?"), answer directly and DO NOT append [ACTION]. Only append [ACTION] when recording/logging new data.
4. Keep answers concise, professional, and directly actionable.`;

    const apiKey =
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      console.error('[NisFlow AI] Missing Gemini API Key in environment variables');
      return new Response(
        JSON.stringify({
          error: 'AI service is temporarily unconfigured. Please ensure GOOGLE_GENERATIVE_AI_API_KEY is configured in deployment environment.',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const googleProvider = createGoogle({ apiKey });

    const result = streamText({
      model: googleProvider('gemini-3.6-flash'),
      system: systemPrompt,
      messages: sanitizedMessages,
      maxRetries: 0,
      onError: ({ error }) => {
        console.error('[NisFlow AI Stream Error]:', error);
      },
    });

    const contextDuration = Math.round(performance.now() - tContextStart);

    return result.toTextStreamResponse({
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
        'Server-Timing': `context;dur=${contextDuration}`,
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
