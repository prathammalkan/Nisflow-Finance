import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';

type Person = Database['public']['Tables']['counterparties']['Row'];
type PersonInsert = Database['public']['Tables']['counterparties']['Insert'];
type PersonUpdate = Database['public']['Tables']['counterparties']['Update'];

export function usePeople() {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['people'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('counterparties')
        .select('*')
        .order('name');
        
      if (error) throw error;
      return (data as any[]) || [];
    }
  });
}

export function usePerson(id: string) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['people', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('counterparties')
        .select('*')
        .eq('id', id)
        .single();
        
      if (error) throw error;
      return (data as any) || null;
    },
    enabled: !!id
  });
}

export function useCreatePerson() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (person: PersonInsert) => {
      const { data, error } = await supabase
        .from('counterparties')
        .insert(person as any)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
    }
  });
}

export function useUpdatePerson() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...update }: { id: string } & PersonUpdate) => {
      const { data, error } = await supabase
        .from('counterparties')
        .update(update as never)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
      queryClient.invalidateQueries({ queryKey: ['people', variables.id] });
    }
  });
}

export function useDeletePerson() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('counterparties')
        .delete()
        .eq('id', id);
        
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['people'] });
    }
  });
}
