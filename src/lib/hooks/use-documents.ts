import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useDocuments(entityType?: string, entityId?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['documents', entityType, entityId],
    queryFn: async () => {
      let query = supabase.from('documents').select('*').order('created_at', { ascending: false });
      
      if (entityType) query = query.eq('entity_type', entityType);
      if (entityId) query = query.eq('entity_id', entityId);
      
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    }
  });
}

export function useUploadDocument() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, metadata }: { file: File; metadata: any }) => {
      // 1. Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `documents/${fileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file);
        
      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // 2. Save metadata to DB
      const { data, error } = await supabase
        .from('documents')
        .insert([{
          ...metadata,
          name: file.name,
          file_url: publicUrl,
          file_path: filePath,
          content_type: file.type,
          size_bytes: file.size
        }] as any)
        .select()
        .single();
        
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useDeleteDocument() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (document: any) => {
      // 1. Delete from Storage
      if (document.file_path) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([document.file_path]);
          
        if (storageError) console.error('Failed to delete file from storage', storageError);
      }

      // 2. Delete from DB
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id);
        
      if (error) throw error;
      return document.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}
