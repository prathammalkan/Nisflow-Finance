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
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
      <h2 className="text-lg sm:text-xl font-bold mb-6 text-foreground">What Do I Actually Have?</h2>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4 text-xs sm:text-sm">
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-muted-foreground">Personal Cash &amp; Liquid</span>
            <span className="font-semibold text-foreground">{formatINR(personalCash)}</span>
          </div>
          {savings.gt(0) && (
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Savings Accounts</span>
              <span className="font-semibold text-foreground">{formatINR(savings)}</span>
            </div>
          )}
          {investments.gt(0) && (
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Investments</span>
              <span className="font-semibold text-foreground">{formatINR(investments)}</span>
            </div>
          )}
          {receivables.gt(0) && (
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Receivables (money owed to me)</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{formatINR(receivables)}</span>
            </div>
          )}
          {payables.gt(0) && (
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground">Payables (I owe)</span>
              <span className="font-semibold text-rose-600 dark:text-rose-400">-{formatINR(payables)}</span>
            </div>
          )}
          {thirdParty.gt(0) && (
            <div className="flex justify-between items-center py-2 border-b border-border">
              <span className="text-muted-foreground/70">Third-Party Funds Held (Excluded from net worth)</span>
              <span className="text-muted-foreground/70">{formatINR(thirdParty)}</span>
            </div>
          )}

          {stats?.totalAccounts === 0 ? (
            <div className="flex justify-between items-center pt-4 mt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">Add an account to track your net worth.</span>
              <span className="font-bold text-lg text-muted-foreground">₹0</span>
            </div>
          ) : (
            <div className="flex justify-between items-center pt-4 mt-2 border-t border-border">
              <span className="font-bold text-base sm:text-lg text-foreground">Actual Personal Net Worth</span>
              <span className={`font-bold text-xl sm:text-2xl ${netWorth.gte(0) ? 'text-primary' : 'text-rose-600'}`}>
                {formatINR(netWorth)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
