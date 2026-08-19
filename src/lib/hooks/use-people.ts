import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import {
  ensureCounterpartyLedgerAccounts,
  getCounterpartyAuthoritativeBalance,
  getPeopleAuthoritativeSummary,
  getPersonLedgerHistory,
  recordLending,
  recordBorrowing,
  recordRepayment,
  type CounterpartyBalances,
  type PeopleAuthoritativeSummary,
  type PersonLedgerHistoryItem,
  type RecordLendingInput,
  type RecordBorrowingInput,
  type RecordRepaymentInput,
} from '@/lib/ledger/people';

type Person = Database['public']['Tables']['counterparties']['Row'];
type PersonInsert = Database['public']['Tables']['counterparties']['Insert'];
type PersonUpdate = Database['public']['Tables']['counterparties']['Update'];

export function usePeople() {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('counterparties')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('name');
        
      if (error) throw error;
      return (data as any[]) || [];
    }
  });
}

export function usePerson(id: string) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['people', id],
    queryFn: async () => {
      if (!id) return null;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('counterparties')
        .select('*')
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .single();
        
      if (error) throw error;
      return (data as any) || null;
    },
    enabled: !!id
  });
}

/**
 * Hook to retrieve authoritative ledger balance and chronological history for a counterparty.
 */
export function usePersonLedger(personId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['people_ledger', personId],
    queryFn: async (): Promise<{ balances: CounterpartyBalances; history: PersonLedgerHistoryItem[] } | null> => {
      if (!personId) return null;
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const [balances, history] = await Promise.all([
        getCounterpartyAuthoritativeBalance(supabase as any, userData.user.id, personId),
        getPersonLedgerHistory(supabase as any, userData.user.id, personId),
      ]);

      return { balances, history };
    },
    enabled: !!personId,
  });
}

/**
 * Hook to retrieve authoritative ledger summary across all counterparties.
 */
export function usePeopleLedgerSummary() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['people_ledger_summary'],
    queryFn: async (): Promise<PeopleAuthoritativeSummary> => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      return getPeopleAuthoritativeSummary(supabase as any, userData.user.id);
    },
  });
}

export function useCreatePerson() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (person: PersonInsert) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('counterparties')
        .insert({
          ...person,
          user_id: userData.user.id,
        } as any)
        .select()
        .single();
        
      if (error) throw error;

      // Automatically provision receivable & payable ledger accounts
      await ensureCounterpartyLedgerAccounts(supabase as any, userData.user.id, (data as any).id);

      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger_summary'] });
    }
  });
}

export function useUpdatePerson() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...update }: { id: string } & PersonUpdate) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { user_id, ...safeUpdate } = update as any;

      const { data, error } = await supabase
        .from('counterparties')
        .update(safeUpdate as never)
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger_summary'] });
    }
  });
}

export function useDeletePerson() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('counterparties')
        .delete()
        .eq('id', id)
        .eq('user_id', userData.user.id);
        
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger_summary'] });
    }
  });
}

/**
 * Authoritative Lending mutation hook
 */
export function useLendMoney() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<RecordLendingInput, 'userId'>) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const res = await recordLending(supabase as any, {
        ...input,
        userId: userData.user.id,
      });

      if (!res.success) {
        throw new Error(res.error);
      }
      return res;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger', variables.counterpartyId] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger_summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    },
  });
}

/**
 * Authoritative Borrowing mutation hook
 */
export function useBorrowMoney() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<RecordBorrowingInput, 'userId'>) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const res = await recordBorrowing(supabase as any, {
        ...input,
        userId: userData.user.id,
      });

      if (!res.success) {
        throw new Error(res.error);
      }
      return res;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger', variables.counterpartyId] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger_summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    },
  });
}

/**
 * Authoritative Repayment mutation hook (enforces overpayment guards)
 */
export function useRecordRepayment() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<RecordRepaymentInput, 'userId'>) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const res = await recordRepayment(supabase as any, {
        ...input,
        userId: userData.user.id,
      });

      if (!res.success) {
        throw new Error(res.error);
      }
      return res;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger', variables.counterpartyId] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger_summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    },
  });
}
