import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { calculateNextDueDate } from '@/lib/finance/recurring';
import { recordFinancialTransaction } from '@/lib/ledger/service';

export { calculateNextDueDate };

/**
 * Fetch all ACTIVE recurring transactions for the authenticated user.
 *
 * DB columns used: status (text, 'active'|'inactive'), next_date (timestamptz)
 * category FK → categories (not transaction_categories)
 */
export function useRecurringTransactions() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['recurring'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await (supabase.from('recurring_transactions') as any)
        .select('*, account:accounts(id,name), category:categories(id,name,icon)')
        .eq('status', 'active')
        .eq('user_id', user.id)
        .order('next_date', { ascending: true });
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
      const { error } = await (supabase.from('recurring_transactions') as any)
        .insert({ ...safePayload, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      qc.invalidateQueries({ queryKey: ['upcoming'] });
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
      qc.invalidateQueries({ queryKey: ['upcoming'] });
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
      qc.invalidateQueries({ queryKey: ['upcoming'] });
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
      // Use next_date (actual DB column) for idempotency key
      const occurrenceRef = `REC:${recurring.id}:${recurring.next_date}`;

      // Determine transaction type from direction field
      const recType = (() => {
        const t = (recurring.type || '').toLowerCase();
        if (t === 'transfer') return 'transfer';
        if (recurring.direction === 'in') return 'income';
        return 'expense';
      })();

      const ledgerResult = await recordFinancialTransaction(supabase as any, {
        userId: user.id,
        type: recType,
        accountId: recurring.account_id,
        categoryId: recurring.category_id,
        description: recurring.description || 'Recurring Transaction',
        amount: recurring.amount,
        date: recurring.next_date
          ? recurring.next_date.split('T')[0]
          : todayStr,
        idempotencyKey: occurrenceRef,
        sourceType: 'recurring',
        sourceId: recurring.id,
        notes: '[Recurring scheduled transaction]',
        metadata: {
          frequency: recurring.frequency,
        }
      });

      if (!ledgerResult.success) {
        throw new Error(ledgerResult.error || 'Failed to post recurring transaction to ledger');
      }

      // Advance next_date by one frequency period
      const nextDue = calculateNextDueDate(
        parseISO(recurring.next_date),
        recurring.frequency
      );

      const { error: updateError } = await (supabase.from('recurring_transactions') as any)
        .update({
          next_date: format(nextDue, "yyyy-MM-dd'T'HH:mm:ssxxx"),
        })
        .eq('id', recurring.id)
        .eq('user_id', user.id);

      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] });
      qc.invalidateQueries({ queryKey: ['upcoming'] });
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
      qc.invalidateQueries({ queryKey: ['upcoming'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success(data.message || 'Processed due transactions');
    },
    onError: (e: any) => toast.error(e.message),
  });
}
