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
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-xl font-bold mb-6 text-gray-900">Financial Health</h2>
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-4 border border-gray-100 rounded-lg bg-gray-50 h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {metrics.map(({ label, value }) => (
            <div key={label} className="p-4 border border-gray-100 rounded-lg bg-gray-50 flex flex-col gap-1 hover:border-gray-200 transition-colors">
              <div className="text-xs font-medium text-gray-500">{label}</div>
              <div className="text-lg font-bold text-gray-900">{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
