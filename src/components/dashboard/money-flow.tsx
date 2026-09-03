'use client';

import { useDashboardStats } from '@/lib/hooks/use-dashboard';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';

export function MoneyFlow() {
  const { data: stats, isLoading } = useDashboardStats();

  const safeNum = (n: number | undefined | null) => new Decimal(n ?? 0);

  const income = safeNum(stats?.thisMonthIncome);
  const expenses = safeNum(stats?.thisMonthExpenses);
  const savings = safeNum(stats?.thisMonthSavings);
  const investments = safeNum(stats?.thisMonthInvestments);

  const essential = expenses;
  const isEmpty = income.isZero() && expenses.isZero() && savings.isZero() && investments.isZero();

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <h2 className="text-lg sm:text-xl font-bold mb-6 text-foreground">This Month&apos;s Money Flow</h2>

      {isLoading ? (
        <div className="h-28 bg-muted/30 rounded-xl animate-pulse" />
      ) : isEmpty ? (
        <div className="flex items-center justify-center h-28 bg-muted/20 rounded-xl border border-dashed border-border text-muted-foreground text-xs sm:text-sm">
          No transactions recorded this month. Add a transaction to see money flow.
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 bg-muted/20 p-4 sm:p-6 rounded-xl border border-border">
          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-950 dark:text-emerald-200 p-3 sm:p-4 rounded-xl text-center min-w-[120px] shadow-sm flex-1">
            <div className="font-semibold text-xs text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Income</div>
            <div className="font-bold text-sm sm:text-base mt-1 text-foreground">{formatINR(income)}</div>
          </div>

          <div className="text-muted-foreground font-bold text-lg hidden sm:block">→</div>

          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-950 dark:text-rose-200 p-3 sm:p-4 rounded-xl text-center min-w-[120px] shadow-sm flex-1">
            <div className="font-semibold text-xs text-rose-700 dark:text-rose-400 uppercase tracking-wide">Expenses</div>
            <div className="font-bold text-sm sm:text-base mt-1 text-foreground">{formatINR(essential)}</div>
          </div>

          <div className="text-muted-foreground font-bold text-lg hidden sm:block">→</div>

          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-950 dark:text-blue-200 p-3 sm:p-4 rounded-xl text-center min-w-[120px] shadow-sm flex-1">
            <div className="font-semibold text-xs text-blue-700 dark:text-blue-400 uppercase tracking-wide">Savings</div>
            <div className="font-bold text-sm sm:text-base mt-1 text-foreground">{formatINR(savings)}</div>
          </div>

          <div className="text-muted-foreground font-bold text-lg hidden sm:block">→</div>

          <div className="bg-violet-500/10 border border-violet-500/20 text-violet-950 dark:text-violet-200 p-3 sm:p-4 rounded-xl text-center min-w-[120px] shadow-sm flex-1">
            <div className="font-semibold text-xs text-violet-700 dark:text-violet-400 uppercase tracking-wide">Investments</div>
            <div className="font-bold text-sm sm:text-base mt-1 text-foreground">{formatINR(investments)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
