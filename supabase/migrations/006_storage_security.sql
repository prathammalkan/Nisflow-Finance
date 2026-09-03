-- NisFlow Finance: Task 3C Storage Security Hardening
-- Configures private storage isolation on storage.objects for the documents bucket

-- 1. Ensure documents bucket exists and is strictly private
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    false,
    10485760, -- 10MB limit per document
    ARRAY[
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Ensure RLS is enabled on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Drop only existing application-specific policies for the documents bucket (safely targeted)
DROP POLICY IF EXISTS "Users can view own documents in storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own documents to storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own documents in storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents from storage" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Public document access" ON storage.objects;

-- 4. Minimum required strict RLS policies on storage.objects (Path: <user_id>/<file>)

-- SELECT: Authenticated user can view/download ONLY their own documents
CREATE POLICY "Users can view own documents in storage"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
);

-- INSERT: Authenticated user can upload ONLY into their own folder (<user_id>/...)
CREATE POLICY "Users can upload own documents to storage"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
);

-- UPDATE: Authenticated user can update ONLY their own files
CREATE POLICY "Users can update own documents in storage"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
    bucket_id = 'documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
);

-- DELETE: Authenticated user can delete ONLY their own files
CREATE POLICY "Users can delete own documents from storage"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
);

-- 5. Ensure documents table schema has all required metadata fields
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS entity_id UUID;
