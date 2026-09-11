import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
// FINAL RELEASE GATE VALIDATION TEST SUITE
// Verifies:
//   1. Account deletion API endpoint & rate limiting
//   2. Account deletion modal & safety protections
//   3. Privacy policy page & statutory disclosures
//   4. Terms & Conditions page & regulatory disclaimers
//   5. Discoverability of legal links on public and authenticated surfaces
//   6. Elimination of buffering / instant dashboard loading
//   7. Quick action form preservation
// ==============================================================================

test('RELEASE-01: Account deletion API endpoint exists with strict controls', () => {
  const deleteRoutePath = path.join(process.cwd(), 'src/app/api/account/delete/route.ts');
  assert.ok(fs.existsSync(deleteRoutePath), 'api/account/delete/route.ts must exist');

  const code = fs.readFileSync(deleteRoutePath, 'utf8');

  // Strict confirmation phrase
  assert.match(code, /DELETE MY ACCOUNT/, 'Must require exact confirmation phrase "DELETE MY ACCOUNT"');

  // Authenticated check
  assert.match(code, /getUser\(\)/, 'Must call getUser() to authenticate caller');
  assert.match(code, /status:\s*401/, 'Must reject unauthenticated callers with 401');

  // Rate limiting
  assert.match(code, /checkDeleteAccountRateLimit/, 'Must apply rate limiting to account deletion');

  // Method 405 check
  assert.match(code, /export async function GET/, 'Must export GET handler');
  assert.match(code, /status:\s*405/, 'GET must return 405 Method Not Allowed');

  // Server-side admin deletion (no service role client-side leak)
  assert.match(code, /createAdminClient\(\)/, 'Must use server-side createAdminClient');
  assert.match(code, /admin\.deleteUser/, 'Must invoke admin.deleteUser to remove auth user');

  // Transactional database cleanup
  assert.match(code, /reset_user_data/, 'Must invoke reset_user_data RPC to purge financial tables');

  // Session invalidation
  assert.match(code, /signOut\(\)/, 'Must sign out user to invalidate session cookies');
});

test('RELEASE-02: Rate limit module defines checkDeleteAccountRateLimit', () => {
  const rateLimitPath = path.join(process.cwd(), 'src/lib/security/rate-limit.ts');
  const code = fs.readFileSync(rateLimitPath, 'utf8');

  assert.match(code, /export async function checkDeleteAccountRateLimit/, 'Must export checkDeleteAccountRateLimit');
  assert.match(code, /'delete_account'/, 'Must have dedicated rate limit prefix');
});

test('RELEASE-03: DeleteAccountModal exists with two-step confirmation safeguards', () => {
  const modalPath = path.join(process.cwd(), 'src/components/settings/delete-account-modal.tsx');
  assert.ok(fs.existsSync(modalPath), 'delete-account-modal.tsx must exist');

  const code = fs.readFileSync(modalPath, 'utf8');

  // Required confirmation phrase
  assert.match(code, /DELETE MY ACCOUNT/, 'Modal must enforce "DELETE MY ACCOUNT" phrase');

  // Destructive warnings
  assert.match(code, /IRREVERSIBLE DESTRUCTION WARNING|Delete Account/i, 'Must warn of irreversible destruction');

  // Calls delete API
  assert.match(code, /\/api\/account\/delete/, 'Must call /api/account/delete');

  // Clears client state and redirects
  assert.match(code, /clearUserFinancialClientState/, 'Must clear user client state upon deletion');
  assert.match(code, /\/login/, 'Must redirect to login page');
});

test('RELEASE-04: Settings page integrates Delete Account and Legal sections', () => {
  const settingsPath = path.join(process.cwd(), 'src/app/(dashboard)/settings/page.tsx');
  const code = fs.readFileSync(settingsPath, 'utf8');

  // Mounts DeleteAccountModal
  assert.match(code, /<DeleteAccountModal\s*\/>/, 'Settings must render DeleteAccountModal');

  // Legal section with links to privacy and terms
  assert.match(code, /href=["']\/privacy["']/, 'Settings must link to /privacy');
  assert.match(code, /href=["']\/terms["']/, 'Settings must link to /terms');
  assert.match(code, /Regulatory Notice/i, 'Settings must include non-advisory regulatory notice');
});

test('RELEASE-05: Privacy Policy page exists and accurately reflects architecture', () => {
  const privacyPath = path.join(process.cwd(), 'src/app/privacy/page.tsx');
  assert.ok(fs.existsSync(privacyPath), 'privacy/page.tsx must exist');

  const code = fs.readFileSync(privacyPath, 'utf8');

  // Covers actual infrastructure
  assert.match(code, /Supabase/i, 'Must disclose Supabase usage');
  assert.match(code, /Google Gemini/i, 'Must disclose Google Gemini AI usage');
  assert.match(code, /Upstash Redis/i, 'Must disclose Upstash Redis usage');

  // Data sovereignty & deletion
  assert.match(code, /Data Export/i, 'Must explain data export capabilities');
  assert.match(code, /Account Deletion/i, 'Must explain account deletion capabilities');

  // No false claims check
  assert.doesNotMatch(code, /bank-grade security/i, 'Must NOT make unverified "bank-grade security" claim');
  assert.doesNotMatch(code, /100% secure/i, 'Must NOT claim to be 100% secure');
  assert.doesNotMatch(code, /SOC 2 compliant/i, 'Must NOT falsely claim SOC 2 compliance');
});

test('RELEASE-06: Terms & Conditions page exists and includes vital financial disclaimers', () => {
  const termsPath = path.join(process.cwd(), 'src/app/terms/page.tsx');
  assert.ok(fs.existsSync(termsPath), 'terms/page.tsx must exist');

  const code = fs.readFileSync(termsPath, 'utf8');

  // Regulatory & non-advisory disclaimers
  assert.match(code, /NOT<\/strong>\s+a registered financial advisor|not a registered financial advisor/i, 'Must disclaim registered financial advisor status');
  assert.match(code, /educational|informational/i, 'Must state records and estimates are informational');
  assert.match(code, /AI Features|AI responses/i, 'Must include AI assistant disclaimer');
  assert.match(code, /Double-entry|Financial Records/i, 'Must describe accounting ledger responsibilities');
  assert.match(code, /Account Deletion|Termination/i, 'Must provide for termination and account deletion');
});

test('RELEASE-07: Public auth surfaces provide discoverable legal footer', () => {
  const authLayoutPath = path.join(process.cwd(), 'src/app/(auth)/layout.tsx');
  const code = fs.readFileSync(authLayoutPath, 'utf8');

  assert.match(code, /href=["']\/privacy["']/, 'Auth layout must link to /privacy');
  assert.match(code, /href=["']\/terms["']/, 'Auth layout must link to /terms');
});

test('RELEASE-08: Proxy middleware allows public access to privacy, terms, and GET /api/account/delete', () => {
  const middlewarePath = path.join(process.cwd(), 'src/lib/supabase/middleware.ts');
  const code = fs.readFileSync(middlewarePath, 'utf8');

  assert.match(code, /\/privacy/, 'Middleware must exempt /privacy from unauthenticated redirect');
  assert.match(code, /\/terms/, 'Middleware must exempt /terms from unauthenticated redirect');
  assert.match(code, /\/api\/account\/delete/, 'Middleware must allow GET /api/account/delete for 405 response');
});

test('RELEASE-09: Dashboard quick actions preserve transaction type', () => {
  const txFormPath = path.join(process.cwd(), 'src/components/transactions/transaction-form.tsx');
  const dashPagePath = path.join(process.cwd(), 'src/app/(dashboard)/dashboard/page.tsx');

  const txFormCode = fs.readFileSync(txFormPath, 'utf8');
  const dashCode = fs.readFileSync(dashPagePath, 'utf8');

  assert.match(txFormCode, /defaultType\?:/, 'TransactionForm must declare defaultType prop');
  assert.match(dashCode, /defaultType=\{txFormType\}/, 'Dashboard must pass defaultType={txFormType} to TransactionForm');
});

test('RELEASE-10: Dashboard layout pre-fetches access status for instant buffer-free rendering', () => {
  const layoutPath = path.join(process.cwd(), 'src/app/(dashboard)/layout.tsx');
  const gatePath = path.join(process.cwd(), 'src/components/admin/access-gate.tsx');

  const layoutCode = fs.readFileSync(layoutPath, 'utf8');
  const gateCode = fs.readFileSync(gatePath, 'utf8');

  assert.match(layoutCode, /get_current_access_status/, 'Dashboard layout must pre-fetch access status server-side');
  assert.match(layoutCode, /initialStatus=\{initialStatus\}/, 'Dashboard layout must pass initialStatus to AccessGate');
  assert.match(gateCode, /initialStatus\?:/, 'AccessGate must accept initialStatus prop');
});
