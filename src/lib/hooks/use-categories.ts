import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database';

type Category = Database['public']['Tables']['categories']['Row'];

export function useCategories() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
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
        .from('categories')
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
