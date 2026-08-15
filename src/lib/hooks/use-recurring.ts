import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Decimal from 'decimal.js';
import { format, addDays, addWeeks, addMonths, addYears } from 'date-fns';

export function calculateNextDueDate(current: Date, frequency: string): Date {
  switch (frequency) {
    case 'daily': return addDays(current, 1);
    case 'weekly': return addWeeks(current, 1);
    case 'monthly': return addMonths(current, 1);
    case 'quarterly': return addMonths(current, 3);
    case 'yearly': return addYears(current, 1);
    default: return addMonths(current, 1);
  }
}

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast.success('Recurring transaction added'); },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast.success('Updated'); },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast.success('Deleted'); },
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
      const today = new Date();
      const amount = new Decimal(recurring.amount);
      // Insert actual transaction
      const { error: txError } = await (supabase.from('transactions') as any).insert({
        user_id: user.id,
        account_id: recurring.account_id,
        category_id: recurring.category_id,
        counterparty_id: recurring.counterparty_id,
        description: recurring.description,
        amount: amount.toNumber(),
        type: recurring.type,
        direction: recurring.direction,
        ownership: recurring.ownership,
        status: 'confirmed',
        date: format(today, 'yyyy-MM-dd'),
        notes: recurring.notes ? `[Recurring] ${recurring.notes}` : '[Recurring]',
      });
      if (txError) throw txError;
      // Update next_due_date
      const nextDue = calculateNextDueDate(new Date(recurring.next_due_date), recurring.frequency);
      const { error: updateError } = await (supabase.from('recurring_transactions') as any)
        .update({ next_due_date: format(nextDue, 'yyyy-MM-dd'), last_created_date: format(today, 'yyyy-MM-dd') })
        .eq('id', recurring.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Transaction recorded');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
