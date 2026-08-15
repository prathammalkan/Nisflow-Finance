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
    system: 'You are NisFlow Finance, an expert and highly professional AI financial companion. You help the user understand their finances, find transactions, explain spending, and offer savings advice. Always be concise. Format currency in INR (₹). Use the tools available to fetch data before answering questions about their finances.',
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
    },
  });

  return result.toTextStreamResponse();
}
