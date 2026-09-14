"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateBudget, useUpdateBudgetCategory } from "@/lib/hooks/use-budgets";
import { formatINR } from "@/lib/finance/money";
import { createClient } from "@/lib/supabase/client";

interface BudgetFormProps {
  isOpen: boolean;
  onClose: () => void;
  month: number;
  year: number;
  existingBudgets: any[];
}

interface Category {
  id: string;
  name: string;
  type: string;
}

export function BudgetForm({ isOpen, onClose, month, year, existingBudgets }: BudgetFormProps) {
  // Map of category_id → amount string
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  const createMutation = useCreateBudget();
  const updateMutation = useUpdateBudgetCategory();

  // Load available expense categories from DB
  useEffect(() => {
    if (!isOpen) return;
    setLoadingCategories(true);
    const supabase = createClient();
    supabase
      .from("categories")
      .select("id, name, type")
      .eq("type", "expense")
      .order("name")
      .then(({ data }) => {
        setCategories((data as any[]) || []);
        setLoadingCategories(false);
      });
  }, [isOpen]);

  // Initialise amounts from existing budgets once categories are loaded
  useEffect(() => {
    if (!isOpen || categories.length === 0) return;
    const initial: Record<string, string> = {};
    existingBudgets.forEach((b) => {
      initial[b.category_id] = (b.allocated_amount ?? "").toString();
    });
    setBudgets(initial);
  }, [isOpen, existingBudgets, categories]);

  const handleAmountChange = (categoryId: string, amount: string) => {
    setBudgets((prev) => ({ ...prev, [categoryId]: amount }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const promises: Promise<any>[] = [];

    for (const [categoryId, amountStr] of Object.entries(budgets)) {
      const amount = Number(amountStr);
      if (amount > 0) {
        const existing = existingBudgets.find((b) => b.category_id === categoryId);
        if (existing) {
          if (existing.allocated_amount !== amount) {
            promises.push(
              updateMutation.mutateAsync({ id: existing.id, allocated_amount: amount })
            );
          }
        } else {
          promises.push(
            createMutation.mutateAsync({ month, year, category_id: categoryId, allocated_amount: amount })
          );
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
          <DialogTitle>
            Set Budget for{" "}
            {new Date(year, month - 1).toLocaleString("default", {
              month: "long",
              year: "numeric",
            })}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col overflow-hidden h-full">
          <div className="overflow-y-auto pr-1 py-4 space-y-4 flex-1">
            {loadingCategories ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Loading categories…
              </p>
            ) : categories.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No expense categories found. Add categories first.
              </p>
            ) : (
              categories.map((cat) => (
                <div key={cat.id} className="flex items-center gap-4">
                  <Label
                    htmlFor={`budget-${cat.id}`}
                    className="w-1/3 truncate text-sm"
                    title={cat.name}
                  >
                    {cat.name}
                  </Label>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-muted-foreground text-sm">₹</span>
                    <Input
                      id={`budget-${cat.id}`}
                      type="number"
                      min="0"
                      step="1"
                      className="pl-8"
                      value={budgets[cat.id] ?? ""}
                      onChange={(e) => handleAmountChange(cat.id, e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="pt-4 border-t mt-2 flex items-center justify-between font-medium">
            <span className="text-sm">Total Budget</span>
            <span className="text-lg font-tabular-nums">{formatINR(total)}</span>
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || total === 0 || loadingCategories}>
              {isPending ? "Saving…" : "Save Budget"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
