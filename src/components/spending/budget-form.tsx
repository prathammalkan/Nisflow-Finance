"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateBudget, useUpdateBudgetCategory } from "@/lib/hooks/use-budgets";
import { formatINR } from "@/lib/finance/money";

interface BudgetFormProps {
  isOpen: boolean;
  onClose: () => void;
  month: number;
  year: number;
  existingBudgets: any[];
}

const DEFAULT_CATEGORIES = [
  "Housing",
  "Food",
  "Transportation",
  "Utilities",
  "Insurance",
  "Medical",
  "Savings",
  "Personal",
  "Entertainment",
  "Education"
];

export function BudgetForm({ isOpen, onClose, month, year, existingBudgets }: BudgetFormProps) {
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [newCategory, setNewCategory] = useState("");

  const createMutation = useCreateBudget();
  const updateMutation = useUpdateBudgetCategory();

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      
      // Initialize with existing budgets
      existingBudgets.forEach(b => {
        initial[b.category] = b.allocated_amount.toString();
      });

      // Add default categories if they don't exist
      DEFAULT_CATEGORIES.forEach(cat => {
        if (initial[cat] === undefined) {
          initial[cat] = ""; // Empty string for better UX (no default 0)
        }
      });

      setBudgets(initial);
    }
  }, [isOpen, existingBudgets]);

  const handleAmountChange = (category: string, amount: string) => {
    setBudgets(prev => ({ ...prev, [category]: amount }));
  };

  const handleAddCategory = () => {
    if (newCategory && budgets[newCategory] === undefined) {
      setBudgets(prev => ({ ...prev, [newCategory]: "" }));
      setNewCategory("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const promises = [];

    for (const [category, amountStr] of Object.entries(budgets)) {
      const amount = Number(amountStr);
      if (amount > 0) {
        const existing = existingBudgets.find(b => b.category === category);
        if (existing) {
          // Update
          if (existing.allocated_amount !== amount) {
            promises.push(updateMutation.mutateAsync({ id: existing.id, allocated_amount: amount }));
          }
        } else {
          // Create
          promises.push(createMutation.mutateAsync({
            month,
            year,
            category,
            allocated_amount: amount
          }));
        }
      }
    }

    try {
      await Promise.all(promises);
      onClose();
    } catch (error) {
      console.error("Failed to save budgets", error);
    }
  };

  const total = Object.values(budgets).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Set Budget for {new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden h-full">
          <div className="overflow-y-auto pr-4 py-4 space-y-4 flex-1">
            {Object.entries(budgets).map(([category, amount]) => (
              <div key={category} className="flex items-center gap-4">
                <Label htmlFor={`budget-${category}`} className="w-1/3 truncate" title={category}>
                  {category}
                </Label>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">₹</span>
                  <Input
                    id={`budget-${category}`}
                    type="number"
                    min="0"
                    step="1"
                    className="pl-8"
                    value={amount}
                    onChange={(e) => handleAmountChange(category, e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>
            ))}

            <div className="pt-4 border-t flex items-center gap-2">
              <Input
                placeholder="New Category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCategory();
                  }
                }}
              />
              <Button type="button" variant="secondary" onClick={handleAddCategory}>Add</Button>
            </div>
          </div>

          <div className="pt-4 border-t mt-4 flex items-center justify-between font-medium">
            <span>Total Budget</span>
            <span className="text-lg">{formatINR(total)}</span>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || total === 0}>
              {isPending ? "Saving..." : "Save Budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
