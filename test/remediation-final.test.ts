import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// Remediation Final Regression Gate
// Every finding from the audit must have a corresponding pass.
// ============================================================

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function readHook(name: string): string {
  return read(`src/lib/hooks/${name}`);
}

// ── MED-01: useTransaction ────────────────────────────────────
test('REMEDIATION [MED-01]: useTransaction has getUser + user_id filter', () => {
  const code = readHook('use-transactions.ts');
  const start = code.indexOf('export function useTransaction(id');
  const end = code.indexOf('export function useCreateTransaction');
  const body = code.slice(start, end);
  assert.match(body, /getUser\(\)/, 'FIXED: getUser() present');
  assert.match(body, /\.eq\('user_id',\s*user\.id\)/, 'FIXED: user_id filter present');
});

// ── MED-02: useInvestment ─────────────────────────────────────
test('REMEDIATION [MED-02]: useInvestment has getUser + user_id filter', () => {
  const code = readHook('use-investments.ts');
  const start = code.indexOf('export function useInvestment(id');
  const end = code.indexOf('export function useCreateInvestment');
  const body = code.slice(start, end);
  assert.match(body, /getUser\(\)/, 'FIXED: getUser() present');
  assert.match(body, /\.eq\('user_id',\s*userData\.user\.id\)/, 'FIXED: user_id filter present');
});

// ── MED-03: useAccount + useAccounts ─────────────────────────
test('REMEDIATION [MED-03a]: useAccounts has getUser + user_id filter', () => {
  const code = readHook('use-accounts.ts');
  const start = code.indexOf('export function useAccounts(');
  const end = code.indexOf('export function useAccount(');
  const body = code.slice(start, end);
  assert.match(body, /getUser\(\)/, 'FIXED: getUser() in useAccounts');
  assert.match(body, /\.eq\('user_id',\s*user\.id\)/, 'FIXED: user_id filter in useAccounts');
});

test('REMEDIATION [MED-03b]: useAccount(id) has getUser + user_id filter', () => {
  const code = readHook('use-accounts.ts');
  const start = code.indexOf('export function useAccount(id');
  const body = code.slice(start, start + 700);
  assert.match(body, /getUser\(\)/, 'FIXED: getUser() in useAccount');
  assert.match(body, /\.eq\('user_id',\s*user\.id\)/, 'FIXED: user_id filter in useAccount');
});

// ── MED-04: useLinkTransactions ───────────────────────────────
test('REMEDIATION [MED-04]: useLinkTransactions has auth + user_id on both mutations', () => {
  const code = readHook('use-transactions.ts');
  const start = code.indexOf('export function useLinkTransactions');
  const body = code.slice(start, start + 1000);
  assert.match(body, /getUser\(\)/, 'FIXED: getUser() present');
  const count = (body.match(/\.eq\('user_id',\s*user\.id\)/g) || []).length;
  assert.ok(count >= 2, `FIXED: both mutations have user_id filter (found ${count})`);
});

// ── MED-05: useDocuments ──────────────────────────────────────
test('REMEDIATION [MED-05]: useDocuments has getUser + user_id filter', () => {
  const code = readHook('use-documents.ts');
  const start = code.indexOf('export function useDocuments(');
  const end = code.indexOf('export function useUploadDocument') !== -1
    ? code.indexOf('export function useUploadDocument')
    : start + 800;
  const body = code.slice(start, end);
  assert.match(body, /getUser\(\)/, 'FIXED: getUser() present');
  assert.match(body, /\.eq\('user_id',\s*user\.id\)/, 'FIXED: user_id filter present');
});

// ── MED-06: useNotifications + useMarkNotificationRead ────────
test('REMEDIATION [MED-06a]: useNotifications has getUser + user_id filter', () => {
  const code = readHook('use-notifications.ts');
  const start = code.indexOf('export function useNotifications(');
  const end = code.indexOf('export function useMarkNotificationRead');
  const body = code.slice(start, end);
  assert.match(body, /getUser\(\)/, 'FIXED: getUser() in useNotifications');
  assert.match(body, /\.eq\('user_id',\s*user\.id\)/, 'FIXED: user_id in useNotifications');
});

test('REMEDIATION [MED-06b]: useMarkNotificationRead has getUser + user_id filter', () => {
  const code = readHook('use-notifications.ts');
  const start = code.indexOf('export function useMarkNotificationRead');
  const end = code.indexOf('export function useMarkAllRead');
  const body = code.slice(start, end);
  assert.match(body, /getUser\(\)/, 'FIXED: getUser() in useMarkNotificationRead');
  assert.match(body, /\.eq\('user_id',\s*user\.id\)/, 'FIXED: user_id in useMarkNotificationRead');
});

// ── LOW-02: useAccountStats ───────────────────────────────────
test('REMEDIATION [LOW-02]: useAccountStats transaction query has user_id filter', () => {
  const code = readHook('use-accounts.ts');
  const start = code.indexOf('export function useAccountStats(');
  const body = code.slice(start, start + 900);
  assert.match(body, /getUser\(\)/, 'FIXED: getUser() in useAccountStats');
  assert.match(body, /\.eq\('user_id',\s*user\.id\)/, 'FIXED: user_id in transaction query');
});

// ── LOW-05: admin_exists() RPC ────────────────────────────────
test('REMEDIATION [LOW-05]: useAdminExists uses admin_exists() RPC not direct table read', () => {
  const code = read('src/lib/hooks/use-admin.ts');
  const start = code.indexOf('export function useAdminExists');
  const body = code.slice(start, start + 600);
  assert.match(body, /rpc\(.*admin_exists/, 'FIXED: uses admin_exists RPC');
  assert.ok(!body.includes(".from('app_admin_users')"), 'FIXED: no direct table read');
});

// ── LOW-03: Prompt injection escaping ────────────────────────
test('REMEDIATION [LOW-03]: escapeForPrompt applied to all user strings in chat', () => {
  const code = read('src/app/api/chat/route.ts');
  assert.match(code, /function escapeForPrompt/, 'FIXED: escapeForPrompt helper defined');
  assert.match(code, /escapeForPrompt\(acc\.name\)/, 'FIXED: account names escaped');
  assert.match(code, /escapeForPrompt\(p\.name\)/, 'FIXED: counterparty names escaped');
  assert.match(code, /escapeForPrompt\(.*description/, 'FIXED: tx descriptions escaped');
});

// ── AI-01: System prompt non-disclosure ───────────────────────
test('REMEDIATION [AI-01]: System prompt has confidentiality/non-disclosure rule', () => {
  const code = read('src/app/api/chat/route.ts');
  assert.match(code, /Confidentiality.*Never reveal|6\.\s*Confidentiality/is, 
    'FIXED: non-disclosure rule present in system prompt');
});

// ── LOW-01 + LOW-12: Categorize index-based AI ───────────────
test('REMEDIATION [LOW-01]: Categorize route uses index not UUID in AI prompt', () => {
  const code = read('src/app/api/ai/categorize/route.ts');
  assert.doesNotMatch(code, /`- ID: \${c\.id}/, 'FIXED: no UUID in AI prompt');
  assert.match(code, /categoryIndex/, 'FIXED: uses categoryIndex');
});

test('REMEDIATION [LOW-12]: Categorize validates index bounds and resolves UUID server-side', () => {
  const code = read('src/app/api/ai/categorize/route.ts');
  assert.match(code, /categoryRows\.length/, 'FIXED: bounds check present');
  assert.match(code, /resolvedCategory\.id/, 'FIXED: server-side UUID resolution');
  assert.match(code, /422/, 'FIXED: 422 on invalid index');
});

// ── LOW-04 + P5: Body size + Zod ─────────────────────────────
test('REMEDIATION [LOW-04]: Chat route enforces body size limit', () => {
  const code = read('src/app/api/chat/route.ts');
  assert.match(code, /MAX_BODY_BYTES|50_000/, 'FIXED: body size constant defined');
  assert.match(code, /content-length/, 'FIXED: Content-Length header checked');
  assert.match(code, /413/, 'FIXED: 413 response on oversized body');
});

test('REMEDIATION [BE-01]: Chat route uses Zod for message shape validation', () => {
  const code = read('src/app/api/chat/route.ts');
  assert.match(code, /MessageSchema\s*=\s*z\.object/, 'FIXED: Zod schema defined');
  assert.match(code, /z\.array\(MessageSchema\)\.safeParse/, 'FIXED: applied to messages');
  assert.match(code, /parseResult\.data/, 'FIXED: validated data used');
});

// ── BE-02 / LOW-11: Rate limit buckets ────────────────────────
test('REMEDIATION [BE-02]: Preview and execute have separate rate-limit buckets', () => {
  const rateCode = read('src/lib/security/rate-limit.ts');
  assert.match(rateCode, /reset_data_preview/, 'FIXED: preview uses own bucket');
  assert.match(rateCode, /reset_data_execute/, 'FIXED: execute uses own bucket');
  
  const previewRoute = read('src/app/api/account/reset-data/preview/route.ts');
  assert.match(previewRoute, /checkPreviewRateLimit/, 'FIXED: preview route uses checkPreviewRateLimit');
  assert.doesNotMatch(previewRoute, /checkResetDataRateLimit/, 'FIXED: preview does not use execute bucket');
});

// ── DB-01: app_admin_users RLS ────────────────────────────────
test('REMEDIATION [DB-01]: Migration 024 restricts app_admin_users SELECT to own row', () => {
  const migDir = path.join(process.cwd(), 'supabase', 'migrations');
  const file = fs.readdirSync(migDir).find(f => f.startsWith('024'));
  assert.ok(file, 'FIXED: migration 024 exists');
  const content = fs.readFileSync(path.join(migDir, file!), 'utf8');
  assert.match(content, /DROP POLICY.*Users can view admin status/, 
    'FIXED: old permissive policy dropped');
  assert.match(content, /Users can view own admin status/, 
    'FIXED: restricted policy created');
  assert.match(content, /admin_exists.*SECURITY DEFINER|SECURITY DEFINER.*admin_exists/s, 
    'FIXED: admin_exists() SECURITY DEFINER function created');
});

// ── DB-05: Notifications RLS ──────────────────────────────────
test('REMEDIATION [DB-05]: Notifications table has full ownership RLS in migration 024', () => {
  const migDir = path.join(process.cwd(), 'supabase', 'migrations');
  const file = fs.readdirSync(migDir).find(f => f.startsWith('024'));
  const content = fs.readFileSync(path.join(migDir, file!), 'utf8');
  const requiredPolicies = [
    'notifications_select_own',
    'notifications_insert_own', 
    'notifications_update_own',
    'notifications_delete_own',
    'approved_users_only_notifications',
  ];
  for (const policy of requiredPolicies) {
    assert.match(content, new RegExp(policy), `FIXED: ${policy} policy present`);
  }
});
