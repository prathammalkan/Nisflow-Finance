import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useTodaySpent() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['today-spent'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString();

      const { data, error } = await supabase
        .from('transactions')
        .select('amount')
        .eq('user_id', userData.user.id)
        .eq('direction', 'out')
        .gte('date', startOfDay)
        .lte('date', endOfDay);

      if (error) throw error;

      return ((data as any[]) || []).reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    },
    staleTime: 60 * 1000, // 1 minute
  });
}
