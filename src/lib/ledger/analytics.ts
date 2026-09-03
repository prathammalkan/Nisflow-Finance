import { Decimal } from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.ts';
import { getPeopleAuthoritativeSummary } from './people.ts';
import { getLoansAuthoritativeSummary } from './loans.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface AuthoritativeDashboardStats {
  personalNetWorth: number;
  availablePersonalCash: number;
  totalSavings: number;
  totalInvestments: number;
  thisMonthIncome: number;
  thisMonthExpenses: number;
  thisMonthSavings: number;
  thisMonthInvestments: number;
  thirdPartyHeld: number;
  totalReceivables: number;
  totalPayables: number;
  totalLoanLiabilities: number;
  needsReviewCount: number;
  needsReviewValue: number;
  reconciledCount: number;
  totalAccounts: number;
}

export interface MonthlyTrendItem {
  date: string;
  income: number;
  expense: number;
}

export interface SpendingCategoryItem {
  name: string;
  value: number;
}

export interface DailySpendingItem {
  date: string;
  amount: number;
}

/**
 * Computes authoritative dashboard metrics derived exclusively from double-entry journal lines.
 */
export async function getAuthoritativeDashboardStats(
  supabase: SupabaseClient<Database>,
  userId: string,
  startOfCurrentMonth: string,
  endOfCurrentMonth: string
): Promise<AuthoritativeDashboardStats> {
  // 1. Fetch metadata entities concurrently
  const [
    { data: accounts },
    { data: thirdParty },
    { data: reviewTxns },
    peopleSummary,
    loansSummary,
    { data: ledgerAccounts, error: laErr },
    { data: journalLines, error: jlErr }
  ] = await Promise.all([
    (supabase.from('accounts') as any).select('*').eq('user_id', userId).eq('is_active', true),
    (supabase.from('third_party_funds') as any).select('*').eq('user_id', userId).neq('status', 'settled'),
    (supabase.from('transactions') as any).select('amount').eq('user_id', userId).eq('status', 'needs_review'),
    getPeopleAuthoritativeSummary(supabase, userId),
    getLoansAuthoritativeSummary(supabase, userId),
    (supabase.from('ledger_accounts') as any).select('*').eq('user_id', userId),
    (supabase.from('journal_lines') as any).select(`
      id,
      ledger_account_id,
      debit_amount,
      credit_amount,
      journal_entries!inner (
        id,
        transaction_date,
        source_type,
        status,
        user_id
      )
    `).eq('user_id', userId).in('journal_entries.status', ['posted', 'reversed'])
  ]);

  if (laErr) throw new Error(`Failed to query ledger accounts: ${laErr.message}`);
  if (jlErr) throw new Error(`Failed to query journal lines: ${jlErr.message}`);

  // 2. Map account balances by ledger account ID
  const accountBalanceMap = new Map<string, { debits: Decimal; credits: Decimal }>();
  for (const line of journalLines || []) {
    const accId = line.ledger_account_id;
    if (!accountBalanceMap.has(accId)) {
      accountBalanceMap.set(accId, { debits: new Decimal(0), credits: new Decimal(0) });
    }
    const curr = accountBalanceMap.get(accId)!;
    curr.debits = curr.debits.plus(new Decimal(line.debit_amount || 0));
    curr.credits = curr.credits.plus(new Decimal(line.credit_amount || 0));
  }

  // 3. Compute Bank / Cash / Investment Account Balances
  let availablePersonalCash = new Decimal(0);
  let totalSavings = new Decimal(0);
  let totalInvestments = new Decimal(0);
  let personalAccountsAssetTotal = new Decimal(0);
  let reconciledCount = 0;

  const accountsList = (accounts || []) as any[];
  for (const acc of accountsList) {
    if (acc.last_reconciled_at) {
      reconciledCount++;
    }

    // Match ledger account code: AST-ACC-<id>
    const la = (ledgerAccounts || []).find((l: any) => l.code === `AST-ACC-${acc.id}`);
    let balance = new Decimal(0);

    if (la && accountBalanceMap.has(la.id)) {
      const totals = accountBalanceMap.get(la.id)!;
      // Asset account: Balance = Debits - Credits
      balance = totals.debits.minus(totals.credits);
    }

    if (acc.ownership === 'personal') {
      personalAccountsAssetTotal = personalAccountsAssetTotal.plus(balance);

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
  }

  // 4. People Ledger Balances (Receivables & Payables)
  const totalReceivables = new Decimal(peopleSummary.totalReceivable);
  const totalPayables = new Decimal(peopleSummary.totalPayable);

  // 5. Loan Liabilities
  const totalLoanLiabilities = new Decimal(loansSummary.totalOutstandingPrincipal);

  // 6. Net Worth = Personal Assets - Personal Liabilities
  // Assets = Personal Bank/Cash/Investment Balances + Receivables (They Owe You)
  // Liabilities = Payables (You Owe Them) + Loan Debts
  const totalAssets = personalAccountsAssetTotal.plus(totalReceivables);
  const totalLiabilities = totalPayables.plus(totalLoanLiabilities);
  const personalNetWorth = totalAssets.minus(totalLiabilities);

  // 7. This Month Income & Expenses from double-entry journal lines
  let thisMonthIncome = new Decimal(0);
  let thisMonthExpenses = new Decimal(0);
  let thisMonthSavings = new Decimal(0);
  let thisMonthInvestments = new Decimal(0);

  const startDate = startOfCurrentMonth.split('T')[0];
  const endDate = endOfCurrentMonth.split('T')[0];

  for (const line of journalLines || []) {
    const entryDate = line.journal_entries.transaction_date;
    if (entryDate < startDate || entryDate > endDate) continue;

    const la = (ledgerAccounts || []).find((l: any) => l.id === line.ledger_account_id);
    if (!la) continue;

    const debits = new Decimal(line.debit_amount || 0);
    const credits = new Decimal(line.credit_amount || 0);

    if (la.account_type === 'income') {
      // Income = Credits - Debits on Income accounts
      thisMonthIncome = thisMonthIncome.plus(credits.minus(debits));
    } else if (la.account_type === 'expense') {
      // Expense = Debits - Credits on Expense accounts
      thisMonthExpenses = thisMonthExpenses.plus(debits.minus(credits));
    }
  }

  // 8. Third Party Funds
  let thirdPartyHeld = new Decimal(0);
  for (const tp of thirdParty || []) {
    thirdPartyHeld = thirdPartyHeld.plus(new Decimal(tp.amount || 0));
  }

  // 9. Needs Review Count & Value
  let needsReviewCount = 0;
  let needsReviewValue = new Decimal(0);
  for (const r of reviewTxns || []) {
    needsReviewCount++;
    needsReviewValue = needsReviewValue.plus(new Decimal(r.amount || 0));
  }

  return {
    personalNetWorth: personalNetWorth.toNumber(),
    availablePersonalCash: availablePersonalCash.toNumber(),
    totalSavings: totalSavings.toNumber(),
    totalInvestments: totalInvestments.toNumber(),
    thisMonthIncome: Decimal.max(0, thisMonthIncome).toNumber(),
    thisMonthExpenses: Decimal.max(0, thisMonthExpenses).toNumber(),
    thisMonthSavings: thisMonthSavings.toNumber(),
    thisMonthInvestments: thisMonthInvestments.toNumber(),
    thirdPartyHeld: thirdPartyHeld.toNumber(),
    totalReceivables: totalReceivables.toNumber(),
    totalPayables: totalPayables.toNumber(),
    totalLoanLiabilities: totalLoanLiabilities.toNumber(),
    needsReviewCount,
    needsReviewValue: needsReviewValue.toNumber(),
    reconciledCount,
    totalAccounts: accountsList.length,
  };
}

/**
 * Computes monthly income and expense trends directly from posted journal lines.
 */
export async function getAuthoritativeMonthlyTrend(
  supabase: SupabaseClient<Database>,
  userId: string,
  startDateIso: string
): Promise<MonthlyTrendItem[]> {
  const [
    { data: ledgerAccounts },
    { data: lines, error }
  ] = await Promise.all([
    (supabase.from('ledger_accounts') as any).select('id, account_type').eq('user_id', userId),
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
      .eq('user_id', userId)
      .in('journal_entries.status', ['posted', 'reversed'])
      .gte('journal_entries.transaction_date', startDateIso.split('T')[0])
  ]);

  if (error) throw new Error(`Failed to query monthly trends: ${error.message}`);

  const trendMap = new Map<string, { income: Decimal; expense: Decimal }>();
  const laTypeMap = new Map<string, string>();
  for (const la of ledgerAccounts || []) {
    laTypeMap.set(la.id, la.account_type);
  }

  for (const line of lines || []) {
    const monthKey = line.journal_entries.transaction_date.substring(0, 7); // YYYY-MM
    if (!trendMap.has(monthKey)) {
      trendMap.set(monthKey, { income: new Decimal(0), expense: new Decimal(0) });
    }

    const current = trendMap.get(monthKey)!;
    const accountType = laTypeMap.get(line.ledger_account_id);
    const debits = new Decimal(line.debit_amount || 0);
    const credits = new Decimal(line.credit_amount || 0);

    if (accountType === 'income') {
      current.income = current.income.plus(credits.minus(debits));
    } else if (accountType === 'expense') {
      current.expense = current.expense.plus(debits.minus(credits));
    }
  }

  return Array.from(trendMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({
      date,
      income: Decimal.max(0, values.income).toNumber(),
      expense: Decimal.max(0, values.expense).toNumber(),
    }));
}

/**
 * Computes category breakdown from posted expense journal lines.
 */
export async function getAuthoritativeSpendingByCategory(
  supabase: SupabaseClient<Database>,
  userId: string,
  startDateStr: string,
  endDateStr: string
): Promise<SpendingCategoryItem[]> {
  const [
    { data: ledgerAccounts },
    { data: categories },
    { data: lines, error }
  ] = await Promise.all([
    (supabase.from('ledger_accounts') as any).select('*').eq('user_id', userId).eq('account_type', 'expense'),
    (supabase.from('transaction_categories') as any).select('id, name'),
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
      .eq('user_id', userId)
      .in('journal_entries.status', ['posted', 'reversed'])
      .gte('journal_entries.transaction_date', startDateStr)
      .lte('journal_entries.transaction_date', endDateStr)
  ]);

  if (error) throw new Error(`Failed to query spending by category: ${error.message}`);

  const catNameMap = new Map<string, string>();
  for (const c of categories || []) {
    catNameMap.set(c.id, c.name);
  }

  const laMap = new Map<string, any>();
  for (const la of ledgerAccounts || []) {
    laMap.set(la.id, la);
  }

  const categoryTotals = new Map<string, Decimal>();

  for (const line of lines || []) {
    const la = laMap.get(line.ledger_account_id);
    if (!la) continue;

    let categoryName = 'General Expense';
    if (la.entity_type === 'category' && la.entity_id && catNameMap.has(la.entity_id)) {
      categoryName = catNameMap.get(la.entity_id)!;
    } else if (la.entity_type === 'loan_interest') {
      categoryName = 'Loan Interest';
    } else if (la.name) {
      categoryName = la.name.replace(/^Expense:\s*/i, '');
    }

    const debits = new Decimal(line.debit_amount || 0);
    const credits = new Decimal(line.credit_amount || 0);
    const netExpense = debits.minus(credits);

    if (netExpense.gt(0)) {
      categoryTotals.set(
        categoryName,
        (categoryTotals.get(categoryName) || new Decimal(0)).plus(netExpense)
      );
    }
  }

  return Array.from(categoryTotals.entries())
    .map(([name, amount]) => ({ name, value: amount.toNumber() }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Computes daily spending for the past N days from posted expense journal lines.
 */
export async function getAuthoritativeDailySpending(
  supabase: SupabaseClient<Database>,
  userId: string,
  days: number
): Promise<DailySpendingItem[]> {
  const now = new Date();
  const start = new Date();
  start.setDate(now.getDate() - days + 1);
  const startStr = start.toISOString().split('T')[0];

  const [
    { data: ledgerAccounts },
    { data: lines, error }
  ] = await Promise.all([
    (supabase.from('ledger_accounts') as any).select('id').eq('user_id', userId).eq('account_type', 'expense'),
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
      .eq('user_id', userId)
      .in('journal_entries.status', ['posted', 'reversed'])
      .gte('journal_entries.transaction_date', startStr)
  ]);

  if (error) throw new Error(`Failed to query daily spending: ${error.message}`);

  const expAccIds = new Set((ledgerAccounts || []).map((l: any) => l.id));
  const dailyMap = new Map<string, Decimal>();

  for (const line of lines || []) {
    if (!expAccIds.has(line.ledger_account_id)) continue;

    const dayKey = line.journal_entries.transaction_date.substring(0, 10);
    const debits = new Decimal(line.debit_amount || 0);
    const credits = new Decimal(line.credit_amount || 0);
    const netExpense = debits.minus(credits);

    if (netExpense.gt(0)) {
      dailyMap.set(dayKey, (dailyMap.get(dayKey) || new Decimal(0)).plus(netExpense));
    }
  }

  const result: DailySpendingItem[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dayKey = d.toISOString().substring(0, 10);

    result.push({
      date: dayKey,
      amount: dailyMap.get(dayKey)?.toNumber() || 0,
    });
  }

  return result;
}
