import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// IDOR Multi-User Regression Test Suite
// Verifies that all hooks fixed in the remediation have:
//   1. getUser() authentication check
//   2. .eq('user_id', user.id) application-layer filter
// for defense-in-depth against single-point-of-failure RLS bypass.
// ============================================================

function readHook(name: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'hooks', name), 'utf8');
}

// ── useTransaction ──────────────────────────────────────────
test('IDOR [12-01]: useTransaction adds getUser() auth check before DB query', () => {
  const code = readHook('use-transactions.ts');
  const fnStart = code.indexOf('export function useTransaction(id');
  assert.ok(fnStart !== -1, 'useTransaction must exist');
  const fnBody = code.slice(fnStart, fnStart + 600);
  assert.match(fnBody, /getUser\(\)/, 'useTransaction must call getUser()');
  assert.match(fnBody, /Not authenticated/, 'useTransaction must throw on unauthenticated');
});

test('IDOR [12-02]: useTransaction scopes query by user_id (MED-01)', () => {
  const code = readHook('use-transactions.ts');
  const fnStart = code.indexOf('export function useTransaction(id');
  const fnEnd = code.indexOf('export function useCreateTransaction');
  const fnBody = code.slice(fnStart, fnEnd);
  assert.match(fnBody, /\.eq\('user_id'/, 'useTransaction must filter by user_id');
  assert.match(fnBody, /user\.id/, 'useTransaction must use authenticated user.id');
});

test('IDOR [12-03]: useLinkTransactions adds getUser() auth check (MED-04)', () => {
  const code = readHook('use-transactions.ts');
  const fnStart = code.indexOf('export function useLinkTransactions');
  assert.ok(fnStart !== -1, 'useLinkTransactions must exist');
  const fnBody = code.slice(fnStart, fnStart + 900);
  assert.match(fnBody, /getUser\(\)/, 'useLinkTransactions must call getUser()');
  assert.match(fnBody, /Not authenticated/, 'useLinkTransactions must throw on unauthenticated');
});

test('IDOR [12-04]: useLinkTransactions scopes BOTH update mutations by user_id (MED-04)', () => {
  const code = readHook('use-transactions.ts');
  const fnStart = code.indexOf('export function useLinkTransactions');
  // Use 1500 chars to capture both mutation blocks (second mutation appears ~600 chars in)
  const fnBody = code.slice(fnStart, fnStart + 1500);
  // Both .eq('id', fromId) and .eq('id', toId) must be accompanied by user_id scoping
  const userIdMatches = (fnBody.match(/\.eq\('user_id'/g) || []).length;
  assert.ok(userIdMatches >= 2, `useLinkTransactions must have user_id filter on both mutations, found: ${userIdMatches}`);
});

// ── useInvestment ────────────────────────────────────────────
test('IDOR [12-05]: useInvestment adds getUser() auth check (MED-02)', () => {
  const code = readHook('use-investments.ts');
  const fnStart = code.indexOf('export function useInvestment(id');
  assert.ok(fnStart !== -1, 'useInvestment must exist');
  const fnBody = code.slice(fnStart, fnStart + 700);
  assert.match(fnBody, /getUser\(\)/, 'useInvestment must call getUser()');
});

test('IDOR [12-06]: useInvestment scopes query by user_id (MED-02)', () => {
  const code = readHook('use-investments.ts');
  const fnStart = code.indexOf('export function useInvestment(id');
  const fnEnd = code.indexOf('export function useCreateInvestment');
  const fnBody = code.slice(fnStart, fnEnd);
  assert.match(fnBody, /\.eq\('user_id'/, 'useInvestment must filter by user_id');
});

// ── useAccount / useAccounts ─────────────────────────────────
test('IDOR [12-07]: useAccounts adds getUser() auth check (MED-03)', () => {
  const code = readHook('use-accounts.ts');
  const fnStart = code.indexOf('export function useAccounts(');
  assert.ok(fnStart !== -1, 'useAccounts must exist');
  const fnEnd = code.indexOf('export function useAccount(');
  const fnBody = code.slice(fnStart, fnEnd);
  assert.match(fnBody, /getUser\(\)/, 'useAccounts must call getUser()');
  assert.match(fnBody, /\.eq\('user_id'/, 'useAccounts must filter by user_id');
});

test('IDOR [12-08]: useAccount(id) adds getUser() and user_id filter (MED-03)', () => {
  const code = readHook('use-accounts.ts');
  const fnStart = code.indexOf('export function useAccount(id');
  assert.ok(fnStart !== -1, 'useAccount must exist');
  const fnBody = code.slice(fnStart, fnStart + 700);
  assert.match(fnBody, /getUser\(\)/, 'useAccount must call getUser()');
  assert.match(fnBody, /\.eq\('user_id'/, 'useAccount must filter by user_id');
});

test('IDOR [12-09]: useAccountStats adds getUser() and user_id filter (LOW-02)', () => {
  const code = readHook('use-accounts.ts');
  const fnStart = code.indexOf('export function useAccountStats(');
  assert.ok(fnStart !== -1, 'useAccountStats must exist');
  const fnBody = code.slice(fnStart, fnStart + 900);
  assert.match(fnBody, /getUser\(\)/, 'useAccountStats must call getUser()');
  assert.match(fnBody, /\.eq\('user_id'/, 'useAccountStats must filter transactions by user_id');
});

// ── useDocuments ─────────────────────────────────────────────
test('IDOR [12-10]: useDocuments adds getUser() and user_id filter (MED-05)', () => {
  const code = readHook('use-documents.ts');
  const fnStart = code.indexOf('export function useDocuments(');
  assert.ok(fnStart !== -1, 'useDocuments must exist');
  const fnEnd = code.indexOf('export function useUploadDocument');
  const fnBody = code.slice(fnStart, fnEnd);
  assert.match(fnBody, /getUser\(\)/, 'useDocuments must call getUser()');
  assert.match(fnBody, /\.eq\('user_id'/, 'useDocuments must filter by user_id');
});

// ── useNotifications ─────────────────────────────────────────
test('IDOR [12-11]: useNotifications adds getUser() and user_id filter (MED-06)', () => {
  const code = readHook('use-notifications.ts');
  const fnStart = code.indexOf('export function useNotifications(');
  assert.ok(fnStart !== -1, 'useNotifications must exist');
  const fnEnd = code.indexOf('export function useMarkNotificationRead');
  const fnBody = code.slice(fnStart, fnEnd);
  assert.match(fnBody, /getUser\(\)/, 'useNotifications must call getUser()');
  assert.match(fnBody, /\.eq\('user_id'/, 'useNotifications must filter by user_id');
});

test('IDOR [12-12]: useMarkNotificationRead adds getUser() and user_id filter (MED-06)', () => {
  const code = readHook('use-notifications.ts');
  const fnStart = code.indexOf('export function useMarkNotificationRead');
  assert.ok(fnStart !== -1, 'useMarkNotificationRead must exist');
  const fnEnd = code.indexOf('export function useMarkAllRead');
  const fnBody = code.slice(fnStart, fnEnd);
  assert.match(fnBody, /getUser\(\)/, 'useMarkNotificationRead must call getUser()');
  assert.match(fnBody, /\.eq\('user_id'/, 'useMarkNotificationRead must filter by user_id');
});

// ── Cross-tenant UUID reference prevention ───────────────────
test('IDOR [12-13]: useLinkTransactions cannot create dangling cross-tenant references', () => {
  const code = readHook('use-transactions.ts');
  const fnStart = code.indexOf('export function useLinkTransactions');
  // Use 1500 chars to capture both mutations
  const fnBody = code.slice(fnStart, fnStart + 1500);
  // Verify the code chain: for fromId mutation, user_id must be scoped
  assert.match(fnBody, /eq\('id', fromId\)[\s\S]{0,80}eq\('user_id'/, 
    'fromId update must be followed by user_id scope within 80 chars');
  // Verify the code chain: for toId mutation, user_id must be scoped
  assert.match(fnBody, /eq\('id', toId\)[\s\S]{0,80}eq\('user_id'/, 
    'toId update must be followed by user_id scope within 80 chars');
});

// ── useAdminExists uses RPC not direct table read ─────────────
test('IDOR [12-14]: useAdminExists uses admin_exists() RPC, not direct table read (LOW-05)', () => {
  const code = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-admin.ts'), 'utf8'
  );
  const fnStart = code.indexOf('export function useAdminExists');
  const fnBody = code.slice(fnStart, fnStart + 600);
  assert.match(fnBody, /rpc\(/, 'useAdminExists must use rpc() not direct table access');
  assert.match(fnBody, /admin_exists/, 'useAdminExists must call admin_exists RPC');
  // Must NOT read app_admin_users table directly
  const directRead = fnBody.includes(".from('app_admin_users')");
  assert.ok(!directRead, 'useAdminExists must NOT read app_admin_users table directly (exposes admin UUIDs)');
});

// ── Migration 024 existence ──────────────────────────────────
test('IDOR [12-15]: Migration 024 exists and fixes app_admin_users SELECT policy', () => {
  const migDir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = fs.readdirSync(migDir).filter(f => f.startsWith('024'));
  assert.ok(files.length > 0, 'Migration 024 must exist');
  const content = fs.readFileSync(path.join(migDir, files[0]), 'utf8');
  assert.match(content, /Users can view admin status/, 'Must DROP the overly-permissive policy');
  assert.match(content, /admin_exists/, 'Must create admin_exists() RPC');
  assert.match(content, /SECURITY DEFINER/, 'admin_exists() must be SECURITY DEFINER');
  assert.match(content, /notifications_select_own/, 'Must add notifications SELECT ownership policy');
  assert.match(content, /notifications_update_own/, 'Must add notifications UPDATE ownership policy');
});

// ── Notifications RLS ────────────────────────────────────────
test('IDOR [12-16]: Migration 024 adds full CRUD ownership RLS for notifications table', () => {
  const migDir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = fs.readdirSync(migDir).filter(f => f.startsWith('024'));
  const content = fs.readFileSync(path.join(migDir, files[0]), 'utf8');
  assert.match(content, /notifications_select_own/, 'SELECT policy must exist');
  assert.match(content, /notifications_insert_own/, 'INSERT policy must exist');
  assert.match(content, /notifications_update_own/, 'UPDATE policy must exist');
  assert.match(content, /notifications_delete_own/, 'DELETE policy must exist');
  assert.match(content, /approved_users_only_notifications/, 'RESTRICTIVE approved-users policy must exist');
  assert.match(content, /FORCE ROW LEVEL SECURITY/, 'FORCE RLS must be applied');
});

