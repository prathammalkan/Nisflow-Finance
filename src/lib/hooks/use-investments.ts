import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Decimal from 'decimal.js';

export function useInvestments() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['investments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investments')
        .select('*, transactions:investment_transactions(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

export function useInvestment(id: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['investment', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investments')
        .select('*, transactions:investment_transactions(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });
}

export function useCreateInvestment() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (investment: any) => {
      const { data, error } = await supabase.from('investments').insert(investment as any).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      toast.success('Investment created successfully');
      queryClient.invalidateQueries({ queryKey: ['investments'] });
    },
    onError: (error) => {
      toast.error(`Failed to create investment: ${error.message}`);
    }
  });
}

export function useUpdateInvestment() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updateData }: any) => {
      const { data, error } = await (supabase.from('investments') as any).update(updateData).eq('id', id).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success('Investment updated successfully');
      queryClient.invalidateQueries({ queryKey: ['investments'] });
      queryClient.invalidateQueries({ queryKey: ['investment', data.id] });
    },
    onError: (error) => {
      toast.error(`Failed to update investment: ${error.message}`);
    }
  });
}

export function useInvestmentTransactions(investmentId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['investment_transactions', investmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('investment_transactions')
        .select('*')
        .eq('investment_id', investmentId)
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!investmentId,
  });
}

export function useCreateInvestmentTransaction() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (transaction: any) => {
      const { data, error } = await supabase.from('investment_transactions').insert(transaction as any).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success('Transaction recorded successfully');
      queryClient.invalidateQueries({ queryKey: ['investment_transactions', data.investment_id] });
      queryClient.invalidateQueries({ queryKey: ['investment', data.investment_id] });
      queryClient.invalidateQueries({ queryKey: ['investments'] });
    },
    onError: (error) => {
      toast.error(`Failed to record transaction: ${error.message}`);
    }
  });
}

export function usePortfolioSummary() {
  const { data: investments, isLoading } = useInvestments();
  
  const summary = investments ? investments.reduce((acc, inv) => {
    // simplified summary for the sake of example, relying on Decimal.js
    const invested = new Decimal(inv.total_invested || 0);
    const currentValue = new Decimal(inv.current_value || inv.total_invested || 0);
    const pnl = currentValue.minus(invested);
    
    acc.totalInvested = acc.totalInvested.plus(invested);
    acc.currentValue = acc.currentValue.plus(currentValue);
    acc.unrealizedPnl = acc.unrealizedPnl.plus(pnl);
    
    // allocate by type
    const type = inv.asset_type || 'Other';
    acc.allocation[type] = (acc.allocation[type] || new Decimal(0)).plus(currentValue);
    
    return acc;
  }, {
    totalInvested: new Decimal(0),
    currentValue: new Decimal(0),
    unrealizedPnl: new Decimal(0),
    allocation: {} as Record<string, Decimal>
  }) : {
    totalInvested: new Decimal(0),
    currentValue: new Decimal(0),
    unrealizedPnl: new Decimal(0),
    allocation: {} as Record<string, Decimal>
  };

  return {
    data: {
      totalInvested: summary.totalInvested.toNumber(),
      currentValue: summary.currentValue.toNumber(),
      unrealizedPnl: summary.unrealizedPnl.toNumber(),
      allocation: Object.entries(summary.allocation).map(([name, value]) => ({
        name,
        value: (value as any).toNumber()
      }))
    },
    isLoading
  };
}
