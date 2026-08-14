import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export function useIPOs() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['ipos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ipos')
        .select('*, applications:ipo_applications(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
  });
}

export function useIPO(id: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['ipo', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ipos')
        .select('*, applications:ipo_applications(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });
}

export function useCreateIPO() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (ipo: any) => {
      const { data, error } = await supabase.from('ipos').insert(ipo as any).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      toast.success('IPO created successfully');
      queryClient.invalidateQueries({ queryKey: ['ipos'] });
    },
    onError: (error) => {
      toast.error(`Failed to create IPO: ${error.message}`);
    }
  });
}

export function useUpdateIPO() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updateData }: any) => {
      const { data, error } = await (supabase.from('ipos') as any).update(updateData).eq('id', id).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success('IPO updated successfully');
      queryClient.invalidateQueries({ queryKey: ['ipos'] });
      queryClient.invalidateQueries({ queryKey: ['ipo', data.id] });
    },
    onError: (error) => {
      toast.error(`Failed to update IPO: ${error.message}`);
    }
  });
}

export function useIPOApplications(ipoId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['ipo_applications', ipoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ipo_applications')
        .select('*')
        .eq('ipo_id', ipoId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!ipoId,
  });
}

export function useCreateIPOApplication() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (application: any) => {
      const { data, error } = await supabase.from('ipo_applications').insert(application as any).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success('Application created successfully');
      queryClient.invalidateQueries({ queryKey: ['ipo_applications', data.ipo_id] });
      queryClient.invalidateQueries({ queryKey: ['ipo', data.ipo_id] });
    },
    onError: (error) => {
      toast.error(`Failed to create application: ${error.message}`);
    }
  });
}

export function useUpdateIPOApplication() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updateData }: any) => {
      const { data, error } = await (supabase.from('ipo_applications') as any).update(updateData).eq('id', id).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success('Application updated successfully');
      queryClient.invalidateQueries({ queryKey: ['ipo_applications', data.ipo_id] });
      queryClient.invalidateQueries({ queryKey: ['ipo', data.ipo_id] });
    },
    onError: (error) => {
      toast.error(`Failed to update application: ${error.message}`);
    }
  });
}
