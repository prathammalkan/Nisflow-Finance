import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useDocuments(entityType?: string, entityId?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['documents', entityType, entityId],
    queryFn: async () => {
      // MED-05: Authenticate and scope by user_id for defense-in-depth
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error('Not authenticated');

      let query = supabase.from('documents').select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (entityType) query = query.eq('entity_type', entityType);
      if (entityId) query = query.eq('entity_id', entityId);

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}

// Generate temporary signed URL for secure private document access
export async function getDocumentSignedUrl(filePath: string, expiresInSeconds = 300): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Failed to generate secure document link');
  }

  return data.signedUrl;
}

export function useUploadDocument() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ file, metadata }: { file: File; metadata: any }) => {
      // 1. Authenticate user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Authentication required to upload documents');
      }

      // 2. Upload to Supabase Storage in isolated user directory: <user_id>/<uuid>.<ext>
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'dat';
      const cleanExt = fileExt.replace(/[^a-zA-Z0-9]/g, '');
      const uniqueFileId = crypto.randomUUID();
      const filePath = `${user.id}/${uniqueFileId}.${cleanExt}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type || 'application/octet-stream',
        });

      if (uploadError) throw uploadError;

      // 3. Save metadata to DB bound to authenticated user
      const { data, error } = await supabase
        .from('documents')
        .insert([
          {
            user_id: user.id,
            name: file.name,
            file_path: filePath,
            file_type: file.type || null,
            file_size: file.size || null,
            entity_type: metadata?.entity_type || null,
            entity_id: metadata?.entity_id || null,
            description: metadata?.description || null,
          },
        ] as any)
        .select()
        .single();

      if (error) {
        // Rollback uploaded storage object if metadata insert fails
        await supabase.storage.from('documents').remove([filePath]).catch(() => {});
        throw error;
      }
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
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Authentication required to delete documents');
      }

      // 1. Delete from Storage if file_path exists
      if (document.file_path) {
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([document.file_path]);

        if (storageError) {
          console.error('Failed to delete file from storage:', storageError);
        }
      }

      // 2. Delete from DB ensuring user ownership
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', document.id)
        .eq('user_id', user.id);

      if (error) throw error;
      return document.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}
