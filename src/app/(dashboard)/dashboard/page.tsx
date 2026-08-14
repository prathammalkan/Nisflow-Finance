'use client';

import { useDashboardStats, useMonthlyTrend, useSpendingByCategory, useRecentTransactions } from '@/lib/hooks/use-dashboard';
import { formatINR } from '@/lib/finance/money';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Wallet, TrendingUp, TrendingDown, PiggyBank, BarChart3, Users, AlertCircle, CheckCircle2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { format } from 'date-fns';
import { FinancialHealth } from '@/components/dashboard/financial-health';
import { MoneyFlow } from '@/components/dashboard/money-flow';
import { NetWorthBreakdown } from '@/components/dashboard/net-worth-breakdown';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { cn } from '@/lib/utils';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: trend, isLoading: trendLoading } = useMonthlyTrend(6);
  const now = new Date();
  const { data: categories, isLoading: categoriesLoading } = useSpendingByCategory(now.getMonth() + 1, now.getFullYear());
  const { data: recent, isLoading: recentLoading } = useRecentTransactions(10);

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const needsOnboarding = !statsLoading && (stats?.totalAccounts || 0) === 0;

  return (
    <>
      {needsOnboarding && <OnboardingWizard />}
      <div className={cn("flex-1 space-y-4 p-4 md:p-8 pt-6", needsOnboarding && "blur-sm pointer-events-none select-none")}>
        <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="text-muted-foreground">{greeting()}</div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
        ) : (
          <>
            <StatCard
              title="Personal Net Worth"
              value={formatINR(stats?.personalNetWorth || 0)}
              icon={Wallet}
              className="border-primary/20 bg-primary/5"
            />
            <StatCard
              title="Available Cash"
              value={formatINR(stats?.availablePersonalCash || 0)}
              icon={Wallet}
            />
            <StatCard
              title="This Month Income"
              value={formatINR(stats?.thisMonthIncome || 0)}
              icon={TrendingUp}
            />
            <StatCard
              title="This Month Expenses"
              value={formatINR(stats?.thisMonthExpenses || 0)}
              icon={TrendingDown}
            />
            
            <StatCard
              title="Savings"
              value={formatINR(stats?.totalSavings || 0)}
              icon={PiggyBank}
            />
            <StatCard
              title="Investments"
              value={formatINR(stats?.totalInvestments || 0)}
              icon={BarChart3}
            />
            <StatCard
              title="Third-Party Money Held"
              value={formatINR(stats?.thirdPartyHeld || 0)}
              icon={Users}
              className={(stats?.thirdPartyHeld || 0) > 0 ? "border-amber-500/20 bg-amber-500/5" : ""}
            />
            <StatCard
              title="Needs Review"
              value={stats?.needsReviewCount?.toString() || "0"}
              icon={AlertCircle}
              className={(stats?.needsReviewCount || 0) > 0 ? "border-red-500/20 bg-red-500/5" : ""}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Income vs Expenses (6 Months)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {trendLoading ? (
              <Skeleton className="h-full w-full" />
            ) : trend && trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="date" tickFormatter={(val) => format(new Date(val), 'MMM yyyy')} className="text-xs text-muted-foreground" />
                  <YAxis className="text-xs text-muted-foreground" tickFormatter={(val) => `₹${(val/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: any) => formatINR(Number(value))} labelFormatter={(label: any) => format(new Date(String(label)), 'MMMM yyyy')} />
                  <Area type="monotone" dataKey="income" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Income" />
                  <Area type="monotone" dataKey="expense" stackId="2" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} name="Expense" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {categoriesLoading ? (
              <Skeleton className="h-full w-full" />
            ) : categories && categories.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categories.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {categories.slice(0, 5).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatINR(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownRight className="h-5 w-5 text-emerald-500" />
              Who owes you (Receivables)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Receivables</span>
                  <span className="font-bold text-emerald-500">{formatINR(stats?.totalReceivables || 0)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-red-500" />
              Who you owe (Payables)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Payables</span>
                  <span className="font-bold text-red-500">{formatINR(stats?.totalPayables || 0)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : recent && recent.length > 0 ? (
            <div className="space-y-4 overflow-x-auto min-w-full">
              <div className="min-w-[400px]">
                {recent.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{tx.description || 'Unnamed Transaction'}</p>
                    <p className="text-xs text-muted-foreground">
                      {tx.account?.name || 'Unknown Account'} • {format(new Date(tx.date), 'MMM dd, yyyy')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${tx.type === 'income' ? 'text-emerald-500' : tx.type === 'expense' ? 'text-red-500' : ''}`}>
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}{formatINR(tx.amount)}
                    </p>
                    {tx.status === 'needs_review' && (
                      <Badge variant="destructive" className="text-[10px] mt-1">Review</Badge>
                    )}
                  </div>
                </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground py-4">No recent transactions</div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-lg border bg-card p-4 text-sm">
        <div className="flex items-center gap-2">
          {stats?.reconciledCount === stats?.totalAccounts && (stats?.totalAccounts || 0) > 0 ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-500" />
          )}
          <span>Reconciliation Status</span>
        </div>
        <div className="text-muted-foreground">
          {statsLoading ? <Skeleton className="h-4 w-16" /> : `${stats?.reconciledCount || 0} of ${stats?.totalAccounts || 0} accounts reconciled`}
        </div>
      </div>

      <FinancialHealth />
      <MoneyFlow />
      <NetWorthBreakdown />
      </div>
    </>
  );
}
