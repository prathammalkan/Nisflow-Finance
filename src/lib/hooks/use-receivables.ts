import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import Decimal from 'decimal.js';
import { recordFinancialTransaction } from '@/lib/ledger/service';

type Receivable = Database['public']['Tables']['receivables']['Row'] & { people: { name: string } | null };
type ReceivableInsert = Database['public']['Tables']['receivables']['Insert'];
type ReceivableUpdate = Database['public']['Tables']['receivables']['Update'];

export function useReceivables() {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['receivables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receivables')
        .select('*, people(name)')
        .order('due_date', { ascending: true });
        
      if (error) throw error;
      return (data as any[]) as Receivable[];
    }
  });
}

export function useCreateReceivable() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (receivable: ReceivableInsert & { account_id?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      let targetAccountId = receivable.account_id;
      if (!targetAccountId) {
        const { data: accounts } = await supabase.from('accounts').select('id').eq('is_active', true).limit(1);
        if (accounts && accounts.length > 0) targetAccountId = (accounts[0] as any).id;
      }

      const counterpartyId = (receivable as any).person_id || receivable.counterparty_id;
      const amountDec = new Decimal(receivable.amount || 0);

      let journalEntryId: string | undefined;
      if (targetAccountId && amountDec.gt(0) && counterpartyId) {
        const ledgerRes = await recordFinancialTransaction(supabase as any, {
          userId: userData.user.id,
          type: 'lending',
          accountId: targetAccountId,
          counterpartyId,
          amount: amountDec.toFixed(2),
          date: receivable.due_date ? receivable.due_date.split('T')[0] : new Date().toISOString().split('T')[0],
          description: receivable.notes || 'Money Lent (Receivable)',
          idempotencyKey: `REC:LEND:${userData.user.id}:${Date.now()}:${Math.random().toString(36).substring(2, 7)}`,
          sourceType: 'receivable',
        });

        if (!ledgerRes.success) {
          throw new Error(ledgerRes.error || 'Failed to post lending transaction to ledger');
        }
        journalEntryId = ledgerRes.journalEntryId;
      }

      const payload = {
        ...receivable,
        user_id: userData.user.id,
        notes: journalEntryId ? `${receivable.notes || ''} [Ledger: ${journalEntryId}]`.trim() : receivable.notes,
      };

      const { data, error } = await supabase
        .from('receivables')
        .insert(payload as any)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    }
  });
}

export function useUpdateReceivable() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...update }: { id: string } & ReceivableUpdate & { account_id?: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data: existing, error: fetchErr } = await supabase
        .from('receivables')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      // Check if repayment amount is recorded
      const prevReceived = new Decimal((existing as any)?.received_amount || 0);
      const newReceived = (update as any).received_amount !== undefined ? new Decimal((update as any).received_amount as any) : prevReceived;
      const repaymentDelta = newReceived.minus(prevReceived);

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
            description: `Repayment received for receivable ${id}`,
            idempotencyKey: `REC:REPAY:${id}:${Date.now()}`,
            sourceType: 'receivable_repayment',
            sourceId: id,
            metadata: { direction: 'in' },
          });

          if (!ledgerRes.success) {
            throw new Error(ledgerRes.error || 'Failed to post repayment to ledger');
          }
        }
      }

      const { data, error } = await supabase
        .from('receivables')
        .update(update as never)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    }
  });
}

export function useReceivablesSummary() {
  const { data: receivables } = useReceivables();
  
  if (!receivables) return { totalOutstanding: new Decimal(0), overdueCount: 0 };
  
  const totalOutstanding = receivables.reduce((sum, r) => {
    if (r.status !== 'SETTLED') {
      const amount = new Decimal(r.amount);
      const received = new Decimal((r as any).received_amount || 0);
      return sum.plus(amount.minus(received));
    }
    return sum;
  }, new Decimal(0));
  
  const overdueCount = receivables.filter(r => {
    return r.status !== 'SETTLED' && r.due_date && new Date(r.due_date) < new Date();
  }).length;
  
  return {
    totalOutstanding,
    overdueCount
  };
}
