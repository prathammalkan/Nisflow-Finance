import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Decimal } from 'decimal.js';
import { recordFinancialTransaction } from '@/lib/ledger/service';
import type { Database } from '@/types/database';

type Account = Database['public']['Tables']['accounts']['Row'];
type AccountInsert = Database['public']['Tables']['accounts']['Insert'];
type AccountUpdate = Database['public']['Tables']['accounts']['Update'];

export function useAccounts(includeInactive = false) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['accounts', includeInactive],
    queryFn: async () => {
      let query = supabase
        .from('accounts')
        .select('*')
        .order('name', { ascending: true });

      if (!includeInactive) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Account[];
    },
  });
}

export function useAccount(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['accounts', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) throw error;
      return data as Account;
    },
    enabled: !!id,
  });
}

export function useCreateAccount() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newAccount: AccountInsert & { opening_balance?: number | string }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const initialBalDec = new Decimal((newAccount as any).opening_balance || (newAccount as any).balance || 0);

      // Create account with 0 balance, then post opening balance to ledger
      const payload = {
        ...newAccount,
        user_id: userData.user.id,
        balance: 0,
        current_balance: 0,
      };

      const { data, error } = await supabase
        .from('accounts')
        // @ts-ignore
        .insert(payload as any)
        .select()
        .single();

      if (error) throw error;

      if (initialBalDec.gt(0)) {
        const ledgerRes = await recordFinancialTransaction(supabase as any, {
          userId: userData.user.id,
          type: 'opening_balance',
          accountId: (data as any).id,
          amount: initialBalDec.toFixed(2),
          date: new Date().toISOString().split('T')[0],
          description: `Opening Balance for ${(data as any).name}`,
          idempotencyKey: `ACC:OPEN:${(data as any).id}`,
          sourceType: 'account_opening',
          sourceId: (data as any).id,
        });

        if (!ledgerRes.success) {
          console.warn('Failed to post opening balance to ledger:', ledgerRes.error);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast.success('Account created successfully');
    },
    onError: (error) => {
      toast.error(`Failed to create account: ${error.message}`);
    },
  });
}

export function useUpdateAccount() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & AccountUpdate) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      // Disallow direct balance mutations; balances must strictly be derived from ledger postings
      const { balance, current_balance, user_id, ...safeUpdateData } = updateData as any;

      const { data, error } = await supabase
        .from('accounts')
        // @ts-ignore
        .update(safeUpdateData as any)
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts', (data as any).id] });
      toast.success('Account updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update account: ${error.message}`);
    },
  });
}

export function useDeleteAccount() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('accounts')
        // @ts-ignore
        .update({ is_active: false } as any)
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounts', (data as any).id] });
      toast.success('Account deactivated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to deactivate account: ${error.message}`);
    },
  });
}

export function useAccountStats(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['account-stats', id],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // This is a simplified version - in a real app you might want to create a database RPC
      // or view to aggregate this data more efficiently
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('type, amount')
        .eq('account_id', id)
        .gte('date', startOfMonth.toISOString());

      if (error) throw error;

      let inflow = 0;
      let outflow = 0;

      (transactions as any[])?.forEach(tx => {
        if (tx.type === 'income' || (tx.type === 'transfer' && tx.amount > 0)) {
           inflow += Number(tx.amount);
        } else if (tx.type === 'expense' || (tx.type === 'transfer' && tx.amount < 0)) {
           outflow += Math.abs(Number(tx.amount));
        }
      });

      return {
        inflow,
        outflow,
        transactionCount: transactions?.length || 0,
      };
    },
    enabled: !!id,
  });
}
