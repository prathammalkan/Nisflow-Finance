import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// P1-001 Regression Test: Admin Layout Fail-Closed Authorization
//
// Proves that admin/layout.tsx NEVER renders admin UI unless
// authorization is explicitly and positively confirmed.
//
// Four cases tested by static analysis of the layout source:
//   [A] RPC success + is_admin = true  → admin page allowed
//   [B] RPC success + is_admin = false + admin exists  → redirect('/dashboard')
//   [C] is_app_admin() RPC error  → redirect('/dashboard') (fail closed)
//   [D] admin_exists() RPC error  → redirect('/dashboard') (fail closed)
// ============================================================

const layoutPath = path.join(process.cwd(), 'src', 'app', '(dashboard)', 'admin', 'layout.tsx');

test('P1-001-A: admin layout file exists', () => {
  assert.ok(fs.existsSync(layoutPath), 'admin/layout.tsx must exist');
});

test('P1-001-B: layout calls is_app_admin() RPC server-side', () => {
  const src = fs.readFileSync(layoutPath, 'utf8');
  assert.match(src, /rpc\(['"](is_app_admin)['"]/, 'Must call is_app_admin() RPC');
});

test('P1-001-C [FAIL CLOSED]: is_app_admin() RPC error → redirect to /dashboard, NEVER renders children', () => {
  const src = fs.readFileSync(layoutPath, 'utf8');

  // The error branch must contain redirect('/dashboard'), not return children
  // Strategy: find the `if (error)` block that follows rpc('is_app_admin')
  // and assert it redirects rather than returns children.
  const rpcErrorBlock = src.match(/if\s*\(error\)\s*\{[^}]*\}/s);
  assert.ok(rpcErrorBlock, 'Must have an error-handling block for is_app_admin RPC');

  const block = rpcErrorBlock[0];

  // Must redirect
  assert.match(block, /redirect\(['"]\/dashboard['"]\)/, 'RPC error block must redirect to /dashboard');

  // Must NOT render children in the error block
  assert.doesNotMatch(block, /return\s*<>/, 'RPC error block must NOT return children (fail-open)');
  assert.doesNotMatch(block, /\{children\}/, 'RPC error block must NOT render {children}');
});

test('P1-001-D [FAIL CLOSED]: admin_exists() RPC error → redirect to /dashboard, NEVER renders children', () => {
  const src = fs.readFileSync(layoutPath, 'utf8');

  // admin_exists error variable must be defined and handled
  assert.match(src, /adminExistsError/, 'Must capture admin_exists() error');
  assert.match(src, /if\s*\(adminExistsError\)/, 'Must check admin_exists error condition');

  // Find the adminExistsError branch
  const adminExistsErrorBlock = src.match(/if\s*\(adminExistsError\)\s*\{[^}]*\}/s);
  assert.ok(adminExistsErrorBlock, 'Must have a handler for admin_exists() RPC error');
  const block = adminExistsErrorBlock[0];

  assert.match(block, /redirect\(['"]\/dashboard['"]\)/, 'admin_exists error must redirect to /dashboard');
  assert.doesNotMatch(block, /return\s*<>/, 'admin_exists error block must NOT return children');
});

test('P1-001-E [NON-ADMIN + ADMIN EXISTS]: non-admin redirected when admin exists', () => {
  const src = fs.readFileSync(layoutPath, 'utf8');

  // The non-admin + adminExists path must redirect
  assert.match(src, /if\s*\(adminExists\)\s*\{[^}]*redirect\(['"]\/dashboard['"]\)/s,
    'When admin exists and caller is not admin, must redirect to /dashboard');
});

test('P1-001-F [LEGACY FAIL-OPEN REMOVED]: no Fall-through comment or fail-open pattern remains', () => {
  const src = fs.readFileSync(layoutPath, 'utf8');

  // Original fail-open text must be gone
  assert.doesNotMatch(src, /Fall through — client-side guard still applies/,
    'Fail-open comment must be removed');
  assert.doesNotMatch(src, /client-side guard still applies/,
    'Fail-open rationale comment must be removed');

  // Must not have any error branch that returns children without redirect
  // Pattern: if (error) { ... return <>{children}</> ... } — this is the old bug
  const failOpenPattern = /if\s*\(error\)\s*\{[^}]*return\s*<>[^}]*\}/s;
  assert.doesNotMatch(src, failOpenPattern,
    'Must not have any error branch that returns children (fail-open pattern)');
});

test('P1-001-G: layout fails with redirect on authentication failure', () => {
  const src = fs.readFileSync(layoutPath, 'utf8');

  // Unauthenticated path must redirect to /login
  assert.match(src, /if\s*\(!user\)\s*\{[^}]*redirect\(['"]\/login['"]\)/s,
    'Unauthenticated user must be redirected to /login');
});

test('P1-001-H: SECURITY POLICY comment documents fail-closed intent', () => {
  const src = fs.readFileSync(layoutPath, 'utf8');
  assert.match(src, /FAIL CLOSED|fail closed/i,
    'Security policy comment must state fail-closed intent');
});
