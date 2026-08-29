import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

/**
 * Hook to check the current user's access status and admin role.
 * Used by layouts to gate access for pending/suspended users.
 */
export function useAccessStatus() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['access-status'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_current_access_status' as any);
      if (error) {
        // If the RPC doesn't exist yet (migration not applied), treat as approved
        if (error.code === '42883' || error.message?.includes('does not exist')) {
          return { status: 'approved' as const, is_admin: false };
        }
        throw error;
      }
      return data as { status: 'pending' | 'approved' | 'suspended'; is_admin: boolean };
    },
    staleTime: 30_000, // Cache for 30s to avoid excessive RPC calls
    retry: 1,
  });
}

/**
 * Hook to check if no admin exists (for bootstrap flow).
 */
export function useAdminExists() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['admin-exists'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('app_admin_users') as any)
        .select('user_id')
        .limit(1);
      if (error) {
        // Table may not exist yet
        return true; // Assume admin exists to prevent bootstrap in error state
      }
      return (data?.length ?? 0) > 0;
    },
    staleTime: 60_000,
  });
}

/**
 * Hook to bootstrap the first admin.
 */
export function useBootstrapAdmin() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('bootstrap_first_admin' as any);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-status'] });
      queryClient.invalidateQueries({ queryKey: ['admin-exists'] });
      toast.success('You are now the system administrator');
    },
    onError: (error) => {
      toast.error(`Failed to bootstrap admin: ${error.message}`);
    },
  });
}

/**
 * Admin-only hooks for user management.
 */
export function useAdminUserList() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['admin-user-list'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_user_list' as any);
      if (error) throw error;
      return data as Array<{
        user_id: string;
        status: 'pending' | 'approved' | 'suspended';
        is_admin: boolean;
        created_at: string;
      }>;
    },
  });
}

export function useApproveUser() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await db.rpc('approve_user', { p_target_user_id: targetUserId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-list'] });
      toast.success('User approved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to approve user: ${error.message}`);
    },
  });
}

export function useSuspendUser() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const { data, error } = await db.rpc('suspend_user', { p_target_user_id: userId, p_reason: reason ?? null });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-list'] });
      toast.success('User suspended');
    },
    onError: (error: Error) => {
      toast.error(`Failed to suspend user: ${error.message}`);
    },
  });
}

export function useReactivateUser() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await db.rpc('reactivate_user', { p_target_user_id: targetUserId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-list'] });
      toast.success('User reactivated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to reactivate user: ${error.message}`);
    },
  });
}

export function useSetRegistrationMode() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  return useMutation({
    mutationFn: async (mode: 'public' | 'approval_required') => {
      const { data, error } = await db.rpc('set_registration_mode', { p_mode: mode });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['registration-mode'] });
      toast.success('Registration mode updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to change registration mode: ${error.message}`);
    },
  });
}

export function useRegistrationMode() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['registration-mode'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('app_access_settings') as any)
        .select('registration_mode')
        .limit(1)
        .single();
      if (error) return 'public';
      return (data?.registration_mode ?? 'public') as 'public' | 'approval_required';
    },
  });
}
