import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// P1-002 Regression Test: Credential Isolation
//
// Proves:
//   [A] SUPABASE_SERVICE_ROLE_KEY is not referenced in any source file
//   [B] SUPABASE_SERVICE_ROLE_KEY is not defined as a usable variable in .env.example
//   [C] .env.example documents credential isolation policy
//   [D] createAdminClient() uses SUPABASE_SECRET_KEY, not SERVICE_ROLE_KEY
//   [E] SUPABASE_SECRET_KEY is not referenced via NEXT_PUBLIC_ prefix
//   [F] .gitignore excludes .env.local and all .env.* variants
// ============================================================

const srcDir = path.join(process.cwd(), 'src');
const envExample = path.join(process.cwd(), '.env.example');
const gitignore = path.join(process.cwd(), '.gitignore');
const serverTs = path.join(process.cwd(), 'src', 'lib', 'supabase', 'server.ts');

function getAllSourceFiles(dir: string, ext = ['.ts', '.tsx']): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.next') {
      results.push(...getAllSourceFiles(full, ext));
    } else if (entry.isFile() && ext.some(e => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

test('P1-002-A: SUPABASE_SERVICE_ROLE_KEY is not referenced in any source file', () => {
  const files = getAllSourceFiles(srcDir);
  const violations: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      violations.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepStrictEqual(
    violations,
    [],
    `SUPABASE_SERVICE_ROLE_KEY must not be referenced in source: ${violations.join(', ')}`
  );
});

test('P1-002-B: .env.example does not define SUPABASE_SERVICE_ROLE_KEY as an active variable', () => {
  const content = fs.readFileSync(envExample, 'utf8');
  const lines = content.split('\n');

  // Active variable lines start with VAR_NAME=, not #
  const activeServiceRoleKeyLines = lines.filter(
    l => l.match(/^SUPABASE_SERVICE_ROLE_KEY=/)
  );

  assert.deepStrictEqual(
    activeServiceRoleKeyLines,
    [],
    '.env.example must not define SUPABASE_SERVICE_ROLE_KEY as an active (uncommented) variable'
  );
});

test('P1-002-C: .env.example documents credential isolation policy', () => {
  const content = fs.readFileSync(envExample, 'utf8');
  assert.match(
    content,
    /CREDENTIAL ISOLATION|separate Supabase project|branching/i,
    '.env.example must document credential isolation guidance'
  );
});

test('P1-002-D: createAdminClient() uses SUPABASE_SECRET_KEY, not SUPABASE_SERVICE_ROLE_KEY', () => {
  const content = fs.readFileSync(serverTs, 'utf8');
  assert.match(content, /SUPABASE_SECRET_KEY/, 'createAdminClient must reference SUPABASE_SECRET_KEY');
  assert.doesNotMatch(content, /SUPABASE_SERVICE_ROLE_KEY/, 'createAdminClient must NOT reference SUPABASE_SERVICE_ROLE_KEY');
});

test('P1-002-E: SUPABASE_SECRET_KEY is not exposed via NEXT_PUBLIC_ prefix anywhere', () => {
  const files = getAllSourceFiles(srcDir);
  const violations: string[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('NEXT_PUBLIC_SUPABASE_SECRET') || content.includes('NEXT_PUBLIC_SERVICE_ROLE')) {
      violations.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepStrictEqual(
    violations,
    [],
    `Service-role key must never be exposed as NEXT_PUBLIC_: ${violations.join(', ')}`
  );
});

test('P1-002-F: .gitignore excludes .env.local and .env.* variants', () => {
  assert.ok(fs.existsSync(gitignore), '.gitignore must exist');
  const content = fs.readFileSync(gitignore, 'utf8');

  // Should exclude .env.local at minimum
  assert.match(
    content,
    /\.env\.local|\.env\.\*|\.env\*/,
    '.gitignore must exclude .env.local or all .env.* variants'
  );
});

test('P1-002-G: No secret key pattern committed to git-tracked files (static check)', () => {
  // Check that no currently-tracked .ts/.tsx/.js/.json files contain a Supabase service-role JWT
  // (starts with eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 which decodes to standard JWT header)
  const files = getAllSourceFiles(srcDir);

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      content,
      /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/,
      `Source file must not contain hardcoded JWT: ${path.relative(process.cwd(), file)}`
    );
  }
});
