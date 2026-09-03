"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export function useProfile() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) return null;

      const { data: profile } = await (supabase.from("profiles") as any)
        .select("*")
        .eq("id", user.id)
        .single();

      return {
        id: user.id,
        email: user.email || "",
        displayName: profile?.display_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
        currency: profile?.currency || "INR",
        createdAt: profile?.created_at || user.created_at,
      };
    },
  });
}

export function useUpdateProfile() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ displayName }: { displayName: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Update profiles table
      const { error: profileError } = await (supabase.from("profiles") as any)
        .upsert({
          id: user.id,
          display_name: displayName,
          updated_at: new Date().toISOString(),
        });

      if (profileError) console.warn("Failed to update profiles table:", profileError);

      // Update user metadata in auth
      const { error: authError } = await supabase.auth.updateUser({
        data: { full_name: displayName },
      });

      if (authError) throw authError;

      return { displayName };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile updated successfully!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update profile");
    },
  });
}
