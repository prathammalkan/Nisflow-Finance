import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Decimal from 'decimal.js';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { getPeopleAuthoritativeSummary } from '@/lib/ledger/people';
import { getAuthoritativeDashboardStats, getAuthoritativeSpendingByCategory } from '@/lib/ledger/analytics';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

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
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      const { start, end } = getDateRange(dateRange);
      const startStr = start.split('T')[0];
      const endStr = end.split('T')[0];

      // 1. Fetch ledger accounts and journal lines for the user
      const [
        { data: ledgerAccounts, error: laErr },
        { data: lines, error: linesErr },
        stats
      ] = await Promise.all([
        (supabase.from('ledger_accounts') as any).select('*').eq('user_id', userData.user.id),
        (supabase.from('journal_lines') as any).select(`
          id,
          ledger_account_id,
          debit_amount,
          credit_amount,
          journal_entries!inner (
            id,
            transaction_date,
            status,
            user_id
          )
        `)
          .eq('user_id', userData.user.id)
          .eq('journal_entries.status', 'posted')
          .gte('journal_entries.transaction_date', startStr)
          .lte('journal_entries.transaction_date', endStr),
        getAuthoritativeDashboardStats(supabase as any, userData.user.id, start, end)
      ]);

      if (laErr) throw new Error(`Failed to query ledger accounts: ${laErr.message}`);
      if (linesErr) throw new Error(`Failed to query journal lines: ${linesErr.message}`);

      const laTypeMap = new Map<string, string>();
      for (const la of ledgerAccounts || []) {
        laTypeMap.set(la.id, la.account_type);
      }

      let income = new Decimal(0);
      let expenses = new Decimal(0);
      let savings = new Decimal(0);
      let investments = new Decimal(0);

      for (const line of lines || []) {
        const type = laTypeMap.get(line.ledger_account_id);
        const debits = new Decimal(line.debit_amount || 0);
        const credits = new Decimal(line.credit_amount || 0);

        if (type === 'income') {
          income = income.plus(credits.minus(debits));
        } else if (type === 'expense') {
          expenses = expenses.plus(debits.minus(credits));
        }
      }

      const netWorth = new Decimal(stats.personalNetWorth);

      return {
        income: Decimal.max(0, income),
        expenses: Decimal.max(0, expenses),
        savings,
        investments,
        netWorth,
      };
    },
  });
}

export function useAccountReport(accountId: string, dateRange: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-account', accountId, dateRange],
    enabled: !!accountId,
    queryFn: async () => {
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      const { start, end } = getDateRange(dateRange);
      const startStr = start.split('T')[0];
      const endStr = end.split('T')[0];

      // Find ledger account AST-ACC-<accountId>
      const { data: la } = await (supabase.from('ledger_accounts') as any)
        .select('id')
        .eq('user_id', userData.user.id)
        .eq('code', `AST-ACC-${accountId}`)
        .maybeSingle();

      if (!la) {
        return {
          opening: new Decimal(0),
          inflows: new Decimal(0),
          outflows: new Decimal(0),
          closing: new Decimal(0),
        };
      }

      // Query all posted journal lines for this asset account
      const { data: lines, error } = await (supabase.from('journal_lines') as any)
        .select(`
          id,
          debit_amount,
          credit_amount,
          journal_entries!inner (
            id,
            transaction_date,
            status,
            user_id
          )
        `)
        .eq('user_id', userData.user.id)
        .eq('ledger_account_id', la.id)
        .eq('journal_entries.status', 'posted');

      if (error) throw new Error(`Failed to query account report: ${error.message}`);

      let closing = new Decimal(0);
      let inflows = new Decimal(0);
      let outflows = new Decimal(0);

      for (const line of lines || []) {
        const d = new Decimal(line.debit_amount || 0);
        const c = new Decimal(line.credit_amount || 0);
        const txDate = line.journal_entries.transaction_date;

        // Cumulative closing balance
        closing = closing.plus(d.minus(c));

        // Inflows and outflows in date range
        if (txDate >= startStr && txDate <= endStr) {
          inflows = inflows.plus(d);
          outflows = outflows.plus(c);
        }
      }

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
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      const { start, end } = getDateRange(dateRange);
      const startStr = start.split('T')[0];
      const endStr = end.split('T')[0];

      const list = await getAuthoritativeSpendingByCategory(
        supabase as any,
        userData.user.id,
        startStr,
        endStr
      );

      return list.map((item) => ({
        category: item.name,
        amount: new Decimal(item.value),
      }));
    },
  });
}

export function useThirdPartyReport(dateRange: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-third-party', dateRange],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data } = await supabase
        .from('third_party_funds')
        .select('amount, amount_used, amount_returned, status')
        .eq('user_id', userData.user.id);

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
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data } = await supabase
        .from('ipo_applications')
        .select('*, ipo:ipos(name, issue_price)')
        .eq('user_id', userData.user.id);

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
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data } = await supabase
        .from('investments')
        .select('invested_amount, current_value, name, type')
        .eq('user_id', userData.user.id);

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
      const { data: userData, error: authError } = await supabase.auth.getUser();
      if (authError || !userData.user) throw new Error('Not authenticated');

      const summary = await getPeopleAuthoritativeSummary(supabase as any, userData.user.id);

      return {
        receivables: new Decimal(summary.totalReceivable),
        payables: new Decimal(summary.totalPayable),
      };
    },
  });
}

export function useTaxReport(financialYear: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['report-tax', financialYear],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const parts = financialYear.replace('FY ', '').split('-');
      const fromYear = parseInt(parts[0]);
      const toYear = parseInt(parts[1].length === 2 ? `20${parts[1]}` : parts[1]);

      const start = new Date(fromYear, 3, 1).toISOString(); // April 1
      const end = new Date(toYear, 2, 31, 23, 59, 59).toISOString(); // March 31

      const [{ data: txns }, { data: taxRecords }] = await Promise.all([
        supabase.from('transactions').select('amount, type, category:transaction_categories(name)').eq('user_id', userData.user.id).gte('date', start).lte('date', end),
        supabase.from('tax_records').select('*').eq('user_id', userData.user.id).eq('financial_year', financialYear),
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
