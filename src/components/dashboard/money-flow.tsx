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

  // Determine essential vs discretionary: if no data, show both as zero
  // Essential = largest portion of expenses (we can't split without category data, show total expenses)
  const essential = expenses;

  const isEmpty = income.isZero() && expenses.isZero() && savings.isZero() && investments.isZero();

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-xl font-bold mb-6 text-gray-900">This Month's Money Flow</h2>

      {isLoading ? (
        <div className="h-28 bg-gray-50 rounded-xl animate-pulse" />
      ) : isEmpty ? (
        <div className="flex items-center justify-center h-28 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-400 text-sm">
          No transactions recorded this month. Add a transaction to see money flow.
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-50 p-6 rounded-xl border border-gray-100">
          <div className="bg-green-50 border border-green-200 text-green-900 p-4 rounded-lg text-center min-w-[120px] shadow-sm flex-1">
            <div className="font-semibold text-xs text-green-700 uppercase tracking-wide">Income</div>
            <div className="font-bold text-base mt-1">{formatINR(income)}</div>
          </div>

          <div className="text-gray-300 font-bold text-xl hidden sm:block">→</div>

          <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg text-center min-w-[120px] shadow-sm flex-1">
            <div className="font-semibold text-xs text-red-700 uppercase tracking-wide">Expenses</div>
            <div className="font-bold text-base mt-1">{formatINR(essential)}</div>
          </div>

          <div className="text-gray-300 font-bold text-xl hidden sm:block">→</div>

          <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-lg text-center min-w-[120px] shadow-sm flex-1">
            <div className="font-semibold text-xs text-blue-700 uppercase tracking-wide">Savings</div>
            <div className="font-bold text-base mt-1">{formatINR(savings)}</div>
          </div>

          <div className="text-gray-300 font-bold text-xl hidden sm:block">→</div>

          <div className="bg-violet-50 border border-violet-200 text-violet-900 p-4 rounded-lg text-center min-w-[120px] shadow-sm flex-1">
            <div className="font-semibold text-xs text-violet-700 uppercase tracking-wide">Investments</div>
            <div className="font-bold text-base mt-1">{formatINR(investments)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
