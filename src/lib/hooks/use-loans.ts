import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useLoans() {
  return useQuery({
    queryKey: ['loans'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}
