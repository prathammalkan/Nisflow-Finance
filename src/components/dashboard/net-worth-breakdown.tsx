import { formatINR } from '@/lib/finance/money';
import Decimal from 'decimal.js';
import { useDashboardStats } from '@/lib/hooks/use-dashboard';

export function NetWorthBreakdown() {
  const { data: stats, isLoading } = useDashboardStats();

  const safeNum = (n: number | undefined | null) => new Decimal(n ?? 0);

  const personalCash = safeNum(stats?.availablePersonalCash);
  const investments = safeNum(stats?.totalInvestments);
  const savings = safeNum(stats?.totalSavings);
  const receivables = safeNum(stats?.totalReceivables);
  const payables = safeNum(stats?.totalPayables);
  const thirdParty = safeNum(stats?.thirdPartyHeld);
  const netWorth = safeNum(stats?.personalNetWorth);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 className="text-xl font-bold mb-6 text-gray-900">What Do I Actually Have?</h2>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <span className="text-gray-600">Personal Cash &amp; Liquid</span>
            <span className="font-semibold text-gray-900">{formatINR(personalCash)}</span>
          </div>
          {savings.gt(0) && (
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Savings Accounts</span>
              <span className="font-semibold text-gray-900">{formatINR(savings)}</span>
            </div>
          )}
          {investments.gt(0) && (
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Investments</span>
              <span className="font-semibold text-gray-900">{formatINR(investments)}</span>
            </div>
          )}
          {receivables.gt(0) && (
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Receivables (money owed to me)</span>
              <span className="font-semibold text-emerald-600">+{formatINR(receivables)}</span>
            </div>
          )}
          {payables.gt(0) && (
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Payables (I owe)</span>
              <span className="font-semibold text-red-600">-{formatINR(payables)}</span>
            </div>
          )}
          {thirdParty.gt(0) && (
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-400">Third-Party Funds Held (Excluded from net worth)</span>
              <span className="text-gray-400">{formatINR(thirdParty)}</span>
            </div>
          )}

          {stats?.totalAccounts === 0 ? (
            <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-gray-100">
              <span className="text-sm text-gray-400">Add an account to track your net worth.</span>
              <span className="font-bold text-xl text-gray-300">₹0</span>
            </div>
          ) : (
            <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-gray-100">
              <span className="font-bold text-lg text-gray-900">Actual Personal Net Worth</span>
              <span className={`font-bold text-2xl ${netWorth.gte(0) ? 'text-blue-600' : 'text-red-600'}`}>
                {formatINR(netWorth)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
