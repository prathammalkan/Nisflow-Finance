import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserListEntry {
  user_id: string;
  email: string | null;
  status: 'pending' | 'approved' | 'suspended';
  is_admin: boolean;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_user_id: string;
  actor_email: string | null;
  action: string;
  target_user_id: string | null;
  target_email: string | null;
  logged_at: string;
  result: string;
  metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// useAccessStatus
// ---------------------------------------------------------------------------

/**
 * Returns the current user's access status and admin flag.
 * Used by AccessGate and the admin page to gate content.
 */
export function useAccessStatus() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['access-status'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_current_access_status');
      if (error) {
        // Migration not yet applied — treat as approved non-admin
        if (error.code === '42883' || error.message?.includes('does not exist')) {
          return { status: 'approved' as const, is_admin: false };
        }
        throw error;
      }
      return data as { status: 'pending' | 'approved' | 'suspended'; is_admin: boolean };
    },
    staleTime: 30_000,
    refetchInterval: 30_000, // Poll every 30s so pending users auto-unblock on approval
    retry: 1,
  });
}

// ---------------------------------------------------------------------------
// useAdminExists
// ---------------------------------------------------------------------------

/**
 * Returns true if at least one admin row exists.
 * Uses a SECURITY DEFINER boolean RPC — never exposes admin UUIDs.
 */
export function useAdminExists() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['admin-exists'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('admin_exists');
      if (error) {
        // RPC not yet deployed — assume admin exists to prevent unwanted bootstrap
        if (error.code === '42883' || error.message?.includes('does not exist')) {
          return true;
        }
        return true; // Fail-safe: assume admin exists
      }
      return Boolean(data);
    },
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// useBootstrapAdmin
// ---------------------------------------------------------------------------

export function useBootstrapAdmin() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('bootstrap_first_admin');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-status'] });
      queryClient.invalidateQueries({ queryKey: ['admin-exists'] });
      queryClient.invalidateQueries({ queryKey: ['admin-user-list'] });
      toast.success('You are now the system administrator');
    },
    onError: (error: Error) => {
      toast.error(`Failed to bootstrap admin: ${error.message}`);
    },
  });
}

// ---------------------------------------------------------------------------
// useAdminUserList
// ---------------------------------------------------------------------------

export function useAdminUserList() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['admin-user-list'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('get_admin_user_list');
      if (error) throw error;
      return data as UserListEntry[];
    },
  });
}

// ---------------------------------------------------------------------------
// useApproveUser
// ---------------------------------------------------------------------------

export function useApproveUser() {
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;

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

// ---------------------------------------------------------------------------
// useSuspendUser
// ---------------------------------------------------------------------------

export function useSuspendUser() {
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;

  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      const { data, error } = await db.rpc('suspend_user', {
        p_target_user_id: userId,
        p_reason: reason ?? null,
      });
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

// ---------------------------------------------------------------------------
// useReactivateUser
// ---------------------------------------------------------------------------

export function useReactivateUser() {
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;

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

// ---------------------------------------------------------------------------
// useSetRegistrationMode
// ---------------------------------------------------------------------------

export function useSetRegistrationMode() {
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;

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

// ---------------------------------------------------------------------------
// useRegistrationMode
// ---------------------------------------------------------------------------

export function useRegistrationMode() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['registration-mode'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.from('app_access_settings') as any)
        .select('registration_mode')
        .limit(1)
        .single();
      if (error) return 'public';
      return (data?.registration_mode ?? 'public') as 'public' | 'approval_required';
    },
  });
}

// ---------------------------------------------------------------------------
// useGrantAdminRole  (NEW — Migration 028)
// ---------------------------------------------------------------------------

/**
 * Promotes a target user to admin. Only existing admins can call this.
 */
export function useGrantAdminRole() {
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await db.rpc('grant_admin_role', {
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-list'] });
      queryClient.invalidateQueries({ queryKey: ['admin-exists'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-log'] });
      toast.success('Admin role granted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to grant admin role: ${error.message}`);
    },
  });
}

// ---------------------------------------------------------------------------
// useRevokeAdminRole  (NEW — Migration 028)
// ---------------------------------------------------------------------------

/**
 * Removes admin role from a target user. Admins cannot revoke themselves.
 */
export function useRevokeAdminRole() {
  const queryClient = useQueryClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      const { data, error } = await db.rpc('revoke_admin_role', {
        p_target_user_id: targetUserId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-user-list'] });
      queryClient.invalidateQueries({ queryKey: ['admin-exists'] });
      queryClient.invalidateQueries({ queryKey: ['admin-audit-log'] });
      toast.success('Admin role revoked');
    },
    onError: (error: Error) => {
      toast.error(`Failed to revoke admin role: ${error.message}`);
    },
  });
}

// ---------------------------------------------------------------------------
// useAdminAuditLog  (NEW — Migration 028)
// ---------------------------------------------------------------------------

/**
 * Fetches the admin audit log. Only available to admins.
 */
export function useAdminAuditLog(limit = 50) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;

  return useQuery({
    queryKey: ['admin-audit-log', limit],
    queryFn: async () => {
      const { data, error } = await db.rpc('get_admin_audit_log', { p_limit: limit });
      if (error) throw error;
      return data as AuditLogEntry[];
    },
    staleTime: 10_000,
  });
}
