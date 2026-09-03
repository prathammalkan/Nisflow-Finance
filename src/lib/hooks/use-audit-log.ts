import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useAuditLogs(filters?: any) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['audit_logs', filters],
    queryFn: async () => {
      let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
      
      if (filters?.entity_type) {
        query = query.eq('entity_type', filters.entity_type);
      }
      
      // Add pagination here if needed
      query = query.limit(50);
      
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    }
  });
}

export function useCreateAuditLog() {
  const supabase = createClient();

  return useMutation({
    mutationFn: async (logData: {
      action: string;
      entity_type: string;
      entity_id?: string;
      details?: any;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const user_id = userData.user?.id;

      const { data, error } = await supabase
        .from('audit_logs')
        .insert([{ ...logData, user_id }] as any)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    }
  });
}
