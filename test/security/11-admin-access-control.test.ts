import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// Phase 11: Admin Access Control Security Test Suite
// ============================================================

const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '023_admin_access_control_and_force_rls.sql');

test('ADMIN [11-01]: Migration 023 exists and implements FORCE ROW LEVEL SECURITY', () => {
  assert.ok(fs.existsSync(migrationPath), '023_admin_access_control_and_force_rls.sql must exist');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Verify FORCE RLS is applied
  assert.match(sql, /FORCE ROW LEVEL SECURITY/i, 'Migration must include FORCE ROW LEVEL SECURITY');

  // Verify all critical financial tables are in the FORCE RLS array
  const requiredTables = [
    'accounts', 'transactions', 'journal_entries', 'journal_lines',
    'ledger_accounts', 'investments', 'loans', 'counterparties',
    'receivables', 'payables', 'documents', 'budgets',
  ];

  for (const table of requiredTables) {
    assert.ok(
      sql.includes(`'${table}'`),
      `Table '${table}' must be included in FORCE RLS migration`,
    );
  }
});

test('ADMIN [11-02]: app_access_settings table is created with correct schema', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.app_access_settings/, 'app_access_settings table must be created');
  assert.match(sql, /registration_mode TEXT NOT NULL DEFAULT 'public'/, 'registration_mode must default to public');
  assert.match(sql, /CHECK \(registration_mode IN \('public', 'approval_required'\)\)/, 'registration_mode must be constrained');
  assert.match(sql, /ALTER TABLE public\.app_access_settings ENABLE ROW LEVEL SECURITY/, 'RLS must be enabled');
  assert.match(sql, /ALTER TABLE public\.app_access_settings FORCE ROW LEVEL SECURITY/, 'FORCE RLS must be applied');
});

test('ADMIN [11-03]: user_access_control table is created with correct schema', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.user_access_control/, 'user_access_control table must be created');
  assert.match(sql, /status TEXT NOT NULL DEFAULT 'approved'/, 'status must default to approved');
  assert.match(sql, /CHECK \(status IN \('pending', 'approved', 'suspended'\)\)/, 'status must be constrained');
  assert.match(sql, /approved_by UUID/, 'approved_by field must exist');
  assert.match(sql, /suspended_by UUID/, 'suspended_by field must exist');
});

test('ADMIN [11-04]: app_admin_users table uses FORCE RLS and proper policies', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.app_admin_users/, 'app_admin_users table must be created');
  assert.match(sql, /ALTER TABLE public\.app_admin_users ENABLE ROW LEVEL SECURITY/, 'RLS must be enabled');
  assert.match(sql, /ALTER TABLE public\.app_admin_users FORCE ROW LEVEL SECURITY/, 'FORCE RLS must be applied');
});

test('ADMIN [11-05]: is_app_admin() helper function is SECURITY DEFINER with search_path', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.is_app_admin/, 'is_app_admin function must exist');
  assert.match(sql, /SECURITY DEFINER SET search_path = public/, 'is_app_admin must be SECURITY DEFINER with search_path');
});

test('ADMIN [11-06]: bootstrap_first_admin() can only be called when no admin exists', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.bootstrap_first_admin/, 'bootstrap_first_admin function must exist');
  assert.match(sql, /Admin already exists/, 'Must reject bootstrap when admin already exists');
  assert.match(sql, /auth\.uid\(\)/, 'Must verify authentication');
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.bootstrap_first_admin\(\) FROM PUBLIC/, 'Must REVOKE from PUBLIC');
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.bootstrap_first_admin\(\) TO authenticated/, 'Must GRANT to authenticated');
});

test('ADMIN [11-07]: Admin RPCs enforce is_app_admin() authorization check', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const adminRpcs = ['approve_user', 'suspend_user', 'reactivate_user', 'set_registration_mode', 'get_admin_user_list'];

  for (const rpc of adminRpcs) {
    assert.match(
      sql,
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}`),
      `${rpc} RPC must exist`,
    );

    // Extract the function body to check for admin check
    const funcRegex = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${rpc}[\\s\\S]*?\\$\\$ LANGUAGE`, 'g');
    const match = sql.match(funcRegex);
    assert.ok(match && match[0].includes('is_app_admin'), `${rpc} must check is_app_admin()`);
  }
});

test('ADMIN [11-08]: suspend_user() cannot suspend another admin', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const suspendFunc = sql.match(/CREATE OR REPLACE FUNCTION public\.suspend_user[\s\S]*?\$\$ LANGUAGE/);
  assert.ok(suspendFunc, 'suspend_user function must exist');
  assert.ok(
    suspendFunc[0].includes('Cannot suspend another admin'),
    'suspend_user must block suspending admins',
  );
});

test('ADMIN [11-09]: admin_audit_log table records all admin actions', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.admin_audit_log/, 'admin_audit_log table must exist');
  assert.match(sql, /USER_APPROVED/, 'Must track USER_APPROVED action');
  assert.match(sql, /USER_SUSPENDED/, 'Must track USER_SUSPENDED action');
  assert.match(sql, /USER_REACTIVATED/, 'Must track USER_REACTIVATED action');
  assert.match(sql, /REGISTRATION_MODE_CHANGED/, 'Must track REGISTRATION_MODE_CHANGED action');
});

test('ADMIN [11-10]: RESTRICTIVE RLS policies isolate pending/suspended users from financial data', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /is_user_approved\(\)/, 'is_user_approved helper function must exist');
  assert.match(sql, /AS RESTRICTIVE/, 'Policies must be RESTRICTIVE (AND with existing permissive policies)');
  assert.match(sql, /approved_users_only/, 'Restrictive policies must be named approved_users_only_*');

  // Verify the function handles missing records gracefully
  assert.match(sql, /COALESCE/, 'is_user_approved must use COALESCE for backward compatibility');
});

test('ADMIN [11-11]: handle_new_user() creates user_access_control record based on registration mode', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  const handleNewUser = sql.match(/CREATE OR REPLACE FUNCTION public\.handle_new_user[\s\S]*?\$\$ LANGUAGE plpgsql[^;]*/);
  assert.ok(handleNewUser, 'handle_new_user function must be recreated');
  assert.ok(
    handleNewUser[0].includes('user_access_control'),
    'handle_new_user must insert into user_access_control',
  );
  assert.ok(
    handleNewUser[0].includes('app_access_settings'),
    'handle_new_user must check app_access_settings for registration mode',
  );
  assert.ok(
    handleNewUser[0].includes('SECURITY DEFINER SET search_path'),
    'handle_new_user must be SECURITY DEFINER with SET search_path',
  );
});

test('ADMIN [11-12]: Audit_logs INSERT policy no longer uses WITH CHECK (true)', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Must drop the dangerous policy
  assert.match(sql, /DROP POLICY IF EXISTS "System can insert audit logs"/, 'Must drop dangerous WITH CHECK (true) policy');

  // New policy must restrict to own user_id
  assert.match(sql, /auth\.uid\(\) = user_id/, 'New audit_logs INSERT policy must check auth.uid() = user_id');
});

test('ADMIN [11-13]: reset_user_data() profiles update uses user_id instead of id', () => {
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Find the profiles update in reset_user_data
  const resetFunc = sql.match(/CREATE OR REPLACE FUNCTION public\.reset_user_data[\s\S]*?\$\$ LANGUAGE/);
  assert.ok(resetFunc, 'reset_user_data function must be recreated');

  // Check the profiles update clause
  const profilesUpdate = resetFunc[0].match(/UPDATE public\.profiles[\s\S]*?WHERE[\s\S]*?;/);
  assert.ok(profilesUpdate, 'Must contain profiles UPDATE statement');
  assert.ok(
    profilesUpdate[0].includes('user_id = v_user_id'),
    'Profiles update WHERE clause must use user_id = v_user_id (not id = v_user_id)',
  );
});

test('ADMIN [11-14]: Frontend admin hooks file exists with required exports', () => {
  const hooksPath = path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-admin.ts');
  assert.ok(fs.existsSync(hooksPath), 'use-admin.ts must exist');
  const code = fs.readFileSync(hooksPath, 'utf8');

  const requiredExports = [
    'useAccessStatus',
    'useAdminUserList',
    'useApproveUser',
    'useSuspendUser',
    'useReactivateUser',
    'useSetRegistrationMode',
    'useBootstrapAdmin',
  ];

  for (const exportName of requiredExports) {
    assert.ok(code.includes(exportName), `Must export ${exportName}`);
  }
});

test('ADMIN [11-15]: Admin panel page exists and enforces admin-only access', () => {
  const pagePath = path.join(process.cwd(), 'src', 'app', '(dashboard)', 'admin', 'page.tsx');
  assert.ok(fs.existsSync(pagePath), 'Admin page must exist at (dashboard)/admin/page.tsx');
  const code = fs.readFileSync(pagePath, 'utf8');

  assert.match(code, /is_admin/, 'Page must check is_admin status');
  assert.match(code, /Access Denied/, 'Page must show Access Denied for non-admins');
  assert.match(code, /bootstrap_first_admin|bootstrapAdmin|useBootstrapAdmin/, 'Page must support admin bootstrap');
});

test('ADMIN [11-16]: AccessGate component exists and gates dashboard layout', () => {
  const gatePath = path.join(process.cwd(), 'src', 'components', 'admin', 'access-gate.tsx');
  assert.ok(fs.existsSync(gatePath), 'AccessGate component must exist');
  const code = fs.readFileSync(gatePath, 'utf8');

  assert.match(code, /pending/, 'Must handle pending status');
  assert.match(code, /suspended/, 'Must handle suspended status');

  // Verify it's used in the dashboard layout
  const layoutPath = path.join(process.cwd(), 'src', 'app', '(dashboard)', 'layout.tsx');
  const layoutCode = fs.readFileSync(layoutPath, 'utf8');
  assert.match(layoutCode, /AccessGate/, 'Dashboard layout must use AccessGate component');
});

test('ADMIN [11-17]: Next.js 16 proxy.ts exports "proxy" per framework convention', () => {
  // Next.js 16 uses "proxy" convention (not "middleware") — verified from build warning
  const proxyPath = path.join(process.cwd(), 'src', 'proxy.ts');
  assert.ok(fs.existsSync(proxyPath), 'proxy.ts must exist in src/');
  const code = fs.readFileSync(proxyPath, 'utf8');

  assert.match(code, /export async function proxy/, 'Must export function named "proxy" per Next.js 16 convention');
  assert.doesNotMatch(code, /export async function middleware/, 'Must NOT export "middleware" (deprecated in Next.js 16)');
});

test('SEC [11-18]: vercel.json must not contain hardcoded API keys or secrets', () => {
  const vercelPath = path.join(process.cwd(), 'vercel.json');
  if (!fs.existsSync(vercelPath)) return;
  const content = fs.readFileSync(vercelPath, 'utf8');

  assert.doesNotMatch(content, /ANON_KEY/, 'vercel.json must not contain ANON_KEY');
  assert.doesNotMatch(content, /eyJhbGciOi/, 'vercel.json must not contain JWT tokens');
  assert.doesNotMatch(content, /supabase\.co/, 'vercel.json should not hardcode Supabase URL');
});

test('SEC [11-19]: console.log in API routes must be guarded for production', () => {
  const chatRoute = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const resetRoute = path.join(process.cwd(), 'src', 'app', 'api', 'account', 'reset-data', 'route.ts');

  for (const routePath of [chatRoute, resetRoute]) {
    const code = fs.readFileSync(routePath, 'utf8');
    const lines = code.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('console.log(') && !line.startsWith('//')) {
        // Check the previous line for NODE_ENV guard
        const prevLine = i > 0 ? lines[i - 1].trim() : '';
        assert.ok(
          prevLine.includes('NODE_ENV') || prevLine.includes('production') || line.includes('NODE_ENV'),
          `Unguarded console.log at ${path.basename(routePath)}:${i + 1}: ${line.substring(0, 80)}`,
        );
      }
    }
  }
});
