import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export type NotificationType = 
  | 'overdue_receivable' 
  | 'budget_warning' 
  | 'large_transaction' 
  | 'ipo_status' 
  | 'monthly_closing_reminder' 
  | 'reconciliation_needed'
  | 'general';

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  description: string;
  type: NotificationType;
  is_read: boolean;
  link?: string;
  created_at: string;
}

export function useNotifications() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      // MED-06: Authenticate and scope by user_id for defense-in-depth
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        // If table doesn't exist yet, just return empty array
        if (error.code === '42P01') return [];
        throw error;
      }
      return data as any as AppNotification[];
    },
  });
}

export function useMarkNotificationRead() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // MED-06: Authenticate and scope by user_id to prevent cross-user notification mark-read
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error('Not authenticated');

      const { data, error } = await (supabase
        .from('notifications') as any)
        .update({ is_read: true })
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}


export function useMarkAllRead() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await (supabase
        .from('notifications') as any)
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('All notifications marked as read');
    },
  });
}

export function useCreateNotification() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notification: Partial<AppNotification>) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('notifications')
        .insert({
          ...notification,
          user_id: user.id,
          is_read: false,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
