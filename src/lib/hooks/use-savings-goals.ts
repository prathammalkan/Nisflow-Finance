import { createClient } from "@/lib/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Decimal } from "decimal.js";

export function useSavingsGoals() {
  return useQuery({
    queryKey: ["savings-goals"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("savings_goals")
        .select("*")
        .eq("user_id", user.user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      return (data as any[]).map(goal => {
        const current = new Decimal(goal.current_amount || 0);
        const target = new Decimal(goal.target_amount || 1);
        const progress = Math.min(100, Math.max(0, current.dividedBy(target).times(100).toNumber()));
        
        return {
          ...goal,
          progress
        };
      });
    }
  });
}

export function useCreateSavingsGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (goal: any) => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("savings_goals")
        .insert([{ ...goal, user_id: user.user.id }] as any)
        .select()
        .single();

      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      toast.success("Savings goal created");
      queryClient.invalidateQueries({ queryKey: ["savings-goals"] });
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });
}

export function useUpdateSavingsGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { user_id, ...safeUpdates } = updates;

      const { data, error } = await (supabase
        .from("savings_goals") as any)
        .update(safeUpdates)
        .eq("id", id)
        .eq("user_id", user.user.id)
        .select()
        .single();

      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      toast.success("Savings goal updated");
      queryClient.invalidateQueries({ queryKey: ["savings-goals"] });
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });
}

export function useDeleteSavingsGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      const { error } = await (supabase
        .from("savings_goals") as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", user.user.id);

      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      toast.success("Savings goal deleted");
      queryClient.invalidateQueries({ queryKey: ["savings-goals"] });
    },
    onError: (error) => {
      toast.error(`Error: ${error.message}`);
    }
  });
}
