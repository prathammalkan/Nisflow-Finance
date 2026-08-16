"use client";

import { useState } from "react";
import { formatINR } from "@/lib/finance/money";
import { useSavingsGoals } from "@/lib/hooks/use-savings-goals";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SavingsGoalForm } from "@/components/savings/savings-goal-form";
import { PlusCircle, Target, TrendingUp, Calendar, AlertCircle } from "lucide-react";

export default function SavingsGoalsPage() {
  const { data: goals, isLoading } = useSavingsGoals();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState<any>(null);

  const handleCreate = () => {
    setSelectedGoal(null);
    setIsFormOpen(true);
  };

  const handleEdit = (goal: any) => {
    setSelectedGoal(goal);
    setIsFormOpen(true);
  };

  const totalSaved = goals?.reduce((sum, g) => sum + (Number(g.current_amount) || 0), 0) || 0;
  const completedGoals = goals?.filter(g => g.progress >= 100).length || 0;
  const activeGoals = goals?.filter(g => g.status === "active").length || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Savings Goals</h2>
          <p className="text-muted-foreground mt-1">
            Track and manage your savings goals.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <PlusCircle className="mr-2 h-4 w-4" />
          New Goal
        </Button>
      </div>

      {!isLoading && goals && goals.length > 0 && (
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div className="p-4 bg-card rounded-lg border shadow-sm">
            <div className="text-sm font-medium text-muted-foreground">Total Saved</div>
            <div className="text-2xl font-bold mt-1">{formatINR(totalSaved)}</div>
          </div>
          <div className="p-4 bg-card rounded-lg border shadow-sm">
            <div className="text-sm font-medium text-muted-foreground">Active Goals</div>
            <div className="text-2xl font-bold mt-1">{activeGoals}</div>
          </div>
          <div className="p-4 bg-card rounded-lg border shadow-sm">
            <div className="text-sm font-medium text-muted-foreground">Completed</div>
            <div className="text-2xl font-bold mt-1">{completedGoals}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-lg bg-muted animate-pulse"></div>
          ))}
        </div>
      ) : goals?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-dashed">
          <Target className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No savings goals</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Create a goal to start tracking your savings.
          </p>
          <Button onClick={handleCreate}>
            <PlusCircle className="mr-2 h-4 w-4" />
            New Goal
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {goals?.map((goal) => {
            const progressColor = goal.progress >= 100 ? "bg-green-500" : goal.progress > 70 ? "bg-green-500" : goal.progress > 30 ? "bg-amber-500" : "bg-red-500";
            
            let daysRemaining = 0;
            if (goal.deadline) {
              const diffTime = new Date(goal.deadline).getTime() - new Date().getTime();
              daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }

            return (
              <div 
                key={goal.id} 
                className="bg-card rounded-lg border shadow-sm p-5 hover:border-primary/50 transition-colors cursor-pointer flex flex-col"
                onClick={() => handleEdit(goal)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="p-2 rounded-md text-white"
                      style={{ backgroundColor: goal.color || "#3b82f6" }}
                    >
                      <Target className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold line-clamp-1">{goal.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                        goal.status === "completed" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        goal.status === "paused" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}>
                        {goal.status || "Active"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 mt-auto">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{formatINR(goal.current_amount || 0)}</span>
                    <span className="text-muted-foreground">{formatINR(goal.target_amount || 0)}</span>
                  </div>
                  
                  <Progress value={goal.progress} className={`h-2 ${progressColor}`} />
                  
                  <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t">
                    <span className="flex items-center">
                      <TrendingUp className="mr-1 h-3 w-3" />
                      {goal.progress.toFixed(0)}%
                    </span>
                    {goal.deadline && daysRemaining > 0 && (
                      <span className="flex items-center">
                        <Calendar className="mr-1 h-3 w-3" />
                        {daysRemaining} days left
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SavingsGoalForm 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        initialData={selectedGoal} 
      />
    </div>
  );
}
