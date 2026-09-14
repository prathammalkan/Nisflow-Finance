import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Decimal } from "decimal.js";

export function useBudgets(month: number, year: number) {
  return useQuery({
    queryKey: ["budgets", month, year],
    queryFn: async () => {
      const supabase = createClient();
      
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      // 1. Fetch parent budget record for this month/year
      const { data: budgetData, error: budgetError } = await (supabase as any)
        .from("budgets")
        .select("id, month, year")
        .eq("month", month)
        .eq("year", year)
        .eq("user_id", user.user.id)
        .maybeSingle();

      if (budgetError) throw budgetError;
      if (!budgetData) return []; // No budget set for this month

      // 2. Fetch budget categories joined with categories (FK: budget_categories.category_id → categories.id)
      const { data: categoriesData, error: categoriesError } = await (supabase as any)
        .from("budget_categories")
        .select(`
          id,
          budget_id,
          category_id,
          allocated_amount,
          category:categories(name)
        `)
        .eq("budget_id", budgetData.id);

      if (categoriesError) throw categoriesError;

      // 3. Calculate spent amounts from transactions (match by category_id)
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select("category_id, amount, direction")
        .eq("user_id", user.user.id)
        .eq("direction", "out")
        .gte("date", startDate)
        .lte("date", endDate);

      if (txError) throw txError;

      const spentByCategory = ((transactions as any[]) || []).reduce(
        (acc: Record<string, Decimal>, tx: any) => {
          const catId = tx.category_id || "uncategorized";
          if (!acc[catId]) acc[catId] = new Decimal(0);
          acc[catId] = acc[catId].plus(tx.amount || 0);
          return acc;
        },
        {}
      );

      return ((categoriesData as any[]) || []).map((bc: any) => ({
        id: bc.id,
        budget_id: bc.budget_id,
        category_id: bc.category_id,
        category: (bc.category as any)?.name || "Unknown",
        allocated_amount: bc.allocated_amount || 0,
        spent_amount: spentByCategory[bc.category_id]
          ? spentByCategory[bc.category_id].toNumber()
          : 0,
      }));
    },
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (budget: {
      month: number;
      year: number;
      category_id: string;
      allocated_amount: number;
    }) => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      // Find or create parent budget record
      let { data: budgetData, error: budgetError } = await (supabase as any)
        .from("budgets")
        .select("id")
        .eq("month", budget.month)
        .eq("year", budget.year)
        .eq("user_id", user.user.id)
        .maybeSingle();

      if (budgetError) throw budgetError;

      if (!budgetData) {
        const { data: newBudget, error: newBudgetError } = await (supabase as any)
          .from("budgets")
          .insert([{ month: budget.month, year: budget.year, user_id: user.user.id }])
          .select()
          .single();
        if (newBudgetError) throw newBudgetError;
        budgetData = newBudget;
      }

      const { data: categoryData, error: categoryError } = await (supabase as any)
        .from("budget_categories")
        .insert([
          {
            budget_id: budgetData.id,
            category_id: budget.category_id,
            allocated_amount: budget.allocated_amount,
          },
        ])
        .select()
        .single();

      if (categoryError) throw categoryError;
      return categoryData;
    },
    onSuccess: (_, variables) => {
      toast.success("Budget created");
      queryClient.invalidateQueries({
        queryKey: ["budgets", variables.month, variables.year],
      });
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    },
  });
}

export function useUpdateBudgetCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      allocated_amount,
    }: {
      id: string;
      allocated_amount: number;
    }) => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await (supabase as any)
        .from("budget_categories")
        .update({ allocated_amount })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Budget updated");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: (error: any) => {
      toast.error(`Error: ${error.message}`);
    },
  });
}

export function useBudgetSummary(month: number, year: number) {
  const { data: budgets, isLoading } = useBudgets(month, year);

  if (isLoading || !budgets) {
    return { isLoading, totalAllocated: 0, totalSpent: 0, remaining: 0 };
  }

  const totalAllocated = budgets.reduce(
    (sum, b) => sum + (b.allocated_amount || 0),
    0
  );
  const totalSpent = budgets.reduce((sum, b) => sum + (b.spent_amount || 0), 0);

  return {
    isLoading: false,
    totalAllocated,
    totalSpent,
    remaining: totalAllocated - totalSpent,
  };
}
