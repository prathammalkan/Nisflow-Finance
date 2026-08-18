import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Decimal from 'decimal.js';

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
      const { data, error } = await (supabase.from('investments') as any)
        .select('*, investment_transactions(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
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

      // 1. Insert transaction into investment_transactions
      const txPayload = {
        user_id: userData.user.id,
        investment_id: transaction.investment_id,
        type: transaction.type,
        date: transaction.date,
        amount: new Decimal(transaction.amount || 0).toNumber(),
        quantity: transaction.quantity ? new Decimal(transaction.quantity).toNumber() : null,
        price: transaction.price ? new Decimal(transaction.price).toNumber() : null,
        fees: new Decimal(transaction.fees || 0).toNumber(),
        taxes: new Decimal(transaction.taxes || 0).toNumber(),
        account_id: transaction.account_id || null,
        notes: transaction.notes || null,
      };

      const { data: insertedTx, error: txError } = await (supabase.from('investment_transactions') as any)
        .insert(txPayload)
        .select()
        .single();

      if (txError) throw txError;

      // 2. Fetch current holding to update invested amount & units
      const { data: inv, error: invError } = await (supabase.from('investments') as any)
        .select('*')
        .eq('id', transaction.investment_id)
        .single();

      if (!invError && inv) {
        const currentInvested = new Decimal(inv.total_invested || inv.invested_amount || 0);
        const currentQty = new Decimal(inv.quantity || inv.units || 0);
        const txAmount = new Decimal(transaction.amount || 0);
        const txQty = new Decimal(transaction.quantity || 0);

        let newInvested = currentInvested;
        let newQty = currentQty;

        if (transaction.type === 'buy') {
          newInvested = currentInvested.plus(txAmount);
          if (transaction.quantity) {
            newQty = currentQty.plus(txQty);
          }
        } else if (transaction.type === 'sell') {
          if (transaction.quantity && currentQty.gt(0)) {
            newQty = Decimal.max(0, currentQty.minus(txQty));
            newInvested = currentQty.gt(0) ? currentInvested.times(newQty).dividedBy(currentQty) : currentInvested;
          } else {
            newInvested = Decimal.max(0, currentInvested.minus(txAmount));
          }
        } else if (transaction.type === 'split' || transaction.type === 'bonus') {
          if (transaction.quantity) {
            newQty = currentQty.plus(txQty);
          }
        }

        // NOTE: Manual valuation is preserved. Do NOT overwrite current_value.
        await (supabase.from('investments') as any)
          .update({
            total_invested: newInvested.toNumber(),
            invested_amount: newInvested.toNumber(),
            quantity: newQty.toNumber(),
            units: newQty.toNumber(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', transaction.investment_id);
      }

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
