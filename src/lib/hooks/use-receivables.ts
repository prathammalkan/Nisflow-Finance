import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import Decimal from 'decimal.js';

type Receivable = Database['public']['Tables']['receivables']['Row'] & { people: { name: string } | null };
type ReceivableInsert = Database['public']['Tables']['receivables']['Insert'];
type ReceivableUpdate = Database['public']['Tables']['receivables']['Update'];

export function useReceivables() {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['receivables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receivables')
        .select('*, people(name)')
        .order('due_date', { ascending: true });
        
      if (error) throw error;
      return (data as any[]) as Receivable[];
    }
  });
}

export function useCreateReceivable() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (receivable: ReceivableInsert) => {
      const { data, error } = await supabase
        .from('receivables')
        .insert(receivable as any)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
    }
  });
}

export function useUpdateReceivable() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...update }: { id: string } & ReceivableUpdate) => {
      const { data, error } = await supabase
        .from('receivables')
        .update(update as never)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receivables'] });
    }
  });
}

export function useReceivablesSummary() {
  const { data: receivables } = useReceivables();
  
  if (!receivables) return { totalOutstanding: new Decimal(0), overdueCount: 0 };
  
  const totalOutstanding = receivables.reduce((sum, r) => {
    if (r.status !== 'SETTLED') {
      const amount = new Decimal(r.amount);
      const received = new Decimal((r as any).received_amount || 0);
      return sum.plus(amount.minus(received));
    }
    return sum;
  }, new Decimal(0));
  
  const overdueCount = receivables.filter(r => {
    return r.status !== 'SETTLED' && r.due_date && new Date(r.due_date) < new Date();
  }).length;
  
  return {
    totalOutstanding,
    overdueCount
  };
}
