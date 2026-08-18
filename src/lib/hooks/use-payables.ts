import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import Decimal from 'decimal.js';

import { recordFinancialTransaction } from '@/lib/ledger/service';

type Payable = Database['public']['Tables']['payables']['Row'] & { people: { name: string } | null };
type PayableInsert = Database['public']['Tables']['payables']['Insert'];
type PayableUpdate = Database['public']['Tables']['payables']['Update'];

export function usePayables() {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['payables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payables')
        .select('*, people(name)')
        .order('due_date', { ascending: true });
        
      if (error) throw error;
      return (data as any[]) as Payable[];
    }
  });
}

export function useCreatePayable() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (payable: PayableInsert & { account_id?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      let targetAccountId = payable.account_id;
      if (!targetAccountId) {
        const { data: accounts } = await supabase.from('accounts').select('id').eq('is_active', true).limit(1);
        if (accounts && accounts.length > 0) targetAccountId = (accounts[0] as any).id;
      }

      const counterpartyId = (payable as any).person_id || payable.counterparty_id;
      const amountDec = new Decimal(payable.amount || 0);

      let journalEntryId: string | undefined;
      if (targetAccountId && amountDec.gt(0) && counterpartyId) {
        const ledgerRes = await recordFinancialTransaction(supabase as any, {
          userId: userData.user.id,
          type: 'borrowing',
          accountId: targetAccountId,
          counterpartyId,
          amount: amountDec.toFixed(2),
          date: payable.due_date ? payable.due_date.split('T')[0] : new Date().toISOString().split('T')[0],
          description: payable.notes || 'Money Borrowed (Payable)',
          idempotencyKey: `PAY:BORROW:${userData.user.id}:${Date.now()}:${Math.random().toString(36).substring(2, 7)}`,
          sourceType: 'payable',
        });

        if (!ledgerRes.success) {
          throw new Error(ledgerRes.error || 'Failed to post borrowing transaction to ledger');
        }
        journalEntryId = ledgerRes.journalEntryId;
      }

      const payload = {
        ...payable,
        user_id: userData.user.id,
        notes: journalEntryId ? `${payable.notes || ''} [Ledger: ${journalEntryId}]`.trim() : payable.notes,
      };

      const { data, error } = await supabase
        .from('payables')
        .insert(payload as any)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    }
  });
}

export function useUpdatePayable() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...update }: { id: string } & PayableUpdate & { account_id?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data: existing, error: fetchErr } = await supabase
        .from('payables')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      // Check if debt repayment amount is recorded
      const prevPaid = new Decimal((existing as any)?.paid_amount || 0);
      const newPaid = (update as any).paid_amount !== undefined ? new Decimal((update as any).paid_amount as any) : prevPaid;
      const repaymentDelta = newPaid.minus(prevPaid);

      if (repaymentDelta.gt(0)) {
        let targetAccountId = update.account_id;
        if (!targetAccountId) {
          const { data: accounts } = await supabase.from('accounts').select('id').eq('is_active', true).limit(1);
          if (accounts && accounts.length > 0) targetAccountId = (accounts[0] as any).id;
        }

        if (targetAccountId && (existing as any).counterparty_id) {
          const ledgerRes = await recordFinancialTransaction(supabase as any, {
            userId: userData.user.id,
            type: 'repayment',
            accountId: targetAccountId,
            counterpartyId: (existing as any).counterparty_id,
            amount: repaymentDelta.toFixed(2),
            date: new Date().toISOString().split('T')[0],
            description: `Repayment made for debt ${id}`,
            idempotencyKey: `PAY:REPAY:${id}:${Date.now()}`,
            sourceType: 'payable_repayment',
            sourceId: id,
            metadata: { direction: 'out', isDebtRepayment: true },
          });

          if (!ledgerRes.success) {
            throw new Error(ledgerRes.error || 'Failed to post debt repayment to ledger');
          }
        }
      }

      const { data, error } = await supabase
        .from('payables')
        .update(update as never)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    }
  });
}

export function usePayablesSummary() {
  const { data: payables } = usePayables();
  
  if (!payables) return { totalOutstanding: new Decimal(0), overdueCount: 0 };
  
  const totalOutstanding = payables.reduce((sum, r) => {
    if (r.status !== 'SETTLED') {
      const amount = new Decimal(r.amount);
      const paid = new Decimal((r as any).paid_amount || 0);
      return sum.plus(amount.minus(paid));
    }
    return sum;
  }, new Decimal(0));
  
  const overdueCount = payables.filter(r => {
    return r.status !== 'SETTLED' && r.due_date && new Date(r.due_date) < new Date();
  }).length;
  
  return {
    totalOutstanding,
    overdueCount
  };
}
