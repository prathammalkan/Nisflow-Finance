import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  getLoanAuthoritativeBalance,
  getLoansAuthoritativeSummary,
  getLoanLedgerHistory,
  recordLoanDisbursement,
  recordLoanEMI,
  deleteLoanAuthoritative,
  type LoansAuthoritativeSummary,
  type LoanHistoryItem,
} from '@/lib/ledger/loans';

export interface CreateLoanParams {
  name: string;
  type: string;
  lender: string;
  principal_amount: number;
  interest_rate: number;
  tenure_months: number;
  start_date: string;
  deposit_account_id?: string; // Account receiving the loan funds
}

export interface RecordEMIParams {
  loanId: string;
  loanName?: string;
  accountId: string;
  principalAmount: number;
  interestAmount: number;
  totalAmount?: number;
  date?: string;
  description?: string;
  notes?: string;
}

export function useLoans() {
  return useQuery({
    queryKey: ['loans'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      // 1. Fetch loans from database
      const { data: loans, error } = await (supabase.from('loans') as any)
        .select('*')
        .eq('user_id', userData.user.id)
        .order('start_date', { ascending: false });

      if (error) throw error;

      // 2. Derive authoritative double-entry balances for all loans
      const summary = await getLoansAuthoritativeSummary(supabase as any, userData.user.id);
      return summary.loans;
    },
  });
}

export function useLoansSummary() {
  return useQuery<LoansAuthoritativeSummary>({
    queryKey: ['loans_summary'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      return getLoansAuthoritativeSummary(supabase as any, userData.user.id);
    },
  });
}

export function useLoan(id: string) {
  return useQuery({
    queryKey: ['loans', id],
    queryFn: async () => {
      const supabase = createClient();
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      const { data: loan, error } = await (supabase.from('loans') as any)
        .select('*')
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .single();

      if (error) throw error;

      const balance = await getLoanAuthoritativeBalance(supabase as any, userData.user.id, id);
      return {
        ...loan,
        authoritativeBalance: balance,
      };
    },
    enabled: !!id,
  });
}

export function useLoanLedgerHistory(loanId: string) {
  return useQuery<LoanHistoryItem[]>({
    queryKey: ['loan_history', loanId],
    queryFn: async () => {
      const supabase = createClient();
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      return getLoanLedgerHistory(supabase as any, userData.user.id, loanId);
    },
    enabled: !!loanId,
  });
}

export function useCreateLoan() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (params: CreateLoanParams) => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      // 1. Resolve deposit account (user-selected or first active account)
      let depositAccountId = params.deposit_account_id;
      if (!depositAccountId) {
        const { data: accounts } = await (supabase.from('accounts') as any)
          .select('id')
          .eq('is_active', true)
          .limit(1);
        if (accounts && accounts.length > 0) {
          depositAccountId = (accounts[0] as any).id;
        }
      }

      if (!depositAccountId) {
        throw new Error('An active bank/cash account is required for loan disbursement.');
      }

      // 2. Insert into loans table
      const { data: newLoan, error: insertError } = await (supabase.from('loans') as any)
        .insert({
          user_id: userData.user.id,
          name: params.name,
          loan_type: params.type,
          lender_name: params.lender,
          principal_amount: params.principal_amount,
          interest_rate: params.interest_rate,
          tenure_months: params.tenure_months,
          start_date: params.start_date,
          remaining_principal: params.principal_amount,
          status: 'active',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 3. Post authoritative disbursement to double-entry ledger
      const disburseResult = await recordLoanDisbursement(supabase as any, {
        userId: userData.user.id,
        loanId: newLoan.id,
        loanName: params.name,
        accountId: depositAccountId,
        amount: params.principal_amount,
        date: params.start_date,
        description: `Disbursement: ${params.name} (${params.lender})`,
      });

      return {
        loan: newLoan,
        journalEntryId: disburseResult.journalEntryId,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loans_summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Loan created and disbursed into ledger successfully');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create loan');
    },
  });
}

export function useRecordLoanEMI() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (params: RecordEMIParams) => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      return recordLoanEMI(supabase as any, {
        userId: userData.user.id,
        loanId: params.loanId,
        loanName: params.loanName,
        accountId: params.accountId,
        principalAmount: params.principalAmount,
        interestAmount: params.interestAmount,
        totalAmount: params.totalAmount,
        date: params.date,
        description: params.description,
        notes: params.notes,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loans_summary'] });
      queryClient.invalidateQueries({ queryKey: ['loans', variables.loanId] });
      queryClient.invalidateQueries({ queryKey: ['loan_history', variables.loanId] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('EMI payment posted to authoritative ledger');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to record EMI payment');
    },
  });
}

export function useDeleteLoan() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      const result = await deleteLoanAuthoritative(supabase as any, userData.user.id, id);
      if (!result.success) {
        throw new Error(result.error || 'Failed to safely archive loan and reverse ledger entries');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['loans_summary'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      toast.success('Loan safely deleted and ledger liabilities reversed');
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to delete loan');
    },
  });
}
