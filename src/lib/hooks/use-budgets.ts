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

      const { data, error } = await supabase
        .from("budgets")
        .select(`
          id,
          month,
          year,
          category,
          allocated_amount
        `)
        .eq("month", month)
        .eq("year", year)
        .eq("user_id", user.user.id);

      if (error) throw error;
      
      // Calculate spent amount from transactions
      // This is a simplified version; ideally this is done via a DB view or RPC
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select("category, amount, type")
        .eq("user_id", user.user.id)
        .eq("type", "expense")
        .gte("date", startDate)
        .lte("date", endDate);

      if (txError) throw txError;

      const spentByCategory = (transactions as any[]).reduce((acc: Record<string, Decimal>, tx) => {
        const cat = tx.category || "Uncategorized";
        if (!acc[cat]) acc[cat] = new Decimal(0);
        acc[cat] = acc[cat].plus(tx.amount || 0);
        return acc;
      }, {});

      return (data as any[]).map(b => ({
        ...b,
        spent_amount: spentByCategory[b.category] ? spentByCategory[b.category].toNumber() : 0,
      }));
    }
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (budget: { month: number; year: number; category: string; allocated_amount: number }) => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("budgets")
        .insert([{ ...budget, user_id: user.user.id }] as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      toast.success("Budget created");
      queryClient.invalidateQueries({ queryKey: ["budgets", variables.month, variables.year] });
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });
}

export function useUpdateBudgetCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, allocated_amount }: { id: string; allocated_amount: number }) => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await (supabase
        .from("budgets") as any)
        .update({ allocated_amount })
        .eq("id", id)
        .eq("user_id", user.user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success("Budget updated");
      queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });
}

export function useBudgetSummary(month: number, year: number) {
  const { data: budgets, isLoading } = useBudgets(month, year);

  if (isLoading || !budgets) {
    return {
      isLoading,
      totalAllocated: 0,
      totalSpent: 0,
      remaining: 0
    };
  }

  const totalAllocated = budgets.reduce((sum, b) => sum + (b.allocated_amount || 0), 0);
  const totalSpent = budgets.reduce((sum, b) => sum + (b.spent_amount || 0), 0);
  
  return {
    isLoading: false,
    totalAllocated,
    totalSpent,
    remaining: totalAllocated - totalSpent
  };
}
