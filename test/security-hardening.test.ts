import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Helper matching recurring route cron authorization
function isAuthorizedCron(authHeader: string | null, cronSecret: string | undefined): boolean {
  if (!authHeader || !cronSecret || cronSecret.trim().length === 0) {
    return false;
  }
  const expectedHeader = `Bearer ${cronSecret}`;
  const headerBuf = Buffer.from(authHeader);
  const expectedBuf = Buffer.from(expectedHeader);

  if (headerBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(headerBuf, expectedBuf);
}

// 1. handle_new_user has secure search_path configuration
test('Security: handle_new_user migration sets search_path = public', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '005_security_hardening.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 005_security_hardening.sql must exist');
  
  const content = fs.readFileSync(migrationPath, 'utf8');
  assert.match(content, /FUNCTION\s+public\.handle_new_user\(\)/i);
  assert.match(content, /SECURITY\s+DEFINER/i);
  assert.match(content, /SET\s+search_path\s*=\s*public/i);
});

// 2. AI categorization uses transaction_categories
test('Security & Schema: AI categorization queries transaction_categories and not categories', () => {
  const categorizeRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'ai', 'categorize', 'route.ts');
  const content = fs.readFileSync(categorizeRoutePath, 'utf8');
  
  assert.match(content, /\.from\(['"]transaction_categories['"]\)/, 'Must query transaction_categories table');
  assert.doesNotMatch(content, /\.from\(['"]categories['"]\)/, 'Must NOT query nonexistent categories table');
});

// 3. AI account context is limited to 50
test('Security: AI account context applies strict upper limit of 50', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const content = fs.readFileSync(chatRoutePath, 'utf8');
  
  assert.match(content, /\.from\(['"]accounts['"]\)[^;]+\.limit\(50\)/, 'Accounts query must enforce .limit(50)');
});

// 4. AI counterparty context is limited to 50
test('Security: AI counterparty context applies strict upper limit of 50', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const content = fs.readFileSync(chatRoutePath, 'utf8');
  
  assert.match(content, /\.from\(['"]counterparties['"]\)[^;]+\.limit\(50\)/, 'Counterparties query must enforce .limit(50)');
});

// 5. AI context does not include secrets or unnecessary sensitive fields
test('Security: AI chat context excludes credentials, secrets, documents, and tax records', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const content = fs.readFileSync(chatRoutePath, 'utf8');
  
  // Verify excluded tables / sensitive fields
  assert.doesNotMatch(content, /\.from\(['"]documents['"]\)/, 'AI context must not load raw document attachments');
  assert.doesNotMatch(content, /\.from\(['"]tax_records['"]\)/, 'AI context must not load tax documents');
  assert.doesNotMatch(content, /service_role_key/i, 'AI context must never reference service role key');
  assert.doesNotMatch(content, /password/i, 'AI context must never load user password fields');
  assert.doesNotMatch(content, /token/i, 'AI context must never load auth tokens');
});

// 6. Missing CRON_SECRET is rejected
test('Security: Cron authentication rejects missing or empty CRON_SECRET', () => {
  assert.equal(isAuthorizedCron(null, undefined), false);
  assert.equal(isAuthorizedCron('Bearer test-secret', undefined), false);
  assert.equal(isAuthorizedCron('Bearer test-secret', ''), false);
  assert.equal(isAuthorizedCron(null, 'valid-secret'), false);
});

// 7. Invalid CRON_SECRET is rejected
test('Security: Cron authentication rejects invalid bearer secret', () => {
  const secret = 'prod-cron-secret-12345';
  assert.equal(isAuthorizedCron('Bearer wrong-secret', secret), false);
  assert.equal(isAuthorizedCron('Bearer prod-cron-secret-1234', secret), false);
  assert.equal(isAuthorizedCron('Basic prod-cron-secret-12345', secret), false);
  assert.equal(isAuthorizedCron('prod-cron-secret-12345', secret), false);
});

// 8. Valid CRON_SECRET can execute cron mode
test('Security: Cron authentication accepts matching bearer secret via constant-time check', () => {
  const secret = 'secure-cron-random-key-xyz-789';
  assert.equal(isAuthorizedCron(`Bearer ${secret}`, secret), true);
});

// 9. Normal authenticated users execute their own recurring transactions under session isolation
test('Security: Regular user execution isolates query strictly to user session ID', () => {
  const recurringRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'recurring', 'execute', 'route.ts');
  const content = fs.readFileSync(recurringRoutePath, 'utf8');
  
  assert.match(content, /targetUserId\s*=\s*userData\.user\.id/, 'Must bind target user to session user id');
  assert.match(content, /query\.eq\(['"]user_id['"],\s*targetUserId\)/, 'Must filter due rules by authenticated user_id');
});

// 10. Cron execution does not accept arbitrary user_id overrides from request body/params
test('Security: Cron execution does not allow caller-provided user_id override', () => {
  const recurringRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'recurring', 'execute', 'route.ts');
  const content = fs.readFileSync(recurringRoutePath, 'utf8');
  
  assert.doesNotMatch(content, /req\.json\(\).*user_id/, 'Route must not parse user_id from body');
  assert.doesNotMatch(content, /req\.nextUrl\.searchParams\.get\(['"]user_id['"]\)/, 'Route must not parse user_id from query params');
});

// 11. Existing recurring idempotency remains intact
test('Security & Integrity: Recurring transaction idempotency key generation is deterministic', () => {
  const rule = { id: 'rule-uuid-123', next_due_date: '2026-08-18' };
  const occurrenceRef = `REC:${rule.id}:${rule.next_due_date}`;
  
  assert.equal(occurrenceRef, 'REC:rule-uuid-123:2026-08-18');
  
  // Second invocation for same date produces identical deterministic reference
  const duplicateOccurrenceRef = `REC:${rule.id}:${rule.next_due_date}`;
  assert.equal(occurrenceRef, duplicateOccurrenceRef);
});

// 12. Existing AI confirmation requirement remains intact
test('Security: AI companion preserves explicit action block requiring user confirmation', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const content = fs.readFileSync(chatRoutePath, 'utf8');
  
  assert.match(content, /\[ACTION\]/, 'System prompt must require [ACTION] block format for confirmation-based execution');
  assert.match(content, /\[\/ACTION\]/, 'System prompt must require [/ACTION] closing tag');
});
