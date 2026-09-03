'use client';

import { useDashboardStats } from '@/lib/hooks/use-dashboard';
import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';

export function FinancialHealth() {
  const { data: stats, isLoading } = useDashboardStats();

  const safeNum = (n: number | undefined | null) => new Decimal(n ?? 0);

  const income = safeNum(stats?.thisMonthIncome);
  const expenses = safeNum(stats?.thisMonthExpenses);
  const savings = safeNum(stats?.thisMonthSavings);
  const investments = safeNum(stats?.thisMonthInvestments);

  const savingsRate = income.gt(0) ? savings.div(income).times(100).toFixed(1) + '%' : '—';
  const spendingRate = income.gt(0) ? expenses.div(income).times(100).toFixed(1) + '%' : '—';
  const investmentRate = income.gt(0) ? investments.div(income).times(100).toFixed(1) + '%' : '—';

  const metrics = [
    { label: 'Savings Rate', value: savingsRate },
    { label: 'Spending Rate', value: spendingRate },
    { label: 'Investment Rate', value: investmentRate },
    { label: 'Receivables', value: stats ? formatINR(safeNum(stats.totalReceivables)) : '—' },
    { label: 'Payables', value: stats ? formatINR(safeNum(stats.totalPayables)) : '—' },
    { label: 'Third-Party Held', value: stats ? formatINR(safeNum(stats.thirdPartyHeld)) : '—' },
    { label: 'Needs Review', value: stats ? `${stats.needsReviewCount} txns` : '—' },
    { label: 'Total Accounts', value: stats ? `${stats.totalAccounts}` : '—' },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <h2 className="text-lg sm:text-xl font-bold mb-6 text-foreground">Financial Health</h2>
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-4 border border-border rounded-lg bg-muted/40 h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map(({ label, value }) => (
            <div key={label} className="p-4 border border-border rounded-lg bg-muted/20 flex flex-col gap-1 hover:border-border/80 transition-colors">
              <div className="text-xs font-medium text-muted-foreground">{label}</div>
              <div className="text-base sm:text-lg font-bold text-foreground">{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
