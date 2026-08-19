import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Decimal } from 'decimal.js';

export function useReconciliations(accountId?: string) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['reconciliations', accountId],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      let query = supabase
        .from('reconciliations')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false });
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
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { user_id, ...safePayload } = newReconciliation;

      const { data, error } = await supabase
        .from('reconciliations')
        .insert([{ ...safePayload, user_id: userData.user.id }] as any)
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
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { user_id, ...safeUpdates } = updates;

      const { data, error } = await (supabase
        .from('reconciliations') as any)
        .update(safeUpdates)
        .eq('id', id)
        .eq('user_id', userData.user.id)
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
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('reconciliations')
        .select('*, reconciliation_items(*)')
        .eq('id', id)
        .eq('user_id', userData.user.id)
        .single();
      
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });
}
