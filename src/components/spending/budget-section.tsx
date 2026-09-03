"use client";

import { useState } from "react";
import { formatINR } from "@/lib/finance/money";
import { useBudgetSummary, useBudgets } from "@/lib/hooks/use-budgets";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PlusCircle, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { BudgetForm } from "@/components/spending/budget-form";

export function BudgetSection() {
  const [date, setDate] = useState(new Date());
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const { data: budgets, isLoading: isBudgetsLoading } = useBudgets(month, year);
  const { totalAllocated, totalSpent, remaining, isLoading: isSummaryLoading } = useBudgetSummary(month, year);

  const isLoading = isBudgetsLoading || isSummaryLoading;
  const progressPercent = totalAllocated > 0 ? Math.min(100, (totalSpent / totalAllocated) * 100) : 0;
  
  const overallStatus = progressPercent >= 100 ? "over" : progressPercent >= 85 ? "warning" : "good";

  return (
    <div className="mt-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Monthly Budget</h2>
          <p className="text-sm text-muted-foreground">
            Track your spending limits for {date.toLocaleString('default', { month: 'long' })} {year}
          </p>
        </div>
        <Button onClick={() => setIsFormOpen(true)} variant="outline">
          <PlusCircle className="mr-2 h-4 w-4" />
          Set Budget
        </Button>
      </div>

      {!isLoading && (!budgets || budgets.length === 0) ? (
        <div className="p-8 text-center border border-dashed rounded-lg bg-card">
          <p className="text-muted-foreground mb-4">No budget set for this month.</p>
          <Button onClick={() => setIsFormOpen(true)}>Create Budget</Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-12">
          {/* Summary Card */}
          <div className="md:col-span-4 space-y-4">
            <div className="bg-card border rounded-lg p-5 shadow-sm">
              <h3 className="font-medium text-sm text-muted-foreground mb-4">Overall Budget</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Spent</span>
                    <span className="font-medium">{formatINR(totalSpent)}</span>
                  </div>
                  <Progress 
                    value={progressPercent} 
                    className={`h-2 ${overallStatus === 'over' ? 'bg-red-500' : overallStatus === 'warning' ? 'bg-amber-500' : 'bg-green-500'}`} 
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0</span>
                    <span>{formatINR(totalAllocated)}</span>
                  </div>
                </div>

                <div className="pt-4 border-t flex justify-between items-center">
                  <span className="text-sm font-medium">Remaining</span>
                  <span className={`text-lg font-bold ${remaining < 0 ? 'text-red-500' : 'text-green-500'}`}>
                    {formatINR(Math.max(0, remaining))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Categories List */}
          <div className="md:col-span-8 bg-card border rounded-lg shadow-sm">
            <div className="p-4 border-b bg-muted/20">
              <h3 className="font-medium">Category Breakdown</h3>
            </div>
            <div className="divide-y">
              {isLoading ? (
                <div className="p-4 space-y-4">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded"></div>)}
                </div>
              ) : budgets?.map(budget => {
                const spent = budget.spent_amount || 0;
                const allocated = budget.allocated_amount || 0;
                const percent = allocated > 0 ? Math.min(100, (spent / allocated) * 100) : 0;
                const isOver = spent > allocated;
                const isWarning = percent >= 85 && !isOver;

                return (
                  <div key={budget.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{budget.category}</span>
                        {isOver ? (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        ) : isWarning ? (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">{formatINR(spent)}</span>
                        <span className="text-muted-foreground mx-1">/</span>
                        <span className="text-muted-foreground">{formatINR(allocated)}</span>
                      </div>
                    </div>
                    <Progress 
                      value={percent} 
                      className={`h-1.5 ${isOver ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-green-500'}`} 
                    />
                  </div>
                );
              })}
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
