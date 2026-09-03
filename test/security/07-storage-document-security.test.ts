import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Phase 16 & 19: File/Document Security & Storage Isolation

test('STORAGE [07-01]: Documents storage bucket configuration is strictly private with 10MB size cap', () => {
  const sqlPath = path.join(process.cwd(), 'supabase', 'migrations', '006_storage_security.sql');
  assert.ok(fs.existsSync(sqlPath), '006_storage_security.sql must exist');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  assert.match(sql, /'documents'/, 'Bucket name must be documents');
  assert.match(sql, /public\s*=\s*false/i, 'Bucket must be private');
  assert.match(sql, /10485760/, 'File size limit must be set to 10MB (10485760 bytes)');
  assert.match(sql, /allowed_mime_types/, 'Allowed MIME types must be defined');
});

test('STORAGE [07-02]: use-documents client hook enforces user-isolated paths and signed URLs', () => {
  const hookPath = path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-documents.ts');
  assert.ok(fs.existsSync(hookPath), 'use-documents.ts must exist');
  const code = fs.readFileSync(hookPath, 'utf8');

  // Verify path construction starts with user.id
  assert.match(code, /\$\{user\.id\}\//, 'Document path must start with user.id');

  // Verify temporary signed URLs are used
  assert.match(code, /createSignedUrl/, 'Must create signed URLs for downloads');

  // Verify public URLs are not used
  assert.doesNotMatch(code, /getPublicUrl/, 'Public URLs must not be used for private financial documents');
});
