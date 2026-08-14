import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
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
        .order('sort_order', { ascending: true })
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
    mutationFn: async (newAccount: AccountInsert) => {
      const { data, error } = await supabase
        .from('accounts')
        // @ts-ignore
        .insert(newAccount as any)
        .select()
        .single();

      if (error) throw error;
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
      const { data, error } = await supabase
        .from('accounts')
        // @ts-ignore
        .update(updateData as any)
        .eq('id', id)
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
      const { data, error } = await supabase
        .from('accounts')
        // @ts-ignore
        .update({ is_active: false } as any)
        .eq('id', id)
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
