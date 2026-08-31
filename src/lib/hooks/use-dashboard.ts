import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
  getAuthoritativeDashboardStats,
  getAuthoritativeMonthlyTrend,
  getAuthoritativeSpendingByCategory,
  getAuthoritativeDailySpending,
} from '@/lib/ledger/analytics';

export function useDashboardStats() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      const now = new Date();
      const startOfCurrentMonth = startOfMonth(now).toISOString();
      const endOfCurrentMonth = endOfMonth(now).toISOString();

      return getAuthoritativeDashboardStats(
        supabase as any,
        userData.user.id,
        startOfCurrentMonth,
        endOfCurrentMonth
      );
    },
  });
}

export function useMonthlyTrend(months: number) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['monthly-trend', months],
    queryFn: async () => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      const start = subMonths(new Date(), months - 1);
      start.setDate(1);

      return getAuthoritativeMonthlyTrend(supabase as any, userData.user.id, start.toISOString());
    },
  });
}

export function useSpendingByCategory(month: number, year: number) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['spending-by-category', month, year],
    queryFn: async () => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      const startDateStr = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDateStr = new Date(year, month, 0).toISOString().split('T')[0];

      return getAuthoritativeSpendingByCategory(
        supabase as any,
        userData.user.id,
        startDateStr,
        endDateStr
      );
    },
  });
}

export function useDailySpending(days: number) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['daily-spending', days],
    queryFn: async () => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      return getAuthoritativeDailySpending(supabase as any, userData.user.id, days);
    },
  });
}

export function useRecentTransactions(limit: number) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['recent-transactions', limit],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*, account:accounts(name), category:transaction_categories(name)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      return (data as any[]) || [];
    },
  });
}
