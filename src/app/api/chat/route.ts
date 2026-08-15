import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages } = await req.json();

  const result = streamText({
    model: google('gemini-2.0-flash'),
    system: `You are NisFlow, a strictly finance-only AI assistant built into the NisFlow Finance app. 

Your ONLY purpose is to help the user with their personal finances inside this app. You can:
- Analyse their transactions, income, expenses, accounts, net worth, receivables, and payables
- Give budgeting tips and savings advice based on their actual data
- Summarise spending patterns and flag unusual activity
- Answer questions about their financial data fetched from the tools

You MUST REFUSE any question that is not related to the user's personal finance data or general personal finance concepts. If someone asks you anything off-topic (coding, general knowledge, creative writing, science, politics, entertainment, etc.), respond ONLY with:
"I'm a finance-only assistant. I can only help you with your accounts, transactions, budgets, and financial data inside NisFlow."

Rules:
- Always fetch data using tools before answering questions about the user's finances
- Format all currency in INR using the ₹ symbol
- Be concise and professional — no filler words, no emojis
- Never invent numbers — only use data returned by tools
- Never answer questions outside personal finance`,
    messages,
    tools: {
      getTransactions: tool({
        description: 'Fetch the user\'s transactions, optionally filtered by month and year.',
        parameters: z.object({
          month: z.number().optional().describe('Month (1-12)'),
          year: z.number().optional().describe('Year (e.g. 2026)'),
          limit: z.number().optional().describe('Max transactions to return (default 50)'),
        }),
        execute: async ({ month, year, limit = 50 }: { month?: number; year?: number; limit?: number }) => {
          let query = supabase
            .from('transactions')
            .select('id, date, amount, direction, description, categories!transactions_category_id_fkey(name)')
            .eq('user_id', user.id)
            .order('date', { ascending: false })
            .limit(limit);

          if (month && year) {
            const startDate = new Date(year, month - 1, 1).toISOString();
            const endDate = new Date(year, month, 0).toISOString();
            query = query.gte('date', startDate).lte('date', endDate);
          }

          const { data, error } = await query;
          if (error) return { error: error.message };
          return data as any[];
        },
      } as any),
      getNetWorth: tool({
        description: 'Fetch the user\'s current net worth, personal cash, and investments.',
        parameters: z.object({}),
        execute: async (_args: {}) => {
          const { data, error } = await supabase
            .from('net_worth_history')
            .select('total_net_worth, personal_cash, investments, date')
            .eq('user_id', user.id)
            .order('date', { ascending: false })
            .limit(1);
            
          if (error) return { error: error.message };
          return data?.[0] || { message: 'No net worth data available yet' };
        },
      } as any),
      getAccounts: tool({
        description: 'Fetch the user\'s accounts and their current balances.',
        parameters: z.object({}),
        execute: async (_args: {}) => {
          const { data, error } = await supabase
            .from('accounts')
            .select('name, type, balance')
            .eq('user_id', user.id)
            .eq('is_active', true);
            
          if (error) return { error: error.message };
          return data as any[];
        },
      } as any),
      getSpendingSummary: tool({
        description: "Get a summary of the user's income, expenses, and net spending for the current month.",
        parameters: z.object({}),
        execute: async (_args: {}) => {
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          const { data, error } = await supabase
            .from('transactions')
            .select('amount, direction, type')
            .eq('user_id', user.id)
            .gte('date', startOfMonth);

          if (error) return { error: error.message };

          let income = 0, expenses = 0;
          (data || []).forEach((tx: any) => {
            if (tx.direction === 'in') income += Number(tx.amount);
            else if (tx.direction === 'out') expenses += Number(tx.amount);
          });
          return { income, expenses, net: income - expenses, month: now.toLocaleString('default', { month: 'long', year: 'numeric' }) };
        },
      } as any),
    },
  });

  return result.toTextStreamResponse();
}
