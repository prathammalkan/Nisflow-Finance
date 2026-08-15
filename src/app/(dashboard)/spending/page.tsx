'use client';

import { useDashboardStats, useSpendingByCategory, useDailySpending, useRecentTransactions } from '@/lib/hooks/use-dashboard';
import { formatINR } from '@/lib/finance/money';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, LineChart, Line } from 'recharts';
import { format } from 'date-fns';
import { Wallet } from 'lucide-react';
import { BudgetSection } from '@/components/spending/budget-section';

export default function SpendingPage() {
  const now = new Date();
  
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: categories, isLoading: categoriesLoading } = useSpendingByCategory(now.getMonth() + 1, now.getFullYear());
  const { data: dailySpending, isLoading: dailyLoading } = useDailySpending(30);
  const { data: recentTransactions, isLoading: recentLoading } = useRecentTransactions(50); // Get more to filter expenses

  // Compute stats
  const thisMonthSpending = stats?.thisMonthExpenses || 0;
  
  // Calculate today's spending from daily spending
  const todayStr = now.toISOString().substring(0, 10);
  const todaySpending = dailySpending?.find(d => d.date === todayStr)?.amount || 0;
  
  // Calculate this week's spending (last 7 days from daily spending for simplicity)
  const thisWeekSpending = dailySpending?.slice(-7).reduce((sum, day) => sum + day.amount, 0) || 0;
  
  // Daily average for this month
  const daysInMonth = now.getDate();
  const dailyAverage = thisMonthSpending / Math.max(1, daysInMonth);

  // Largest transactions this month (expenses only)
  const largestTransactions = recentTransactions
    ?.filter(tx => tx.type === 'expense')
    .sort((a, b) => Number(b.amount) - Number(a.amount))
    .slice(0, 5) || [];

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Spending Analysis</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Today's Spending"
          value={formatINR(todaySpending)}
          icon={Wallet}
        />
        <StatCard
          title="This Week's Spending"
          value={formatINR(thisWeekSpending)}
          icon={Wallet}
        />
        <StatCard
          title="This Month's Spending"
          value={formatINR(thisMonthSpending)}
          icon={Wallet}
        />
        <StatCard
          title="Daily Average"
          value={formatINR(dailyAverage)}
          icon={Wallet}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {categoriesLoading ? (
              <Skeleton className="h-full w-full" />
            ) : categories && categories.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                  <XAxis type="number" tickFormatter={(val) => `₹${(val/1000).toFixed(0)}k`} className="text-xs text-muted-foreground" />
                  <YAxis dataKey="name" type="category" width={100} className="text-xs text-muted-foreground" />
                  <Tooltip formatter={(value: any) => formatINR(Number(value))} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Daily Spending Trend (30 Days)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {dailyLoading ? (
              <Skeleton className="h-full w-full" />
            ) : dailySpending && dailySpending.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailySpending} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => { try { return format(new Date(val), 'MMM dd'); } catch { return String(val); } }} 
                    className="text-xs text-muted-foreground" 
                  />
                  <YAxis 
                    tickFormatter={(val) => `₹${(val/1000).toFixed(0)}k`} 
                    className="text-xs text-muted-foreground" 
                  />
                  <Tooltip 
                    formatter={(value: any) => formatINR(Number(value))}
                    labelFormatter={(label: any) => { try { return format(new Date(String(label)), 'MMM dd, yyyy'); } catch { return String(label); } }}
                  />
                  <Line type="monotone" dataKey="amount" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
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
            <CardTitle>Largest Transactions This Month</CardTitle>
          </CardHeader>
          <CardContent>
            {recentLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : largestTransactions.length > 0 ? (
              <div className="space-y-4">
                {largestTransactions.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium">{tx.description || 'Unnamed Transaction'}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.category?.name || 'Uncategorized'} • {(() => { try { return format(new Date(tx.date), 'MMM dd'); } catch { return String(tx.date); } })()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-500">
                        -{formatINR(tx.amount)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-4">No large transactions</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {categoriesLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : categories && categories.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/50 uppercase">
                    <tr>
                      <th className="px-4 py-2 rounded-tl-md">Category</th>
                      <th className="px-4 py-2 text-right">This Month</th>
                      <th className="px-4 py-2 text-right rounded-tr-md">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-4 py-3 font-medium">{cat.name}</td>
                        <td className="px-4 py-3 text-right">{formatINR(cat.value)}</td>
                        <td className="px-4 py-3 text-right">
                          {thisMonthSpending > 0 ? ((cat.value / thisMonthSpending) * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground py-4">No category data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <BudgetSection />
    </div>
  );
}
