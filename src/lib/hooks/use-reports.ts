import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Decimal from 'decimal.js';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

function getDateRange(range: string): { start: string; end: string } {
  const now = new Date();
  switch (range) {
    case 'Last Month': {
      const last = subMonths(now, 1);
      return { start: startOfMonth(last).toISOString(), end: endOfMonth(last).toISOString() };
    }
    case 'This Quarter': {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      return { start: start.toISOString(), end: end.toISOString() };
    }
    case 'This Year': {
      return {
        start: new Date(now.getFullYear(), 0, 1).toISOString(),
        end: new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString(),
      };
    }
    default: // 'This Month'
      return { start: startOfMonth(now).toISOString(), end: endOfMonth(now).toISOString() };
  }
}

export function usePersonalFinanceReport(dateRange: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-personal-finance', dateRange],
    queryFn: async () => {
      const { start, end } = getDateRange(dateRange);

      const [{ data: txns }, { data: accounts }, { data: receivables }, { data: payables }] =
        await Promise.all([
          supabase.from('transactions').select('amount, type').gte('date', start).lte('date', end),
          supabase.from('accounts').select('balance, ownership, type').eq('is_active', true),
          supabase.from('receivables').select('remaining_amount').neq('status', 'settled'),
          supabase.from('payables').select('remaining_amount').neq('status', 'settled'),
        ]);

      let income = new Decimal(0);
      let expenses = new Decimal(0);
      let savings = new Decimal(0);
      let investments = new Decimal(0);
      let netWorth = new Decimal(0);

      (txns as any[] || []).forEach((t) => {
        const amt = new Decimal(t.amount || 0);
        if (t.type === 'income') income = income.plus(amt);
        if (t.type === 'expense') expenses = expenses.plus(amt);
        if (t.type === 'savings') savings = savings.plus(amt);
        if (t.type === 'investment') investments = investments.plus(amt);
      });

      (accounts as any[] || []).forEach((a) => {
        if (a.ownership === 'personal') netWorth = netWorth.plus(new Decimal(a.balance || 0));
      });
      (receivables as any[] || []).forEach((r) => netWorth = netWorth.plus(new Decimal(r.remaining_amount || 0)));
      (payables as any[] || []).forEach((p) => netWorth = netWorth.minus(new Decimal(p.remaining_amount || 0)));

      return { income, expenses, savings, investments, netWorth };
    },
  });
}

export function useAccountReport(accountId: string, dateRange: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-account', accountId, dateRange],
    enabled: !!accountId,
    queryFn: async () => {
      const { start } = getDateRange(dateRange);

      const [{ data: account }, { data: txns }] = await Promise.all([
        supabase.from('accounts').select('balance').eq('id', accountId).single(),
        supabase.from('transactions').select('amount, type, date').eq('account_id', accountId).gte('date', start),
      ]);

      let inflows = new Decimal(0);
      let outflows = new Decimal(0);

      (txns as any[] || []).forEach((t) => {
        const amt = new Decimal(t.amount || 0);
        if (t.type === 'income') inflows = inflows.plus(amt);
        if (t.type === 'expense') outflows = outflows.plus(amt);
      });

      const closing = new Decimal((account as any)?.balance || 0);
      const opening = closing.minus(inflows).plus(outflows);

      return { opening, inflows, outflows, closing };
    },
  });
}

export function useSpendingReport(dateRange: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-spending', dateRange],
    queryFn: async () => {
      const { start, end } = getDateRange(dateRange);
      const { data } = await supabase
        .from('transactions')
        .select('amount, category:categories(name)')
        .eq('type', 'expense')
        .gte('date', start)
        .lte('date', end);

      const map = new Map<string, Decimal>();
      (data as any[] || []).forEach((t) => {
        const cat = t.category?.name || 'Uncategorized';
        map.set(cat, (map.get(cat) || new Decimal(0)).plus(new Decimal(t.amount || 0)));
      });

      return Array.from(map.entries())
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount.comparedTo(a.amount));
    },
  });
}

export function useThirdPartyReport(dateRange: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-third-party', dateRange],
    queryFn: async () => {
      const { data } = await supabase.from('third_party_funds').select('amount, amount_used, amount_returned, status');

      let received = new Decimal(0);
      let used = new Decimal(0);
      let returned = new Decimal(0);
      let outstanding = new Decimal(0);

      (data as any[] || []).forEach((t) => {
        const amt = new Decimal(t.amount || 0);
        received = received.plus(amt);
        used = used.plus(new Decimal(t.amount_used || 0));
        returned = returned.plus(new Decimal(t.amount_returned || 0));
        if (t.status !== 'settled') outstanding = outstanding.plus(amt.minus(new Decimal(t.amount_returned || 0)));
      });

      return { received, used, returned, outstanding };
    },
  });
}

export function useIPOReport() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-ipo'],
    queryFn: async () => {
      const { data } = await supabase.from('ipo_applications').select('*, ipo:ipos(name, issue_price)');
      return (data as any[] || []).map((app) => ({
        name: app.ipo?.name || 'Unknown IPO',
        applied: new Decimal(app.applied_amount || 0),
        allotted: app.allotted || false,
        currentValue: new Decimal(app.current_value || app.allotted_amount || 0),
        listingDate: app.listing_date,
        status: app.status,
      }));
    },
  });
}

export function useInvestmentReport() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-investment'],
    queryFn: async () => {
      const { data } = await supabase.from('investments').select('invested_amount, current_value, name, type');

      let totalInvested = new Decimal(0);
      let currentValue = new Decimal(0);

      (data as any[] || []).forEach((inv) => {
        totalInvested = totalInvested.plus(new Decimal(inv.invested_amount || 0));
        currentValue = currentValue.plus(new Decimal(inv.current_value || 0));
      });

      const returns = currentValue.minus(totalInvested);
      return { totalInvested, currentValue, returns };
    },
  });
}

export function usePeopleReport() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-people'],
    queryFn: async () => {
      const [{ data: recv }, { data: pay }] = await Promise.all([
        supabase.from('receivables').select('remaining_amount').neq('status', 'settled'),
        supabase.from('payables').select('remaining_amount').neq('status', 'settled'),
      ]);

      let receivables = new Decimal(0);
      let payables = new Decimal(0);

      (recv as any[] || []).forEach((r) => receivables = receivables.plus(new Decimal(r.remaining_amount || 0)));
      (pay as any[] || []).forEach((p) => payables = payables.plus(new Decimal(p.remaining_amount || 0)));

      return { receivables, payables };
    },
  });
}

export function useTaxReport(financialYear: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-tax', financialYear],
    queryFn: async () => {
      // FY 2025-26 runs from Apr 2025 to Mar 2026
      const parts = financialYear.replace('FY ', '').split('-');
      const fromYear = parseInt(parts[0]);
      const toYear = parseInt(parts[1].length === 2 ? `20${parts[1]}` : parts[1]);

      const start = new Date(fromYear, 3, 1).toISOString(); // April 1
      const end = new Date(toYear, 2, 31, 23, 59, 59).toISOString(); // March 31

      const [{ data: txns }, { data: taxRecords }] = await Promise.all([
        supabase.from('transactions').select('amount, type, category:categories(name)').gte('date', start).lte('date', end),
        supabase.from('tax_records').select('*').eq('financial_year', financialYear),
      ]);

      let totalIncome = new Decimal(0);
      let deductions = new Decimal(0);
      let capitalGains = new Decimal(0);
      let investmentIncome = new Decimal(0);

      (txns as any[] || []).forEach((t) => {
        const amt = new Decimal(t.amount || 0);
        if (t.type === 'income') {
          const catName = t.category?.name?.toLowerCase() || '';
          if (catName.includes('dividend') || catName.includes('interest')) {
            investmentIncome = investmentIncome.plus(amt);
          } else {
            totalIncome = totalIncome.plus(amt);
          }
        }
      });

      (taxRecords as any[] || []).forEach((r) => {
        if (r.record_type === 'deduction') deductions = deductions.plus(new Decimal(r.amount || 0));
        if (r.record_type === 'capital_gain') capitalGains = capitalGains.plus(new Decimal(r.amount || 0));
      });

      return { totalIncome, deductions, capitalGains, investmentIncome, rawRecords: taxRecords || [] };
    },
  });
}
