import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Decimal from 'decimal.js';
import { recordBorrowing, recordRepayment, getPeopleAuthoritativeSummary } from '@/lib/ledger/people';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface AuthoritativePayable {
  id: string;
  user_id: string;
  counterparty_id?: string;
  person_id?: string;
  counterparties?: { name: string; phone?: string } | null;
  people?: { name: string; phone?: string } | null;
  original_amount: number;
  amount: number;
  remaining_amount: number;
  authoritativeRemaining: number;
  due_date?: string;
  reason?: string;
  status: string;
  notes?: string;
  created_at: string;
}

export function usePayables() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['payables'],
    queryFn: async () => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      const userId = userData.user.id;

      // 1. Fetch metadata records
      const { data: payData, error: payError } = await (supabase.from('payables') as any)
        .select('*, counterparties:counterparty_id(name, phone), people:counterparty_id(name, phone)')
        .eq('user_id', userId)
        .order('due_date', { ascending: true });

      if (payError) throw payError;

      // 2. Fetch People Ledger Summary to get authoritative per-person balances
      const peopleSummary = await getPeopleAuthoritativeSummary(supabase as any, userId);
      const cpBalances = peopleSummary.balances || {};

      // 3. Enrich payables with authoritative balance
      const list: AuthoritativePayable[] = (payData || []).map((item: any) => {
        const cpId = item.counterparty_id || item.person_id;
        const authRemaining = cpId && cpBalances[cpId]
          ? cpBalances[cpId].payableBalance
          : 0;

        const isOverdue = item.due_date && new Date(item.due_date) < new Date() && authRemaining > 0;
        const derivedStatus = authRemaining <= 0 ? 'settled' : isOverdue ? 'overdue' : (item.status || 'pending');

        return {
          ...item,
          original_amount: Number(item.original_amount || item.amount || 0),
          amount: Number(item.original_amount || item.amount || 0),
          remaining_amount: authRemaining,
          authoritativeRemaining: authRemaining,
          status: derivedStatus,
        };
      });

      return list;
    },
  });
}

export function usePayablesSummary() {
  const supabase = createClient();
  const { data: payables } = usePayables();

  const query = useQuery({
    queryKey: ['payables-summary'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return null;

      const summary = await getPeopleAuthoritativeSummary(supabase as any, userData.user.id);
      return summary;
    },
  });

  const totalOutstanding = new Decimal(query.data?.totalPayable || 0);
  const overdueCount = (payables || []).filter(
    (r) => r.status !== 'settled' && r.due_date && new Date(r.due_date) < new Date()
  ).length;

  return {
    totalOutstanding,
    overdueCount,
    isLoading: query.isLoading,
  };
}

export function useCreatePayable() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payable: {
      id?: string;
      account_id?: string;
      counterparty_id?: string;
      person_id?: string;
      amount: number | string;
      due_date?: string;
      notes?: string;
      reason?: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      let targetAccountId = payable.account_id;
      if (!targetAccountId) {
        const { data: accounts } = await (supabase.from('accounts') as any)
          .select('id')
          .eq('is_active', true)
          .limit(1);
        if (accounts && accounts.length > 0) targetAccountId = accounts[0].id;
      }

      const counterpartyId = payable.counterparty_id || payable.person_id;
      const amountDec = new Decimal(payable.amount || 0);

      if (!targetAccountId) {
        throw new Error('An active destination account is required to borrow money.');
      }
      if (!counterpartyId) {
        throw new Error('A counterparty is required to record a payable.');
      }

      const payId = payable.id || crypto.randomUUID();

      const ledgerRes = await recordBorrowing(supabase as any, {
        userId: userData.user.id,
        accountId: targetAccountId,
        counterpartyId,
        amount: amountDec.toFixed(2),
        date: payable.due_date ? payable.due_date.split('T')[0] : new Date().toISOString().split('T')[0],
        description: payable.reason || payable.notes || 'Money Borrowed (Payable)',
        notes: payable.notes,
        payableId: payId,
      });

      if (!ledgerRes.success) {
        throw new Error(ledgerRes.error);
      }

      return { id: payId, journalEntryId: ledgerRes.journalEntryId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['payables-summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger_summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}

export function useUpdatePayable() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...update
    }: {
      id: string;
      account_id?: string;
      repayment_id?: string;
      paid_amount?: number | string;
      [key: string]: any;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data: existing, error: fetchErr } = await (supabase.from('payables') as any)
        .select('*')
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .single();

      if (fetchErr) throw fetchErr;

      // Check if repayment amount is recorded
      const prevPaid = new Decimal(existing?.paid_amount || 0);
      const newPaid = update.paid_amount !== undefined ? new Decimal(update.paid_amount) : prevPaid;
      const repaymentDelta = newPaid.minus(prevPaid);

      if (repaymentDelta.gt(0)) {
        let targetAccountId = update.account_id;
        if (!targetAccountId) {
          const { data: accounts } = await (supabase.from('accounts') as any)
            .select('id')
            .eq('user_id', userData.user.id)
            .eq('is_active', true)
            .limit(1);
          if (accounts && accounts.length > 0) targetAccountId = accounts[0].id;
        }

        if (!targetAccountId) {
          throw new Error('An active account is required to pay debt.');
        }

        const counterpartyId = existing.counterparty_id || existing.person_id;
        const repaymentId = update.repayment_id || `repay-${Date.now()}`;

        const ledgerRes = await recordRepayment(supabase as any, {
          userId: userData.user.id,
          accountId: targetAccountId,
          counterpartyId,
          amount: repaymentDelta.toFixed(2),
          direction: 'out',
          date: new Date().toISOString().split('T')[0],
          description: `Repayment made for debt ${id}`,
          repaymentId,
        });

        if (!ledgerRes.success) {
          throw new Error(ledgerRes.error);
        }
      }

      // Update downstream projection metadata
      const { data, error } = await (supabase.from('payables') as any)
        .update(update)
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
      queryClient.invalidateQueries({ queryKey: ['payables-summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people_ledger_summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
  });
}
