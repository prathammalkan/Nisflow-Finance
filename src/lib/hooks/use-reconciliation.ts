import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Decimal } from 'decimal.js';

export function useReconciliations(accountId?: string) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['reconciliations', accountId],
    queryFn: async () => {
      let query = supabase.from('reconciliations').select('*').order('created_at', { ascending: false });
      if (accountId) {
        query = query.eq('account_id', accountId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
    enabled: true,
  });
}

export function useCreateReconciliation() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (newReconciliation: any) => {
      const { data, error } = await supabase
        .from('reconciliations')
        .insert([newReconciliation] as any)
        .select()
        .single();
      
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
    },
  });
}

export function useUpdateReconciliation() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { data, error } = await (supabase
        .from('reconciliations') as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation', variables.id] });
    },
  });
}

export function useReconciliationDetail(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['reconciliation', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reconciliations')
        .select('*, reconciliation_items(*)')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });
}
