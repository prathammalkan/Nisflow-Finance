import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database';

// The canonical category table is `transaction_categories`.
// The legacy `categories` table does not exist in any migration and must not be queried.
type Category = Database['public']['Tables']['transaction_categories']['Row'];

export function useCategories() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transaction_categories')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data as Category[];
    },
  });
}

export function useCategoriesByType(type: 'income' | 'expense' | 'both') {
  const supabase = createClient();

  return useQuery({
    queryKey: ['categories', type],
    queryFn: async () => {
      let query = supabase
        .from('transaction_categories')
        .select('*')
        .order('name', { ascending: true });

      if (type !== 'both') {
        query = query.eq('type', type);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Category[];
    },
  });
}
