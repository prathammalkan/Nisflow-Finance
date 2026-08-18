import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeImportText, parseCleanAmount, parseDateString } from '../src/lib/reconciliation/import-sanitizer.ts';
import { limitRequest } from '../src/lib/security/rate-limit.ts';

// 1. Storage Security Migration Validation
test('Storage Security: Migration 006 sets documents bucket private with targeted RLS', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '006_storage_security.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 006_storage_security.sql must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Bucket configuration
  assert.match(sql, /'documents'/i, 'Must target documents bucket');
  assert.match(sql, /public\s*=\s*false/i, 'Documents bucket must be strictly private');

  // Policy isolation to folder path <user_id>/...
  assert.match(sql, /\(auth\.uid\(\)\)::text\s*=\s*\(storage\.foldername\(name\)\)\[1\]/, 'Policy must enforce user_id folder isolation');
  assert.match(sql, /bucket_id\s*=\s*'documents'/, 'Policy must be scoped specifically to documents bucket');

  // Must have SELECT, INSERT, UPDATE, DELETE policies
  assert.match(sql, /FOR\s+SELECT/i, 'Must have SELECT policy');
  assert.match(sql, /FOR\s+INSERT/i, 'Must have INSERT policy');
  assert.match(sql, /FOR\s+UPDATE/i, 'Must have UPDATE policy');
  assert.match(sql, /FOR\s+DELETE/i, 'Must have DELETE policy');
});

// 2. Document Uploads enforce <user_id>/... pathing and signed URLs
test('Storage Security: use-documents hook isolates file paths to user ID and uses signed URLs', () => {
  const hookPath = path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-documents.ts');
  const content = fs.readFileSync(hookPath, 'utf8');

  assert.match(content, /\$\{user\.id\}\//, 'Storage path must prepend user.id');
  assert.match(content, /createSignedUrl/, 'Must generate temporary signed URLs');
  assert.doesNotMatch(content, /getPublicUrl/, 'Must NOT use raw public URLs');
});

// 3. Vulnerable xlsx dependency is completely removed
test('Dependency Security: xlsx is completely absent and replaced with secure libraries', () => {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.equal(pkg.dependencies?.xlsx, undefined, 'xlsx must be uninstalled');
  assert.ok(pkg.dependencies?.papaparse, 'papaparse must be installed');
  assert.ok(pkg.dependencies?.exceljs, 'exceljs must be installed');
});

// 4. Formula Disarming preserves legitimate negative financial numbers
test('Spreadsheet Security: Legitimate negative numbers are NOT mutilated', () => {
  assert.equal(parseCleanAmount(-500), -500);
  assert.equal(parseCleanAmount('-500'), -500);
  assert.equal(parseCleanAmount('-1,250.50'), -1250.5);
  assert.equal(parseCleanAmount('(750.00)'), -750);
  assert.equal(parseCleanAmount('Rs. -300'), -300);
  assert.equal(parseCleanAmount('500.00 Dr'), -500);

  // Positive numbers
  assert.equal(parseCleanAmount(1200), 1200);
  assert.equal(parseCleanAmount('+1200.00'), 1200);
  assert.equal(parseCleanAmount('₹25,000.50'), 25000.5);

  // Text sanitizer preserves negative numbers as valid text
  assert.equal(sanitizeImportText('-500'), '-500');
  assert.equal(sanitizeImportText('+1200.50'), '+1200.50');
  assert.equal(sanitizeImportText('-12,500.00'), '-12,500.00');
});

// 5. Formula Disarming neutralizes injection in textual fields
test('Spreadsheet Security: Malicious formulas and DDE triggers in text fields are disarmed', () => {
  assert.equal(sanitizeImportText('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  assert.equal(sanitizeImportText('=cmd|\'/C calc\'!A0'), "'=cmd|'/C calc'!A0");
  assert.equal(sanitizeImportText('+cmd|test'), "'+cmd|test");
  assert.equal(sanitizeImportText('-cmd|test'), "'-cmd|test");

  // Normal narration text is preserved
  assert.equal(sanitizeImportText('Salary from Employer'), 'Salary from Employer');
  assert.equal(sanitizeImportText('Grocery store purchase'), 'Grocery store purchase');
});

// 6. Date parsing handles Excel serial timestamps and string dates
test('Spreadsheet Security: Date parsing converts Excel serial and string formats accurately', () => {
  // ISO string
  assert.equal(parseDateString('2026-08-18'), '2026-08-18');
  // DD/MM/YYYY
  assert.equal(parseDateString('18/08/2026'), '2026-08-18');
  // DD-MM-YYYY
  assert.equal(parseDateString('18-08-2026'), '2026-08-18');
  // Excel Serial Date (e.g. 45522 is approx Aug 18, 2024)
  const parsed = parseDateString(45522);
  assert.match(parsed, /^2024-08-1[789]$/);
});

// 7. Rate Limiter returns 429 on quota exhaustion
test('Rate Limiting: Exceeding request quota returns rate_limited status with retryAfter', async () => {
  const testUserId = `test-user-limit-${Date.now()}`;
  const maxReqs = 3;
  const windowSecs = 10;

  // Requests 1, 2, 3 allowed
  const r1 = await limitRequest('test', testUserId, maxReqs, windowSecs);
  assert.equal(r1.status, 'allowed');
  const r2 = await limitRequest('test', testUserId, maxReqs, windowSecs);
  assert.equal(r2.status, 'allowed');
  const r3 = await limitRequest('test', testUserId, maxReqs, windowSecs);
  assert.equal(r3.status, 'allowed');

  // Request 4 blocked with rate_limited
  const r4 = await limitRequest('test', testUserId, maxReqs, windowSecs);
  assert.equal(r4.status, 'rate_limited');
  if (r4.status === 'rate_limited') {
    assert.ok(r4.retryAfter > 0, 'Must include retryAfter seconds');
    assert.equal(r4.remaining, 0);
  }
});

// 8. Rate Limiter isolates distinct users
test('Rate Limiting: Limits are isolated per user identifier', async () => {
  const userA = `user-a-${Date.now()}`;
  const userB = `user-b-${Date.now()}`;

  // Fill quota for user A
  await limitRequest('test', userA, 1, 10);
  const userABlocked = await limitRequest('test', userA, 1, 10);
  assert.equal(userABlocked.status, 'rate_limited');

  // User B is still allowed
  const userBAllowed = await limitRequest('test', userB, 1, 10);
  assert.equal(userBAllowed.status, 'allowed');
});

// 9. CSP Hardening: Production CSP excludes unsafe-eval and enforces frame-ancestors none / X-Frame-Options DENY
test('CSP Security: Production headers exclude unsafe-eval and lock down framing', () => {
  const nextConfigPath = path.join(process.cwd(), 'next.config.ts');
  const content = fs.readFileSync(nextConfigPath, 'utf8');

  assert.match(content, /isProd\s*\?\s*["']script-src 'self' 'unsafe-inline'["']/, 'Production script-src must NOT contain unsafe-eval');
  assert.match(content, /'X-Frame-Options',\s*value:\s*'DENY'/, 'X-Frame-Options must be DENY');
  assert.match(content, /"frame-ancestors 'none'/, 'CSP must enforce frame-ancestors none');
  assert.match(content, /"object-src 'none'/, 'CSP must enforce object-src none');
  assert.match(content, /"upgrade-insecure-requests"/, 'CSP must enforce upgrade-insecure-requests');
});

// 10. AI Routes handle 503 for security infrastructure outages and 429 for rate limit exceeded
test('API Security: AI endpoints strictly differentiate between 429 quota exhaustion and 503 infrastructure outage', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const catRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'ai', 'categorize', 'route.ts');
  const insRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'ai', 'insights', 'route.ts');

  const chatContent = fs.readFileSync(chatRoutePath, 'utf8');
  const catContent = fs.readFileSync(catRoutePath, 'utf8');
  const insContent = fs.readFileSync(insRoutePath, 'utf8');

  // Verify chat route has both 429 and 503
  assert.match(chatContent, /status:\s*429/, 'Chat route must return 429 on rate limit');
  assert.match(chatContent, /status:\s*503/, 'Chat route must return 503 on service unavailable');

  // Verify categorize route has both 429 and 503
  assert.match(catContent, /status:\s*429/, 'Categorize route must return 429 on rate limit');
  assert.match(catContent, /status:\s*503/, 'Categorize route must return 503 on service unavailable');

  // Verify insights route has both 429 and 503
  assert.match(insContent, /status:\s*429/, 'Insights route must return 429 on rate limit');
  assert.match(insContent, /status:\s*503/, 'Insights route must return 503 on service unavailable');
});
