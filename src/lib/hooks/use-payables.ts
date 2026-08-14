import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Database } from '@/types/database';
import Decimal from 'decimal.js';

type Payable = Database['public']['Tables']['payables']['Row'] & { people: { name: string } | null };
type PayableInsert = Database['public']['Tables']['payables']['Insert'];
type PayableUpdate = Database['public']['Tables']['payables']['Update'];

export function usePayables() {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['payables'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payables')
        .select('*, people(name)')
        .order('due_date', { ascending: true });
        
      if (error) throw error;
      return (data as any[]) as Payable[];
    }
  });
}

export function useCreatePayable() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (payable: PayableInsert) => {
      const { data, error } = await supabase
        .from('payables')
        .insert(payable as any)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
    }
  });
}

export function useUpdatePayable() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...update }: { id: string } & PayableUpdate) => {
      const { data, error } = await supabase
        .from('payables')
        .update(update as never)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payables'] });
    }
  });
}

export function usePayablesSummary() {
  const { data: payables } = usePayables();
  
  if (!payables) return { totalOutstanding: new Decimal(0), overdueCount: 0 };
  
  const totalOutstanding = payables.reduce((sum, r) => {
    if (r.status !== 'SETTLED') {
      const amount = new Decimal(r.amount);
      const paid = new Decimal((r as any).paid_amount || 0);
      return sum.plus(amount.minus(paid));
    }
    return sum;
  }, new Decimal(0));
  
  const overdueCount = payables.filter(r => {
    return r.status !== 'SETTLED' && r.due_date && new Date(r.due_date) < new Date();
  }).length;
  
  return {
    totalOutstanding,
    overdueCount
  };
}
