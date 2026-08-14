import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Decimal from 'decimal.js';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

export function useDashboardStats() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const now = new Date();
      const startOfCurrentMonth = startOfMonth(now).toISOString();
      const endOfCurrentMonth = endOfMonth(now).toISOString();

      const [
        { data: accounts },
        { data: transactions },
        { data: thirdParty },
        { data: receivables },
        { data: payables }
      ] = await Promise.all([
        supabase.from('accounts').select('*').eq('is_active', true),
        supabase.from('transactions').select('*').gte('date', startOfCurrentMonth).lte('date', endOfCurrentMonth),
        supabase.from('third_party_funds').select('*').neq('status', 'settled'),
        supabase.from('receivables').select('*').neq('status', 'settled'),
        supabase.from('payables').select('*').neq('status', 'settled'),
      ]);

      const _accounts = accounts as any[] | null;
      const _transactions = transactions as any[] | null;
      const _thirdParty = thirdParty as any[] | null;
      const _receivables = receivables as any[] | null;
      const _payables = payables as any[] | null;

      let personalNetWorth = new Decimal(0);
      let availablePersonalCash = new Decimal(0);
      let totalSavings = new Decimal(0);
      let totalInvestments = new Decimal(0);
      
      let thisMonthIncome = new Decimal(0);
      let thisMonthExpenses = new Decimal(0);
      let thisMonthSavings = new Decimal(0);
      let thisMonthInvestments = new Decimal(0);

      let thirdPartyHeld = new Decimal(0);
      let totalReceivables = new Decimal(0);
      let totalPayables = new Decimal(0);
      
      let needsReviewCount = 0;
      let needsReviewValue = new Decimal(0);
      
      let reconciledCount = 0;

      if (_accounts) {
        _accounts.forEach(acc => {
          const balance = new Decimal(acc.balance || 0);
          
          if (acc.ownership === 'personal') {
            personalNetWorth = personalNetWorth.plus(balance);
            if (['bank', 'cash', 'wallet'].includes(acc.type)) {
              availablePersonalCash = availablePersonalCash.plus(balance);
            }
            if (acc.purpose === 'savings') {
              totalSavings = totalSavings.plus(balance);
            }
            if (acc.type === 'investment') {
              totalInvestments = totalInvestments.plus(balance);
            }
          }
          
          if (acc.last_reconciled_at) {
            reconciledCount++;
          }
        });
      }

      if (_transactions) {
        _transactions.forEach(tx => {
          const amount = new Decimal(tx.amount || 0);
          if (tx.type === 'income') thisMonthIncome = thisMonthIncome.plus(amount);
          if (tx.type === 'expense') thisMonthExpenses = thisMonthExpenses.plus(amount);
          if (tx.type === 'transfer' && tx.purpose === 'savings') thisMonthSavings = thisMonthSavings.plus(amount);
          if (tx.type === 'transfer' && tx.purpose === 'investment') thisMonthInvestments = thisMonthInvestments.plus(amount);
          
          if (tx.status === 'needs_review') {
            needsReviewCount++;
            needsReviewValue = needsReviewValue.plus(amount);
          }
        });
      }

      if (_thirdParty) {
        _thirdParty.forEach(tp => {
          thirdPartyHeld = thirdPartyHeld.plus(new Decimal(tp.amount || 0));
        });
      }

      if (_receivables) {
        _receivables.forEach(r => {
          totalReceivables = totalReceivables.plus(new Decimal(r.remaining_amount || 0));
        });
        personalNetWorth = personalNetWorth.plus(totalReceivables);
      }

      if (_payables) {
        _payables.forEach(p => {
          totalPayables = totalPayables.plus(new Decimal(p.remaining_amount || 0));
        });
        personalNetWorth = personalNetWorth.minus(totalPayables);
      }

      return {
        personalNetWorth: personalNetWorth.toNumber(),
        availablePersonalCash: availablePersonalCash.toNumber(),
        totalSavings: totalSavings.toNumber(),
        totalInvestments: totalInvestments.toNumber(),
        thisMonthIncome: thisMonthIncome.toNumber(),
        thisMonthExpenses: thisMonthExpenses.toNumber(),
        thisMonthSavings: thisMonthSavings.toNumber(),
        thisMonthInvestments: thisMonthInvestments.toNumber(),
        thirdPartyHeld: thirdPartyHeld.toNumber(),
        totalReceivables: totalReceivables.toNumber(),
        totalPayables: totalPayables.toNumber(),
        needsReviewCount,
        needsReviewValue: needsReviewValue.toNumber(),
        reconciledCount,
        totalAccounts: accounts?.length || 0
      };
    }
  });
}

export function useMonthlyTrend(months: number) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['monthly-trend', months],
    queryFn: async () => {
      const start = subMonths(new Date(), months - 1);
      start.setDate(1);
      
      const { data } = await supabase
        .from('transactions')
        .select('amount, type, date')
        .in('type', ['income', 'expense'])
        .gte('date', start.toISOString());
        
      if (!data) return [];
      const _data = data as any[];

      const trend = new Map<string, { income: Decimal, expense: Decimal }>();
      
      _data.forEach(tx => {
        const monthKey = tx.date.substring(0, 7); // YYYY-MM
        if (!trend.has(monthKey)) {
          trend.set(monthKey, { income: new Decimal(0), expense: new Decimal(0) });
        }
        
        const amount = new Decimal(tx.amount || 0);
        const current = trend.get(monthKey)!;
        
        if (tx.type === 'income') {
          current.income = current.income.plus(amount);
        } else {
          current.expense = current.expense.plus(amount);
        }
      });
      
      return Array.from(trend.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, values]) => ({
          date,
          income: values.income.toNumber(),
          expense: values.expense.toNumber()
        }));
    }
  });
}

export function useSpendingByCategory(month: number, year: number) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['spending-by-category', month, year],
    queryFn: async () => {
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0).toISOString();
      
      const { data } = await supabase
        .from('transactions')
        .select('amount, category:categories(name)')
        .eq('type', 'expense')
        .gte('date', startDate)
        .lte('date', endDate);
        
      if (!data) return [];
      const _data = data as any[];
      
      const categories = new Map<string, Decimal>();
      
      _data.forEach(tx => {
        const catName = tx.category?.name || 'Uncategorized';
        const amount = new Decimal(tx.amount || 0);
        
        if (categories.has(catName)) {
          categories.set(catName, categories.get(catName)!.plus(amount));
        } else {
          categories.set(catName, amount);
        }
      });
      
      return Array.from(categories.entries())
        .map(([name, amount]) => ({ name, value: amount.toNumber() }))
        .sort((a, b) => b.value - a.value);
    }
  });
}

export function useDailySpending(days: number) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['daily-spending', days],
    queryFn: async () => {
      const now = new Date();
      const start = new Date();
      start.setDate(now.getDate() - days + 1);
      
      const { data } = await supabase
        .from('transactions')
        .select('amount, date')
        .eq('type', 'expense')
        .gte('date', start.toISOString());
        
      if (!data) return [];
      const _data = data as any[];
      
      const daily = new Map<string, Decimal>();
      
      _data.forEach(tx => {
        const dayKey = tx.date.substring(0, 10);
        const amount = new Decimal(tx.amount || 0);
        
        if (daily.has(dayKey)) {
          daily.set(dayKey, daily.get(dayKey)!.plus(amount));
        } else {
          daily.set(dayKey, amount);
        }
      });
      
      // Fill missing days
      const result = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const dayKey = d.toISOString().substring(0, 10);
        
        result.push({
          date: dayKey,
          amount: daily.get(dayKey)?.toNumber() || 0
        });
      }
      
      return result;
    }
  });
}

export function useRecentTransactions(limit: number) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ['recent-transactions', limit],
    queryFn: async () => {
      const { data } = await supabase
        .from('transactions')
        .select('*, account:accounts(name), category:categories(name)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);
        
      return (data as any[]) || [];
    }
  });
}
