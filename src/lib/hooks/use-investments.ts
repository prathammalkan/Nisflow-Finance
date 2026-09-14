import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Decimal from 'decimal.js';
import { recordFinancialTransaction } from '@/lib/ledger/service';

export function useInvestments() {
  return useQuery({
    queryKey: ['investments'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await (supabase.from('investments') as any)
        .select('*, investment_transactions(*)')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useInvestment(id: string) {
  return useQuery({
    queryKey: ['investments', id],
    queryFn: async () => {
      const supabase = createClient();
      // MED-02: Authenticate and scope by user_id for defense-in-depth
      const { data: userData, error: authErr } = await supabase.auth.getUser();
      if (authErr || !userData.user) throw new Error('Not authenticated');

      const { data, error } = await (supabase.from('investments') as any)
        .select('*, investment_transactions(*)')
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateInvestment() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (payload: {
      name: string;
      ticker?: string;
      type: string;
      platform?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      // investments table actual columns: id, user_id, name, ticker_symbol, asset_class, platform, created_at
      const { data, error } = await (supabase.from('investments') as any)
        .insert({
          user_id: userData.user.id,
          name: payload.name,
          ticker_symbol: payload.ticker || null,
          asset_class: payload.type || null,
          platform: payload.platform || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

export interface CreateInvestmentTxParams {
  investment_id: string;
  type: 'buy' | 'sell' | 'dividend' | 'split' | 'bonus';
  date: string;
  amount: number;
  quantity?: number;
  price?: number;
  fees?: number;
  taxes?: number;
  account_id?: string;
  notes?: string;
}

export function useCreateInvestmentTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transaction: CreateInvestmentTxParams) => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      // 1. If cashflow account is provided, post to double-entry ledger first
      const txAmountDec = new Decimal(transaction.amount || 0);
      let journalEntryId: string | undefined;
      const txId = (transaction as any).id || crypto.randomUUID();

      if (transaction.account_id && txAmountDec.gt(0)) {
        let ledgerType: 'investment_purchase' | 'investment_sale' | 'dividend' | null = null;
        if (transaction.type === 'buy') ledgerType = 'investment_purchase';
        else if (transaction.type === 'sell') ledgerType = 'investment_sale';
        else if (transaction.type === 'dividend') ledgerType = 'dividend';

        if (ledgerType) {
          const idempotencyKey = (transaction as any).idempotency_key || `INV:${transaction.type.toUpperCase()}:${transaction.investment_id}:${txId}`;
          const ledgerRes = await recordFinancialTransaction(supabase as any, {
            userId: userData.user.id,
            type: ledgerType,
            accountId: transaction.account_id,
            amount: txAmountDec.toFixed(2),
            date: transaction.date || new Date().toISOString().split('T')[0],
            description: `Investment ${transaction.type}: ${transaction.notes || ''}`.trim(),
            idempotencyKey,
            sourceType: 'investment',
            sourceId: transaction.investment_id,
            metadata: {
              investmentId: transaction.investment_id,
              costBasis: (transaction as any).cost_basis || (transaction as any).carrying_value,
              quantity: transaction.quantity,
              price: transaction.price,
              fees: transaction.fees,
              taxes: transaction.taxes,
            },
          });

          if (!ledgerRes.success) {
            throw new Error(ledgerRes.error || 'Failed to post investment transaction to ledger');
          }
          journalEntryId = ledgerRes.journalEntryId;
        }
      }

      // 2. Insert transaction into investment_transactions
      // Actual columns: id, investment_id, type, amount, quantity, price, transaction_date, created_at
      const txPayload = {
        id: txId,
        investment_id: transaction.investment_id,
        type: transaction.type,
        transaction_date: transaction.date || new Date().toISOString().split('T')[0],
        amount: txAmountDec.toNumber(),
        quantity: transaction.quantity ? new Decimal(transaction.quantity).toNumber() : null,
        price: transaction.price ? new Decimal(transaction.price).toNumber() : null,
      };

      const { data: insertedTx, error: txError } = await (supabase.from('investment_transactions') as any)
        .insert(txPayload)
        .select()
        .single();

      if (txError) throw txError;

      return insertedTx;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      queryClient.invalidateQueries({ queryKey: ['investments', variables.investment_id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['report-investment'] });
      queryClient.invalidateQueries({ queryKey: ['net-worth-history'] });
    },
  });
}
