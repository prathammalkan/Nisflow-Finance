import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useInvestments() {
  return useQuery({
    queryKey: ['investments'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await (supabase.from('investments') as any)
        .select('*, investment_transactions(*)')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export function useInvestment(id: string) {
  return useQuery({
    queryKey: ['investments', id],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await (supabase.from('investments') as any)
        .select('*, investment_transactions(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useCreateInvestmentTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (transaction: any) => {
      const supabase = createClient();
      const { data, error } = await (supabase.from('investment_transactions') as any)
        .insert(transaction)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investments'] });
    },
  });
}
