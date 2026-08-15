import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Decimal from 'decimal.js';
import { format } from 'date-fns';

export function useNetWorthHistory(months: number = 12) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['net-worth-history', months],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('net_worth_snapshots' as any)
        .select('period, net_worth, personal_cash, investments')
        .eq('user_id', user.id)
        .order('period', { ascending: false })
        .limit(months);

      if (error) throw error;

      return ((data as any[]) || []).reverse().map((item: any) => ({
        period: item.period,
        net_worth: Number(item.net_worth),
        personal_cash: Number(item.personal_cash),
        investments: Number(item.investments)
      }));
    }
  });
}

export function useSaveNetWorthSnapshot() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stats: {
      personalCash: number;
      savings: number;
      investments: number;
      receivables: number;
      payables: number;
      thirdPartyHeld: number;
      netWorth: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const now = new Date();
      const period = format(now, 'yyyy-MM');
      const snapshotDate = format(now, 'yyyy-MM-dd');

      const { error } = await (supabase
        .from('net_worth_snapshots' as any) as any)
        .upsert({
          user_id: user.id,
          period: period,
          snapshot_date: snapshotDate,
          personal_cash: new Decimal(stats.personalCash).toNumber(),
          savings: new Decimal(stats.savings).toNumber(),
          investments: new Decimal(stats.investments).toNumber(),
          receivables: new Decimal(stats.receivables).toNumber(),
          payables: new Decimal(stats.payables).toNumber(),
          third_party_held: new Decimal(stats.thirdPartyHeld).toNumber(),
          net_worth: new Decimal(stats.netWorth).toNumber()
        }, {
          onConflict: 'user_id,period'
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['net-worth-history'] });
    }
  });
}
