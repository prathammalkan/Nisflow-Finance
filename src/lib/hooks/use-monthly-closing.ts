import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useCreateAuditLog } from './use-audit-log';

export function useMonthlyClosings() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['monthly_closings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_closings')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false });
        
      if (error) throw error;
      return data as any[];
    }
  });
}

export function useMonthlyClosing(month: number, year: number) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['monthly_closing', month, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_closings')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .maybeSingle();
        
      if (error) throw error;
      return data as any;
    },
    enabled: !!month && !!year,
  });
}

export function useCloseMonth() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { mutateAsync: logAction } = useCreateAuditLog();

  return useMutation({
    mutationFn: async (closingData: any) => {
      const { data, error } = await supabase
        .from('monthly_closings')
        .upsert([closingData] as any)
        .select()
        .single();
        
      if (error) throw error;
      
      await logAction({
        action: 'MONTH_CLOSED',
        entity_type: 'monthly_closing',
        entity_id: (data as any).id,
        details: { month: closingData.month, year: closingData.year }
      });
      
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly_closings'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_closing'] });
    }
  });
}

export function useReopenMonth() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { mutateAsync: logAction } = useCreateAuditLog();

  return useMutation({
    mutationFn: async ({ id, reason, month, year }: { id: string; reason: string; month: number; year: number }) => {
      const { data, error } = await (supabase
        .from('monthly_closings') as any)
        .update({ status: 'reopened', notes: reason })
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      
      await logAction({
        action: 'MONTH_REOPENED',
        entity_type: 'monthly_closing',
        entity_id: id,
        details: { reason, month, year }
      });
      
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly_closings'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_closing'] });
    }
  });
}
