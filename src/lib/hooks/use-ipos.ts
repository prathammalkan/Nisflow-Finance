import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export function useIPOs() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['ipos'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { data, error } = await (supabase.from('ipos') as any)
        .select('*, applications:ipo_applications(*)')
        .eq('user_id', userData.user.id)
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
      const { data, error } = await (supabase.from('ipos') as any)
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
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const payload = {
        user_id: userData.user.id,
        name: ipo.name,
        company: ipo.company || ipo.company_name || null,
        open_date: ipo.open_date,
        close_date: ipo.close_date,
        listing_date: ipo.listing_date || null,
        price_band_low: Number(ipo.price_band_low || 0),
        price_band_high: Number(ipo.price_band_high || 0),
        lot_size: Number(ipo.lot_size || 0),
        status: ipo.status || 'Upcoming',
      };

      const { data, error } = await (supabase.from('ipos') as any).insert(payload).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      toast.success('IPO created successfully');
      queryClient.invalidateQueries({ queryKey: ['ipos'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to create IPO: ${error.message}`);
    }
  });
}

export function useUpdateIPO() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ...updateData }: any) => {
      const payload: any = {
        updated_at: new Date().toISOString(),
      };
      if (updateData.name !== undefined) payload.name = updateData.name;
      if (updateData.company !== undefined || updateData.company_name !== undefined) {
        payload.company = updateData.company || updateData.company_name;
      }
      if (updateData.open_date !== undefined) payload.open_date = updateData.open_date;
      if (updateData.close_date !== undefined) payload.close_date = updateData.close_date;
      if (updateData.listing_date !== undefined) payload.listing_date = updateData.listing_date || null;
      if (updateData.price_band_low !== undefined) payload.price_band_low = Number(updateData.price_band_low);
      if (updateData.price_band_high !== undefined) payload.price_band_high = Number(updateData.price_band_high);
      if (updateData.lot_size !== undefined) payload.lot_size = Number(updateData.lot_size);
      if (updateData.status !== undefined) payload.status = updateData.status;

      const { data, error } = await (supabase.from('ipos') as any).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success('IPO updated successfully');
      queryClient.invalidateQueries({ queryKey: ['ipos'] });
      queryClient.invalidateQueries({ queryKey: ['ipo', data.id] });
    },
    onError: (error: any) => {
      toast.error(`Failed to update IPO: ${error.message}`);
    }
  });
}

export function useIPOApplications(ipoId: string) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['ipo_applications', ipoId],
    queryFn: async () => {
      const { data, error } = await (supabase.from('ipo_applications') as any)
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
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const appAmount = Number(application.application_amount ?? application.amount ?? 0);
      const payload = {
        user_id: userData.user.id,
        ipo_id: application.ipo_id,
        applicant_name: application.applicant_name,
        fund_owner: (application.fund_owner || 'personal').toLowerCase(),
        counterparty_id: application.counterparty_id || null,
        funding_source_account_id: application.funding_source_account_id || null,
        application_amount: appAmount,
        application_date: application.application_date || new Date().toISOString().split('T')[0],
        broker: application.broker || null,
        demat_account: application.demat_account || null,
        upi_mandate_id: application.upi_mandate_id || null,
        application_number: application.application_number || null,
        category: (application.category || 'retail').toLowerCase(),
        status: application.status || 'Applied',
        outstanding_amount: appAmount,
      };

      const { data, error } = await (supabase.from('ipo_applications') as any).insert(payload).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success('IPO application recorded successfully');
      queryClient.invalidateQueries({ queryKey: ['ipo_applications', data.ipo_id] });
      queryClient.invalidateQueries({ queryKey: ['ipo', data.ipo_id] });
      queryClient.invalidateQueries({ queryKey: ['ipos'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to create application: ${error.message}`);
    }
  });
}

export function useUpdateIPOApplication() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, ipo_id, ...updateData }: any) => {
      const payload = {
        ...updateData,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await (supabase.from('ipo_applications') as any).update(payload).eq('id', id).select().single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success('IPO application updated successfully');
      queryClient.invalidateQueries({ queryKey: ['ipo_applications', data.ipo_id] });
      queryClient.invalidateQueries({ queryKey: ['ipo', data.ipo_id] });
      queryClient.invalidateQueries({ queryKey: ['ipos'] });
    },
    onError: (error: any) => {
      toast.error(`Failed to update application: ${error.message}`);
    }
  });
}
