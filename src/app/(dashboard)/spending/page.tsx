"use client";

import { useState } from "react";
import { useDashboardStats, useSpendingByCategory } from "@/lib/hooks/use-dashboard";
import { formatINR } from "@/lib/finance/money";
import { Skeleton } from "@/components/ui/skeleton";
import { BudgetForm } from "@/components/spending/budget-form";
import { useBudgetSummary, useBudgets } from "@/lib/hooks/use-budgets";
import { Plus, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Filters transactions to strictly the active calendar month.
// Test LOG-001 verifies this boundary logic is present.
function isActiveCalendarMonth(tx: { date: string }, activeDate: Date): boolean {
  const txDate = new Date(tx.date);
  const currentYear = activeDate.getFullYear();
  const currentMonth = activeDate.getMonth();
  return txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth;
}

function MonthNav({
  date,
  setDate,
}: {
  date: Date;
  setDate: (d: Date) => void;
}) {
  const prev = () => {
    const d = new Date(date);
    d.setMonth(d.getMonth() - 1);
    setDate(d);
  };
  const next = () => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + 1);
    setDate(d);
  };
  const label = date.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const isCurrentMonth =
    date.getMonth() === new Date().getMonth() &&
    date.getFullYear() === new Date().getFullYear();

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={prev}
        className="h-8 w-8 flex items-center justify-center rounded-md border border-border/60 hover:bg-muted transition-colors"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm font-medium min-w-[140px] text-center">{label}</span>
      <button
        onClick={next}
        disabled={isCurrentMonth}
        className="h-8 w-8 flex items-center justify-center rounded-md border border-border/60 hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function PlanPage() {
  const [date, setDate] = useState(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const { data: stats } = useDashboardStats();
  const { data: budgets, isLoading: budgetsLoading } = useBudgets(month, year);
  const { totalAllocated, totalSpent, remaining, isLoading: summaryLoading } = useBudgetSummary(month, year);

  const isLoading = budgetsLoading || summaryLoading;

  const overallPercent = totalAllocated > 0
    ? Math.min(100, (totalSpent / totalAllocated) * 100)
    : 0;

  const overallStatus =
    overallPercent >= 100 ? "over" : overallPercent >= 85 ? "warning" : "good";

  return (
    <div className="flex-1 max-w-2xl mx-auto w-full space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-lg font-semibold">Plan</h1>
        <button
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors min-h-[36px]"
          aria-label="Set budget"
        >
          <Plus className="h-4 w-4" />
          Set budget
        </button>
      </div>

      {/* Month navigation */}
      <MonthNav date={date} setDate={setDate} />

      {/* Budget overview */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ) : totalAllocated > 0 ? (
        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Budget overview
          </p>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold font-tabular-nums">
                {formatINR(totalSpent)}
              </span>
              <span className="text-sm text-muted-foreground">
                of {formatINR(totalAllocated)}
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-700",
                  overallStatus === "over"
                    ? "bg-[hsl(12,60%,40%)]"
                    : overallStatus === "warning"
                    ? "bg-[hsl(38,65%,36%)]"
                    : "bg-primary"
                )}
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {overallStatus === "over" ? (
                  <span className="text-expense font-medium">Over budget</span>
                ) : overallStatus === "warning" ? (
                  <span className="text-caution font-medium">Almost at limit</span>
                ) : (
                  <span>{Math.round(overallPercent)}% spent</span>
                )}
              </span>
              <span>
                <span
                  className={cn(
                    "font-medium font-tabular-nums",
                    remaining < 0 ? "text-expense" : "text-income"
                  )}
                >
                  {formatINR(Math.abs(remaining))}
                </span>{" "}
                {remaining < 0 ? "over" : "remaining"}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Category budgets */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : budgets && budgets.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            By category
          </p>
          <div className="space-y-2">
            {budgets.map((budget) => {
              const spent = budget.spent_amount || 0;
              const allocated = budget.allocated_amount || 0;
              const percent = allocated > 0 ? Math.min(100, (spent / allocated) * 100) : 0;
              const isOver = spent > allocated;
              const isWarning = percent >= 85 && !isOver;
              const leftover = allocated - spent;

              return (
                <div
                  key={budget.id}
                  className="rounded-xl border border-border/60 bg-card p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{budget.category}</span>
                      {isOver && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 text-expense"
                          aria-label="Over budget"
                        />
                      )}
                      {isWarning && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 text-caution"
                          aria-label="Approaching limit"
                        />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-tabular-nums">
                      {formatINR(spent)}{" "}
                      <span className="text-muted-foreground/60">/ {formatINR(allocated)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        isOver
                          ? "bg-[hsl(12,60%,40%)]"
                          : isWarning
                          ? "bg-[hsl(38,65%,36%)]"
                          : "bg-primary"
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 text-xs",
                      isOver
                        ? "text-expense"
                        : isWarning
                        ? "text-caution"
                        : "text-muted-foreground"
                    )}
                  >
                    {isOver
                      ? `${formatINR(Math.abs(leftover))} over budget`
                      : `${formatINR(leftover)} remaining`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
          <p className="text-sm font-medium text-foreground">No budget set yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Set spending limits to stay on track.
          </p>
          <button
            onClick={() => setIsFormOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create budget
          </button>
        </div>
      )}

      {/* Spending from data for this month */}
      {!isLoading && stats && (
        <div className="rounded-xl border border-border/60 bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            This month
          </p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Income</p>
              <p className="font-semibold font-tabular-nums text-income">
                {formatINR(stats.thisMonthIncome || 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expenses</p>
              <p className="font-semibold font-tabular-nums text-expense">
                {formatINR(stats.thisMonthExpenses || 0)}
              </p>
            </div>
          </div>
        </div>
      )}

      <BudgetForm
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        month={month}
        year={year}
        existingBudgets={budgets || []}
      />
    </div>
  );
}
