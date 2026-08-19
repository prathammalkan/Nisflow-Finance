import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useRules() {
  return useQuery({
    queryKey: ["classification-rules"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("classification_rules")
        .select("*")
        .eq("user_id", user.user.id)
        .order("priority", { ascending: false });

      if (error) throw error;
      return data as any[];
    }
  });
}

export function useCreateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: any) => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("classification_rules")
        .insert([{ ...rule, user_id: user.user.id }] as any)
        .select()
        .single();

      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      toast.success("Rule created");
      queryClient.invalidateQueries({ queryKey: ["classification-rules"] });
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });
}

export function useUpdateRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { user_id, ...safeUpdates } = updates;

      const { data, error } = await (supabase
        .from("classification_rules") as any)
        .update(safeUpdates)
        .eq("id", id)
        .eq("user_id", user.user.id)
        .select()
        .single();

      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      toast.success("Rule updated");
      queryClient.invalidateQueries({ queryKey: ["classification-rules"] });
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });
}

export function useDeleteRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("classification_rules")
        .delete()
        .eq("id", id)
        .eq("user_id", user.user.id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      toast.success("Rule deleted");
      queryClient.invalidateQueries({ queryKey: ["classification-rules"] });
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });
}

export function useApplyRules() {
  const { data: rules } = useRules();

  const evaluateTransaction = (transaction: any) => {
    if (!rules || rules.length === 0) return null;

    // Sort by priority descending
    const activeRules = [...rules]
      .filter(r => r.is_active)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const rule of activeRules) {
      if (!rule.conditions || !Array.isArray(rule.conditions)) continue;

      // Check if ALL conditions match (AND logic)
      const isMatch = rule.conditions.every((cond: any) => {
        const { field, operator, value } = cond;
        
        // This is a simplified evaluator
        let txValue = String(transaction[field] || "").toLowerCase();
        let condValue = String(value || "").toLowerCase();

        switch (operator) {
          case "equals":
            return txValue === condValue;
          case "contains":
            return txValue.includes(condValue);
          case "greater than":
            return Number(txValue) > Number(condValue);
          case "less than":
            return Number(txValue) < Number(condValue);
          default:
            return false;
        }
      });

      if (isMatch) {
        return rule.actions;
      }
    }

    return null;
  };

  return { evaluateTransaction };
}
