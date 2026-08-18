import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import { format, parseISO } from 'date-fns';
import { calculateNextDueDate } from '@/lib/finance/recurring';

export { calculateNextDueDate };

export function useRecurringTransactions() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['recurring'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('recurring_transactions') as any)
        .select('*, account:accounts(id,name), category:categories(id,name,icon)')
        .eq('is_active', true)
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
      const { error } = await (supabase.from('recurring_transactions') as any).insert({ ...payload, user_id: user.id });
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
      const { error } = await (supabase.from('recurring_transactions') as any).update(payload).eq('id', id);
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
      const { error } = await (supabase.from('recurring_transactions') as any).delete().eq('id', id);
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

      // Idempotency: verify no duplicate transaction exists for this occurrence
      const { data: existingTx } = await (supabase.from('transactions') as any)
        .select('id')
        .eq('user_id', user.id)
        .eq('bank_reference', occurrenceRef)
        .limit(1);

      if (!existingTx || existingTx.length === 0) {
        const amount = new Decimal(recurring.amount || 0).toNumber();

        // Insert actual transaction
        const { error: txError } = await (supabase.from('transactions') as any).insert({
          user_id: user.id,
          account_id: recurring.account_id,
          category_id: recurring.category_id,
          counterparty_id: recurring.counterparty_id,
          description: recurring.description,
          amount,
          transaction_type: recurring.type,
          direction: recurring.direction,
          ownership: recurring.ownership || 'personal',
          status: 'confirmed',
          date: recurring.next_due_date || todayStr,
          bank_reference: occurrenceRef,
          notes: recurring.notes ? `[Recurring] ${recurring.notes}` : '[Recurring scheduled transaction]',
        });

        if (txError) throw txError;
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
        .eq('id', recurring.id);

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
