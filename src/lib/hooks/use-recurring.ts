import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import { format, parseISO } from 'date-fns';
import { calculateNextDueDate } from '@/lib/finance/recurring';
import { recordFinancialTransaction } from '@/lib/ledger/service';

export { calculateNextDueDate };

export function useRecurringTransactions() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['recurring'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase.from('recurring_transactions') as any)
        .select('*, account:accounts(id,name), category:categories(id,name,icon)')
        .eq('is_active', true)
        .eq('user_id', user.id)
        .order('next_due_date', { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export function useCreateRecurring() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { user_id, ...safePayload } = payload;
      const { error } = await (supabase.from('recurring_transactions') as any).insert({ ...safePayload, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      toast.success('Recurring transaction added');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to add'),
  });
}

export function useUpdateRecurring() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { user_id, ...safePayload } = payload;
      const { error } = await (supabase.from('recurring_transactions') as any)
        .update(safePayload)
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      toast.success('Updated');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteRecurring() {
  const supabase = createClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await (supabase.from('recurring_transactions') as any)
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      toast.success('Deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useMarkRecurringDone() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (recurring: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const todayStr = new Date().toISOString().split('T')[0];
      const occurrenceRef = `REC:${recurring.id}:${recurring.next_due_date}`;

      // Post to authoritative double-entry ledger with deterministic idempotency
      const recType = (recurring.type || 'expense').toLowerCase() === 'transfer' ? 'transfer' : (recurring.direction === 'in' ? 'income' : 'expense');
      
      const ledgerResult = await recordFinancialTransaction(supabase as any, {
        userId: user.id,
        type: recType,
        accountId: recurring.account_id,
        categoryId: recurring.category_id,
        counterpartyId: recurring.counterparty_id,
        description: recurring.description || 'Recurring Transaction',
        amount: recurring.amount,
        date: recurring.next_due_date || todayStr,
        idempotencyKey: occurrenceRef,
        sourceType: 'recurring',
        sourceId: recurring.id,
        notes: recurring.notes ? `[Recurring] ${recurring.notes}` : '[Recurring scheduled transaction]',
        metadata: {
          ownership: recurring.ownership || 'personal',
          frequency: recurring.frequency,
        }
      });

      if (!ledgerResult.success) {
        throw new Error(ledgerResult.error || 'Failed to post recurring transaction to ledger');
      }

      // Update next_due_date
      const nextDue = calculateNextDueDate(parseISO(recurring.next_due_date), recurring.frequency);
      const isPastEnd = recurring.end_date && nextDue > parseISO(recurring.end_date);

      const { error: updateError } = await (supabase.from('recurring_transactions') as any)
        .update({
          next_due_date: format(nextDue, 'yyyy-MM-dd'),
          last_created_date: todayStr,
          is_active: isPastEnd ? false : recurring.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', recurring.id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Transaction recorded successfully');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to record transaction'),
  });
}

export function useProcessDueRecurring() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/recurring/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to process due recurring transactions');
      }
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success(data.message || 'Processed due transactions');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
