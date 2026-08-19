import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { recordFinancialTransaction, reverseFinancialTransaction } from '@/lib/ledger/service';

export type TransactionFilters = {
  account_id?: string;
  category_id?: string;
  transaction_type?: string[];
  date_from?: string;
  date_to?: string;
  search?: string;
  ownership?: string;
  status?: string[];
  counterparty_id?: string;
  min_amount?: number;
  max_amount?: number;
  tags?: string[];
  reconciliation_status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export function useTransactions(filters: TransactionFilters = {}) {
  const supabase = createClient();
  const {
    page = 1,
    pageSize = 50,
    sortBy = 'date',
    sortOrder = 'desc',
    ...restFilters
  } = filters;

  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      let query = supabase
        .from('transactions')
        .select(`
          *,
          account:accounts(id, name, type),
          category:categories(id, name, icon)
        `, { count: 'exact' });

      // Apply filters
      if (restFilters.account_id) query = query.eq('account_id', restFilters.account_id);
      if (restFilters.category_id) query = query.eq('category_id', restFilters.category_id);
      if (restFilters.transaction_type?.length) query = query.in('type', restFilters.transaction_type);
      if (restFilters.status?.length) query = query.in('status', restFilters.status);
      if (restFilters.date_from) query = query.gte('date', restFilters.date_from);
      if (restFilters.date_to) query = query.lte('date', restFilters.date_to);
      if (restFilters.ownership) query = query.eq('ownership', restFilters.ownership);
      if (restFilters.counterparty_id) query = query.eq('counterparty_id', restFilters.counterparty_id);
      if (restFilters.min_amount) query = query.gte('amount', restFilters.min_amount);
      if (restFilters.max_amount) query = query.lte('amount', restFilters.max_amount);
      if (restFilters.reconciliation_status) query = query.eq('reconciliation_status', restFilters.reconciliation_status);
      if (restFilters.search) {
        query = query.or(`description.ilike.%${restFilters.search}%,notes.ilike.%${restFilters.search}%`);
      }

      // Pagination & Sorting
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      query = query.order(sortBy, { ascending: sortOrder === 'asc' });
      query = query.range(from, to);

      const { data, error, count } = await query;
      
      if (error) throw error;
      
      return { 
        data, 
        total: count || 0,
        page,
        pageSize
      };
    },
  });
}

export function useTransaction(id: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['transactions', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          account:accounts(*),
          category:categories(*)
        `)
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (newTransaction: any) => {
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error('User is not authenticated');

      const rawType = (newTransaction.type || newTransaction.transaction_type || 'expense').toLowerCase();
      const txType = rawType === 'transfer' ? 'transfer' : (newTransaction.direction === 'in' || rawType === 'income' ? 'income' : 'expense');

      const txId = (newTransaction as any).id || (newTransaction as any).client_id || crypto.randomUUID();
      const idempotencyKey = newTransaction.bank_reference || (newTransaction as any).idempotency_key || `TXN:${txId}`;

      const res = await recordFinancialTransaction(supabase as any, {
        userId: user.id,
        type: txType,
        accountId: newTransaction.account_id,
        toAccountId: newTransaction.to_account_id,
        categoryId: newTransaction.category_id,
        counterpartyId: newTransaction.counterparty_id,
        amount: newTransaction.amount,
        date: newTransaction.date,
        description: newTransaction.description || 'Transaction',
        notes: newTransaction.notes,
        idempotencyKey,
        sourceType: 'manual',
        metadata: {
          ownership: newTransaction.ownership || 'personal',
          tags: newTransaction.tags,
        }
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to post transaction to authoritative ledger');
      }

      return {
        id: res.transactionId || res.journalEntryId,
        journal_entry_id: res.journalEntryId,
        ...newTransaction,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] }); // Balance updates
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      toast.success('Transaction posted to ledger successfully');
    },
    onError: (error) => {
      toast.error('Failed to post transaction: ' + error.message);
    }
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      // Disallow direct mutation of core financial fields; financial corrections must be reversed/re-entered
      const {
        amount,
        account_id,
        user_id,
        date,
        direction,
        type,
        transaction_type,
        category_id,
        subcategory_id,
        status,
        bank_reference,
        upi_reference,
        linked_transaction_id,
        counterparty_id,
        related_person_id,
        related_ipo_id,
        related_investment_id,
        ...safeUpdates
      } = updates;

      const { data, error } = await supabase
        .from('transactions')
        // @ts-ignore
        .update(safeUpdates as any)
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Transaction updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update transaction: ' + error.message);
    }
  });
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      // Fetch transaction to inspect linked ledger entry
      const { data: tx, error: fetchErr } = await (supabase.from('transactions') as any)
        .select('*')
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      // Extract linked journal entry ID if present in notes
      const journalMatch = tx?.notes?.match(/\[Ledger:\s*([0-9a-fA-F-]+)\]/);
      const journalEntryId = journalMatch ? journalMatch[1] : null;

      if (journalEntryId) {
        const revResult = await reverseFinancialTransaction(supabase as any, {
          userId: userData.user.id,
          journalEntryId,
          reason: 'Transaction deleted by user',
          idempotencyKey: `REV:DEL:${id}`,
        });

        if (!revResult.success) {
          console.warn('Reversal warning during transaction deletion:', revResult.error);
        }
      }

      const { error } = await supabase
        .from('transactions')
        // @ts-ignore
        .update({ is_deleted: true, status: 'cancelled' } as any) // Soft delete & cancel
        .eq('id', id);
      
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      toast.success('Transaction deleted and reversed');
    },
    onError: (error) => {
      toast.error('Failed to delete transaction: ' + error.message);
    }
  });
}

export function useTransactionStats(month?: number, year?: number) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['transaction_stats', month, year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_transaction_stats', { 
        p_month: month, 
        p_year: year 
      } as any);
      
      if (error) throw error;
      return data;
    },
  });
}

export function useLinkTransactions() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ fromId, toId }: { fromId: string; toId: string }) => {
      // Begin a simple update for both
      const { error: err1 } = await supabase
        .from('transactions')
        // @ts-ignore
        .update({ linked_transaction_id: toId } as any)
        .eq('id', fromId);
      if (err1) throw err1;

      const { error: err2 } = await supabase
        .from('transactions')
        // @ts-ignore
        .update({ linked_transaction_id: fromId } as any)
        .eq('id', toId);
      if (err2) throw err2;

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Transactions linked successfully');
    },
    onError: (error) => {
      toast.error('Failed to link transactions: ' + error.message);
    }
  });
}
