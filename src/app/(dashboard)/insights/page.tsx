"use client";

import Link from "next/link";
import { useDashboardStats, useSpendingByCategory, useMonthlyTrend } from "@/lib/hooks/use-dashboard";
import { formatINR } from "@/lib/finance/money";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function InsightsPage() {
  const now = new Date();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: categories, isLoading: categoriesLoading } = useSpendingByCategory(
    now.getMonth() + 1,
    now.getFullYear()
  );
  const { data: trend, isLoading: trendLoading } = useMonthlyTrend(2);

  const income = stats?.thisMonthIncome || 0;
  const expenses = stats?.thisMonthExpenses || 0;
  const savings = stats?.totalSavings || 0;
  const investments = stats?.totalInvestments || 0;
  const loans =
    (stats as any)?.totalLoans ||
    (stats as any)?.loansOutstanding ||
    0;
  const savingsRate = income > 0 ? Math.round(((income - expenses) / income) * 100) : 0;

  // Month-over-month comparison for categories
  const prevMonth = trend && trend.length >= 2 ? trend[0] : null;
  const currMonth = trend && trend.length >= 2 ? trend[1] : null;
  const expenseChange =
    prevMonth && currMonth && prevMonth.expense > 0
      ? Math.round(((currMonth.expense - prevMonth.expense) / prevMonth.expense) * 100)
      : null;

  const topCategory = categories && categories.length > 0 ? categories[0] : null;

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-lg font-semibold">Insights</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {now.toLocaleString("default", { month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Spending insight */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Spending
        </p>

        {statsLoading || trendLoading ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : (
          <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                {expenseChange !== null ? (
                  <p className="text-sm text-foreground">
                    {expenseChange < 0
                      ? `You're spending ${Math.abs(expenseChange)}% less than last month.`
                      : expenseChange > 0
                      ? `Your spending is up ${expenseChange}% from last month.`
                      : "Your spending is on par with last month."}
                  </p>
                ) : (
                  <p className="text-sm text-foreground">
                    {expenses > 0
                      ? "Track more months to see spending trends."
                      : "No expenses recorded yet this month."}
                  </p>
                )}
                <p className="mt-1 text-2xl font-semibold font-tabular-nums text-expense">
                  {formatINR(expenses)}
                </p>
              </div>
              {expenseChange !== null && (
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                    expenseChange < 0
                      ? "bg-income text-income"
                      : "bg-expense text-expense"
                  )}
                >
                  {expenseChange < 0 ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingUp className="h-3.5 w-3.5" />
                  )}
                  {Math.abs(expenseChange)}%
                </div>
              )}
            </div>
            {topCategory && (
              <p className="text-xs text-muted-foreground border-t border-border/60 pt-3">
                Highest spend:{" "}
                <span className="font-medium text-foreground">{topCategory.name}</span>{" "}
                at {formatINR(topCategory.value)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Savings rate */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Savings rate
        </p>
        {statsLoading ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : income > 0 ? (
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-baseline gap-3">
              <span
                className={cn(
                  "text-4xl font-light font-tabular-nums",
                  savingsRate >= 20
                    ? "text-income"
                    : savingsRate >= 10
                    ? "text-caution"
                    : "text-expense"
                )}
              >
                {savingsRate}%
              </span>
              <span className="text-sm text-muted-foreground">of income saved</span>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  savingsRate >= 20
                    ? "bg-[hsl(152,55%,36%)]"
                    : savingsRate >= 10
                    ? "bg-[hsl(38,65%,36%)]"
                    : "bg-[hsl(12,60%,40%)]"
                )}
                style={{ width: `${Math.min(100, savingsRate)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {savingsRate >= 20
                ? "Great savings discipline."
                : savingsRate >= 10
                ? "Good — aim for 20% or more."
                : "Try to reduce expenses to improve your savings rate."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 p-4">
            <p className="text-sm text-muted-foreground">
              Add income transactions to see your savings rate.
            </p>
          </div>
        )}
      </div>

      {/* Watch — top categories */}
      {!categoriesLoading && categories && categories.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            One thing to watch
          </p>
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-foreground">
                  <span className="font-medium">{categories[0].name}</span> is your
                  biggest spend this month.
                </p>
                <p className="mt-1 text-2xl font-semibold font-tabular-nums text-expense">
                  {formatINR(categories[0].value)}
                </p>
              </div>
            </div>
            {categories.length > 1 && (
              <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
                {categories.slice(1, 4).map((cat) => (
                  <div key={cat.name} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{cat.name}</span>
                    <span className="font-medium font-tabular-nums text-expense">
                      {formatINR(cat.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Advanced intelligence — progressive disclosure */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Financial intelligence
        </p>
        <div className="rounded-xl border border-border/60 bg-card divide-y divide-border/60 overflow-hidden">
          {/* Investments */}
          <Link
            href="/investments"
            className="flex items-center justify-between px-4 py-4 hover:bg-muted/40 transition-colors min-h-[56px]"
          >
            <div>
              <p className="text-sm font-medium text-foreground">Investments</p>
              {statsLoading ? (
                <Skeleton className="mt-0.5 h-4 w-20" />
              ) : (
                <p className="text-sm text-balance font-tabular-nums font-semibold">
                  {formatINR(investments)}
                </p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>

          {/* Savings goals */}
          <Link
            href="/savings-goals"
            className="flex items-center justify-between px-4 py-4 hover:bg-muted/40 transition-colors min-h-[56px]"
          >
            <div>
              <p className="text-sm font-medium text-foreground">Savings goals</p>
              {statsLoading ? (
                <Skeleton className="mt-0.5 h-4 w-20" />
              ) : (
                <p className="text-sm text-income font-tabular-nums font-semibold">
                  {formatINR(savings)}
                </p>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>

          {/* Tax */}
          <Link
            href="/tax-records"
            className="flex items-center justify-between px-4 py-4 hover:bg-muted/40 transition-colors min-h-[56px]"
          >
            <div>
              <p className="text-sm font-medium text-foreground">Tax records</p>
              <p className="text-xs text-muted-foreground">View and manage records</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>

          {/* Reports */}
          <Link
            href="/reports"
            className="flex items-center justify-between px-4 py-4 hover:bg-muted/40 transition-colors min-h-[56px]"
          >
            <div>
              <p className="text-sm font-medium text-foreground">Detailed reports</p>
              <p className="text-xs text-muted-foreground">Charts, trends & analytics</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </div>
    </div>
  );
}
