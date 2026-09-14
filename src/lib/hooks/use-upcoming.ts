import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export interface UpcomingItem {
  id: string;
  description: string;
  amount: number;
  type: string;
  direction: string;
  frequency: string;
  nextDate: string;
  daysUntil: number;
  relativeLabel: string; // 'Tomorrow', 'Friday', '5 days', etc.
}

export function useUpcoming(limit = 5) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['upcoming', limit],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('recurring_transactions')
        .select('id, description, amount, type, direction, frequency, next_date')
        .eq('user_id', userData.user.id)
        .eq('status', 'active')
        .order('next_date', { ascending: true })
        .limit(limit);

      if (error) throw error;

      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      return ((data as any[]) || []).map(item => {
        const nextDate = new Date(item.next_date);
        const diffMs = nextDate.getTime() - today.getTime();
        const daysUntil = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        let relativeLabel: string;
        if (daysUntil === 0) relativeLabel = 'Today';
        else if (daysUntil === 1) relativeLabel = 'Tomorrow';
        else if (daysUntil <= 7) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          relativeLabel = dayNames[nextDate.getDay()];
        } else {
          relativeLabel = `${daysUntil} days`;
        }

        return {
          id: item.id,
          description: item.description || 'Recurring',
          amount: Number(item.amount),
          type: item.type,
          direction: item.direction,
          frequency: item.frequency,
          nextDate: item.next_date,
          daysUntil,
          relativeLabel,
        } satisfies UpcomingItem;
      });
    },
  });
}
