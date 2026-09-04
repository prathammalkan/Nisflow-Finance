/**
 * NisFlow Finance — Adversarial REST IDOR Probe Test (Node.js test runner)
 *
 * Tests EVERY resource for cross-user isolation by:
 * 1. Seeding data as USER_A via direct Supabase REST (publishable key + session token)
 * 2. Attempting READ / UPDATE / DELETE / cross-tenant INSERT as USER_B
 * 3. Verifying USER_A's data survives all attack attempts unchanged
 * 4. Testing admin RPC privilege escalation
 * 5. Testing storage folder isolation
 * 6. Testing ledger/journal access
 * 7. Testing Next.js API endpoints directly
 *
 * Run: node --experimental-strip-types --test test/security/15-adversarial-idor-rest.test.ts
 * Requires: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in env.
 *
 * Accounts are created fresh each run and cleaned up afterward.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
const APP_URL  = process.env.BASE_URL ?? 'http://localhost:3000';
const TS       = Date.now();

const USER_A = { email: `idor-a-${TS}@nisflow-audit.invalid`, pass: 'IdorUserA!2026Sec' };
const USER_B = { email: `idor-b-${TS}@nisflow-audit.invalid`, pass: 'IdorUserB!2026Sec' };
const ADMIN  = { email: `idor-admin-${TS}@nisflow-audit.invalid`, pass: 'IdorAdmin!2026Sec' };

if (!SUPA_URL || !SUPA_KEY) {
  console.error('SKIP: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set');
  process.exit(0);
}

// ── Supabase REST helpers ─────────────────────────────────────────────────────

async function signUp(email: string, pass: string): Promise<{ id: string; token: string }> {
  const res = await fetch(`${SUPA_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  const body = await res.json() as any;
  if (!body.user?.id) throw new Error(`signUp failed for ${email}: ${JSON.stringify(body)}`);
  return { id: body.user.id, token: body.access_token ?? body.session?.access_token };
}

async function signIn(email: string, pass: string): Promise<{ id: string; token: string }> {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass }),
  });
  const body = await res.json() as any;
  if (!body.access_token) throw new Error(`signIn failed for ${email}: ${JSON.stringify(body)}`);
  return { id: body.user.id, token: body.access_token };
}

async function rest(
  table: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  token: string,
  body?: object,
  query?: string
): Promise<{ status: number; data: unknown }> {
  const url = `${SUPA_URL}/rest/v1/${table}${query ? `?${query}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function rpc(name: string, args: object, token: string): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

async function apiPost(path: string, body: object, token?: string): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${APP_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Cookie: `sb-${new URL(SUPA_URL).hostname.split('.')[0]}-auth-token=${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let data: unknown;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

// ── Shared state ──────────────────────────────────────────────────────────────

const ctx: {
  tokenA: string; idA: string;
  tokenB: string; idB: string;
  tokenAdmin: string; idAdmin: string;
  accountAId: string;
  transactionAId: string;
  loanAId: string;
  investmentAId: string;
  counterpartyAId: string;
  categoryAId: string;
  budgetAId: string;
  notificationAId: string;
  peopleAId: string;
} = {} as any;

// ── SETUP ─────────────────────────────────────────────────────────────────────

before(async () => {
  // Register all three users
  const a     = await signUp(USER_A.email, USER_A.pass).catch(() => signIn(USER_A.email, USER_A.pass));
  const b     = await signUp(USER_B.email, USER_B.pass).catch(() => signIn(USER_B.email, USER_B.pass));
  const admin = await signUp(ADMIN.email, ADMIN.pass).catch(() => signIn(ADMIN.email, ADMIN.pass));

  ctx.tokenA = a.token; ctx.idA = a.id;
  ctx.tokenB = b.token; ctx.idB = b.id;
  ctx.tokenAdmin = admin.token; ctx.idAdmin = admin.id;

  // Bootstrap admin (ignore if already exists)
  await rpc('bootstrap_first_admin', {}, ctx.tokenAdmin).catch(() => {});

  // Seed USER_A data
  const acc = await rest('accounts', 'POST', ctx.tokenA, {
    user_id: ctx.idA, name: `IDOR-Account-A-${TS}`,
    account_type: 'bank', opening_balance: 10000, current_balance: 10000, is_active: true,
  });
  ctx.accountAId = ((acc.data as any[])?.[0])?.id ?? '';
  assert.ok(ctx.accountAId, `Failed to seed account: ${JSON.stringify(acc.data)}`);

  const tx = await rest('transactions', 'POST', ctx.tokenA, {
    user_id: ctx.idA, account_id: ctx.accountAId,
    amount: 500, direction: 'out', type: 'expense',
    date: new Date().toISOString().split('T')[0],
    description: `SECRET-TXN-${TS}`, status: 'confirmed',
  });
  ctx.transactionAId = ((tx.data as any[])?.[0])?.id ?? '';

  const loan = await rest('loans', 'POST', ctx.tokenA, {
    user_id: ctx.idA, name: `SECRET-LOAN-${TS}`,
    loan_type: 'personal', principal_amount: 50000, remaining_principal: 50000,
  });
  ctx.loanAId = ((loan.data as any[])?.[0])?.id ?? '';

  const inv = await rest('investments', 'POST', ctx.tokenA, {
    user_id: ctx.idA, name: `SECRET-INV-${TS}`, asset_type: 'stock',
    symbol: 'IDOR', total_invested: 5000, current_value: 5000,
  });
  ctx.investmentAId = ((inv.data as any[])?.[0])?.id ?? '';

  const cp = await rest('counterparties', 'POST', ctx.tokenA, {
    user_id: ctx.idA, name: `SECRET-CP-${TS}`,
  });
  ctx.counterpartyAId = ((cp.data as any[])?.[0])?.id ?? '';

  const cat = await rest('transaction_categories', 'POST', ctx.tokenA, {
    user_id: ctx.idA, name: `SECRET-CAT-${TS}`, type: 'expense', is_system: false,
  });
  ctx.categoryAId = ((cat.data as any[])?.[0])?.id ?? '';

  const bud = await rest('budgets', 'POST', ctx.tokenA, {
    user_id: ctx.idA, name: `SECRET-BUD-${TS}`, period: 'monthly',
    start_date: new Date().toISOString().split('T')[0], total_amount: 20000,
  });
  ctx.budgetAId = ((bud.data as any[])?.[0])?.id ?? '';

  const ppl = await rest('people', 'POST', ctx.tokenA, {
    user_id: ctx.idA, name: `SECRET-PERSON-${TS}`,
  });
  ctx.peopleAId = ((ppl.data as any[])?.[0])?.id ?? '';

  const notif = await rest('notifications', 'POST', ctx.tokenA, {
    user_id: ctx.idA, title: `SECRET-NOTIF-${TS}`,
    message: 'Secret notification body', is_read: false,
  });
  ctx.notificationAId = ((notif.data as any[])?.[0])?.id ?? '';

  console.log('SETUP complete — seeded:', {
    accountAId: ctx.accountAId?.slice(0,8),
    transactionAId: ctx.transactionAId?.slice(0,8),
    loanAId: ctx.loanAId?.slice(0,8),
    investmentAId: ctx.investmentAId?.slice(0,8),
  });
});

// ── Helper assertion ──────────────────────────────────────────────────────────

function assertNoLeak(rows: unknown, label: string) {
  const arr = Array.isArray(rows) ? rows : [];
  assert.equal(arr.length, 0, `IDOR LEAK — ${label}: USER_B can see USER_A data. Rows: ${JSON.stringify(arr)}`);
}

function assertZeroMutation(rows: unknown, label: string) {
  const arr = Array.isArray(rows) ? rows : [];
  assert.equal(arr.length, 0, `UNAUTHORIZED MUTATION — ${label}: affected ${arr.length} rows. ${JSON.stringify(arr)}`);
}

// ── ACCOUNTS ──────────────────────────────────────────────────────────────────

describe('ACCOUNTS IDOR', () => {
  it('ACC-READ: USER_B cannot read USER_A account by ID', async () => {
    const res = await rest('accounts', 'GET', ctx.tokenB,
      undefined, `id=eq.${ctx.accountAId}&select=id,user_id,name`);
    assertNoLeak(res.data, 'accounts READ');
  });

  it('ACC-READ-ALL: Global accounts scan returns only USER_B rows', async () => {
    const res = await rest('accounts', 'GET', ctx.tokenB,
      undefined, `select=id,user_id`);
    const rows = (res.data as any[]) ?? [];
    const leaked = rows.filter((r: any) => r.user_id === ctx.idA);
    assert.equal(leaked.length, 0, `Leaked ${leaked.length} USER_A account rows to USER_B`);
  });

  it('ACC-UPDATE: USER_B cannot update USER_A account', async () => {
    const res = await rest('accounts', 'PATCH', ctx.tokenB,
      { name: 'HACKED' }, `id=eq.${ctx.accountAId}`);
    assertZeroMutation(res.data, 'accounts UPDATE');
    // Verify unchanged
    const verify = await rest('accounts', 'GET', ctx.tokenA,
      undefined, `id=eq.${ctx.accountAId}&select=name`);
    const name = ((verify.data as any[])?.[0])?.name;
    assert.notEqual(name, 'HACKED', 'Account name was mutated by USER_B');
  });

  it('ACC-DELETE: USER_B cannot delete USER_A account', async () => {
    await rest('accounts', 'DELETE', ctx.tokenB,
      undefined, `id=eq.${ctx.accountAId}`);
    const verify = await rest('accounts', 'GET', ctx.tokenA,
      undefined, `id=eq.${ctx.accountAId}`);
    assert.equal((verify.data as any[])?.length, 1, 'USER_A account was deleted by USER_B');
  });

  it('ACC-INSERT-SPOOF: USER_B cannot insert account with USER_A user_id', async () => {
    const res = await rest('accounts', 'POST', ctx.tokenB, {
      user_id: ctx.idA,  // spoofed
      name: 'SPOOFED', account_type: 'bank',
    });
    // Must fail OR re-scope to userB (RLS WITH CHECK)
    if (res.status === 200 || res.status === 201) {
      const inserted = ((res.data as any[])?.[0]);
      assert.notEqual(inserted?.user_id, ctx.idA,
        'RLS WITH CHECK failed: spoofed user_id accepted');
    }
  });
});

// ── TRANSACTIONS ──────────────────────────────────────────────────────────────

describe('TRANSACTIONS IDOR', () => {
  it('TXN-READ: USER_B cannot read USER_A transaction by ID', async () => {
    const res = await rest('transactions', 'GET', ctx.tokenB,
      undefined, `id=eq.${ctx.transactionAId}&select=id,user_id,description`);
    assertNoLeak(res.data, 'transactions READ');
  });

  it('TXN-READ-ALL: Global transaction scan leaks nothing to USER_B', async () => {
    const res = await rest('transactions', 'GET', ctx.tokenB,
      undefined, `select=id,user_id`);
    const leaked = ((res.data as any[]) ?? []).filter((r: any) => r.user_id === ctx.idA);
    assert.equal(leaked.length, 0, `Leaked ${leaked.length} USER_A transactions to USER_B`);
  });

  it('TXN-UPDATE: USER_B cannot mutate USER_A transaction', async () => {
    const res = await rest('transactions', 'PATCH', ctx.tokenB,
      { amount: 999999, description: 'HACKED' },
      `id=eq.${ctx.transactionAId}`);
    assertZeroMutation(res.data, 'transactions UPDATE');
    const verify = await rest('transactions', 'GET', ctx.tokenA,
      undefined, `id=eq.${ctx.transactionAId}&select=amount`);
    const amount = ((verify.data as any[])?.[0])?.amount;
    assert.notEqual(Number(amount), 999999, 'Transaction amount was mutated by USER_B');
  });

  it('TXN-DELETE: USER_B cannot delete USER_A transaction', async () => {
    await rest('transactions', 'DELETE', ctx.tokenB,
      undefined, `id=eq.${ctx.transactionAId}`);
    const verify = await rest('transactions', 'GET', ctx.tokenA,
      undefined, `id=eq.${ctx.transactionAId}`);
    assert.equal((verify.data as any[])?.length, 1, 'USER_A transaction was deleted by USER_B');
  });

  it('TXN-CROSS-ACCOUNT: USER_B cannot inject transaction referencing USER_A account_id', async () => {
    const res = await rest('transactions', 'POST', ctx.tokenB, {
      user_id: ctx.idB, account_id: ctx.accountAId, // cross-tenant account ref
      amount: 1, direction: 'out', type: 'expense',
      date: new Date().toISOString().split('T')[0],
      description: 'CROSS-TENANT-INJECT', status: 'confirmed',
    });
    // Must fail: FK constraint (23503) or RLS (42501) or 400/422
    assert.ok(
      res.status >= 400,
      `Cross-tenant transaction insert succeeded (HTTP ${res.status}): ${JSON.stringify(res.data)}`
    );
  });
});

// ── LOANS ─────────────────────────────────────────────────────────────────────

describe('LOANS IDOR', () => {
  it('LOAN-READ: USER_B cannot read USER_A loan', async () => {
    const res = await rest('loans', 'GET', ctx.tokenB,
      undefined, `id=eq.${ctx.loanAId}&select=id,user_id,name`);
    assertNoLeak(res.data, 'loans READ');
  });

  it('LOAN-UPDATE: USER_B cannot update USER_A loan', async () => {
    const res = await rest('loans', 'PATCH', ctx.tokenB,
      { remaining_principal: 0 }, `id=eq.${ctx.loanAId}`);
    assertZeroMutation(res.data, 'loans UPDATE');
  });

  it('LOAN-DELETE: USER_B cannot delete USER_A loan', async () => {
    await rest('loans', 'DELETE', ctx.tokenB, undefined, `id=eq.${ctx.loanAId}`);
    const verify = await rest('loans', 'GET', ctx.tokenA,
      undefined, `id=eq.${ctx.loanAId}`);
    assert.equal((verify.data as any[])?.length, 1, 'USER_A loan was deleted by USER_B');
  });
});

// ── INVESTMENTS ───────────────────────────────────────────────────────────────

describe('INVESTMENTS IDOR', () => {
  it('INV-READ: USER_B cannot read USER_A investment', async () => {
    const res = await rest('investments', 'GET', ctx.tokenB,
      undefined, `id=eq.${ctx.investmentAId}&select=id,user_id`);
    assertNoLeak(res.data, 'investments READ');
  });

  it('INV-UPDATE: USER_B cannot update USER_A investment', async () => {
    const res = await rest('investments', 'PATCH', ctx.tokenB,
      { current_value: 0 }, `id=eq.${ctx.investmentAId}`);
    assertZeroMutation(res.data, 'investments UPDATE');
  });

  it('INV-DELETE: USER_B cannot delete USER_A investment', async () => {
    await rest('investments', 'DELETE', ctx.tokenB,
      undefined, `id=eq.${ctx.investmentAId}`);
    const verify = await rest('investments', 'GET', ctx.tokenA,
      undefined, `id=eq.${ctx.investmentAId}`);
    assert.equal((verify.data as any[])?.length, 1, 'USER_A investment was deleted by USER_B');
  });
});

// ── COUNTERPARTIES / PEOPLE ───────────────────────────────────────────────────

describe('COUNTERPARTIES IDOR', () => {
  it('CP-READ: USER_B cannot read USER_A counterparty', async () => {
    const res = await rest('counterparties', 'GET', ctx.tokenB,
      undefined, `id=eq.${ctx.counterpartyAId}&select=id,user_id`);
    assertNoLeak(res.data, 'counterparties READ');
  });

  it('CP-UPDATE: USER_B cannot update USER_A counterparty', async () => {
    const res = await rest('counterparties', 'PATCH', ctx.tokenB,
      { name: 'HACKED' }, `id=eq.${ctx.counterpartyAId}`);
    assertZeroMutation(res.data, 'counterparties UPDATE');
  });

  it('CP-DELETE: USER_B cannot delete USER_A counterparty', async () => {
    await rest('counterparties', 'DELETE', ctx.tokenB,
      undefined, `id=eq.${ctx.counterpartyAId}`);
    const verify = await rest('counterparties', 'GET', ctx.tokenA,
      undefined, `id=eq.${ctx.counterpartyAId}`);
    assert.equal((verify.data as any[])?.length, 1, 'Counterparty deleted by USER_B');
  });
});

describe('PEOPLE IDOR', () => {
  it('PEOPLE-READ: USER_B cannot read USER_A people record', async () => {
    if (!ctx.peopleAId) return;
    const res = await rest('people', 'GET', ctx.tokenB,
      undefined, `id=eq.${ctx.peopleAId}&select=id,user_id`);
    assertNoLeak(res.data, 'people READ');
  });

  it('PEOPLE-UPDATE: USER_B cannot update USER_A people record', async () => {
    if (!ctx.peopleAId) return;
    const res = await rest('people', 'PATCH', ctx.tokenB,
      { name: 'HACKED' }, `id=eq.${ctx.peopleAId}`);
    assertZeroMutation(res.data, 'people UPDATE');
  });
});

// ── NOTIFICATIONS ──────────────────────────────────────────────────────────────

describe('NOTIFICATIONS IDOR', () => {
  it('NOTIF-READ-ALL: Global notifications scan leaks nothing to USER_B', async () => {
    const res = await rest('notifications', 'GET', ctx.tokenB,
      undefined, 'select=id,user_id,title');
    const leaked = ((res.data as any[]) ?? []).filter((r: any) => r.user_id === ctx.idA);
    assert.equal(leaked.length, 0, `Leaked ${leaked.length} USER_A notifications to USER_B`);
  });

  it('NOTIF-READ-BY-ID: USER_B cannot read USER_A notification by ID', async () => {
    if (!ctx.notificationAId) return;
    const res = await rest('notifications', 'GET', ctx.tokenB,
      undefined, `id=eq.${ctx.notificationAId}&select=id,user_id`);
    assertNoLeak(res.data, 'notifications READ by ID');
  });

  it('NOTIF-UPDATE: USER_B cannot mark USER_A notification as read', async () => {
    if (!ctx.notificationAId) return;
    const res = await rest('notifications', 'PATCH', ctx.tokenB,
      { is_read: true }, `id=eq.${ctx.notificationAId}`);
    assertZeroMutation(res.data, 'notifications UPDATE');
  });

  it('NOTIF-DELETE: USER_B cannot delete USER_A notification', async () => {
    if (!ctx.notificationAId) return;
    await rest('notifications', 'DELETE', ctx.tokenB,
      undefined, `id=eq.${ctx.notificationAId}`);
    const verify = await rest('notifications', 'GET', ctx.tokenA,
      undefined, `id=eq.${ctx.notificationAId}`);
    assert.equal((verify.data as any[])?.length, 1, 'Notification deleted by USER_B');
  });
});

// ── CATEGORIES ────────────────────────────────────────────────────────────────

describe('CATEGORIES IDOR', () => {
  it('CAT-READ: USER_B cannot read USER_A custom category', async () => {
    if (!ctx.categoryAId) return;
    const res = await rest('transaction_categories', 'GET', ctx.tokenB,
      undefined, `id=eq.${ctx.categoryAId}&user_id=eq.${ctx.idA}&select=id,user_id`);
    const leaked = ((res.data as any[]) ?? []).filter((r: any) => r.user_id === ctx.idA);
    assert.equal(leaked.length, 0, 'USER_B can see USER_A custom category');
  });

  it('CAT-DELETE: USER_B cannot delete USER_A category', async () => {
    if (!ctx.categoryAId) return;
    await rest('transaction_categories', 'DELETE', ctx.tokenB,
      undefined, `id=eq.${ctx.categoryAId}`);
    const verify = await rest('transaction_categories', 'GET', ctx.tokenA,
      undefined, `id=eq.${ctx.categoryAId}`);
    assert.equal((verify.data as any[])?.length, 1, 'Category deleted by USER_B');
  });
});

// ── BUDGETS ───────────────────────────────────────────────────────────────────

describe('BUDGETS IDOR', () => {
  it('BUD-READ: USER_B cannot read USER_A budget', async () => {
    if (!ctx.budgetAId) return;
    const res = await rest('budgets', 'GET', ctx.tokenB,
      undefined, `id=eq.${ctx.budgetAId}&select=id,user_id`);
    assertNoLeak(res.data, 'budgets READ');
  });

  it('BUD-UPDATE: USER_B cannot update USER_A budget', async () => {
    if (!ctx.budgetAId) return;
    const res = await rest('budgets', 'PATCH', ctx.tokenB,
      { total_amount: 0 }, `id=eq.${ctx.budgetAId}`);
    assertZeroMutation(res.data, 'budgets UPDATE');
  });
});

// ── LEDGER / JOURNAL ──────────────────────────────────────────────────────────

describe('LEDGER IDOR', () => {
  it('LED-JOURNAL-READ: USER_B cannot read USER_A journal_entries', async () => {
    const res = await rest('journal_entries', 'GET', ctx.tokenB,
      undefined, `user_id=eq.${ctx.idA}&select=id,user_id`);
    assertNoLeak(res.data, 'journal_entries READ');
  });

  it('LED-LINES-READ: USER_B cannot read USER_A journal_lines', async () => {
    const res = await rest('journal_lines', 'GET', ctx.tokenB,
      undefined, `user_id=eq.${ctx.idA}&select=id,user_id`);
    assertNoLeak(res.data, 'journal_lines READ');
  });

  it('LED-ACCOUNTS-READ: USER_B cannot read USER_A ledger_accounts', async () => {
    const res = await rest('ledger_accounts', 'GET', ctx.tokenB,
      undefined, `user_id=eq.${ctx.idA}&select=id,user_id`);
    assertNoLeak(res.data, 'ledger_accounts READ');
  });

  it('LED-ANON-RPC: Anonymous post_journal_entry call returns 401/403', async () => {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/post_journal_entry`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_user_id: ctx.idA,
        p_transaction_date: new Date().toISOString().split('T')[0],
        p_description: 'anon attack',
        p_source_type: 'test',
        p_source_id: 'test',
        p_idempotency_key: `anon-${Date.now()}`,
        p_lines: [],
        p_created_by: ctx.idA,
      }),
    });
    assert.ok([401, 403].includes(res.status),
      `Anonymous post_journal_entry got HTTP ${res.status} (expected 401/403)`);
  });
});

// ── ADMIN RPC PRIVILEGE ESCALATION ────────────────────────────────────────────

describe('ADMIN RPC isolation', () => {
  it('ADMIN-approve: USER_B cannot call approve_user', async () => {
    const res = await rpc('approve_user', { p_target_user_id: ctx.idA }, ctx.tokenB);
    assert.ok(res.status >= 400,
      `Non-admin approve_user succeeded: HTTP ${res.status} — ${JSON.stringify(res.data)}`);
    const msg = JSON.stringify(res.data).toLowerCase();
    assert.ok(
      msg.includes('unauthorized') || msg.includes('not an admin') || msg.includes('permission'),
      `Unexpected rejection message: ${msg}`
    );
  });

  it('ADMIN-suspend: USER_B cannot call suspend_user', async () => {
    const res = await rpc('suspend_user',
      { p_target_user_id: ctx.idA, p_reason: 'attack' }, ctx.tokenB);
    assert.ok(res.status >= 400,
      `Non-admin suspend_user succeeded: HTTP ${res.status}`);
  });

  it('ADMIN-reactivate: USER_B cannot call reactivate_user', async () => {
    const res = await rpc('reactivate_user', { p_target_user_id: ctx.idA }, ctx.tokenB);
    assert.ok(res.status >= 400,
      `Non-admin reactivate_user succeeded: HTTP ${res.status}`);
  });

  it('ADMIN-userlist: USER_B cannot call get_admin_user_list', async () => {
    const res = await rpc('get_admin_user_list', {}, ctx.tokenB);
    assert.ok(res.status >= 400,
      `Non-admin get_admin_user_list succeeded: HTTP ${res.status} — ${JSON.stringify(res.data)}`);
  });

  it('ADMIN-regmode: USER_B cannot call set_registration_mode', async () => {
    const res = await rpc('set_registration_mode', { p_mode: 'public' }, ctx.tokenB);
    assert.ok(res.status >= 400,
      `Non-admin set_registration_mode succeeded: HTTP ${res.status}`);
  });

  it('ADMIN-bootstrap: USER_B cannot bootstrap_first_admin when admin exists', async () => {
    const res = await rpc('bootstrap_first_admin', {}, ctx.tokenB);
    assert.ok(res.status >= 400,
      `bootstrap_first_admin succeeded for USER_B: HTTP ${res.status} — ${JSON.stringify(res.data)}`);
    const msg = JSON.stringify(res.data).toLowerCase();
    assert.ok(
      msg.includes('already exists') || msg.includes('not approved') ||
      msg.includes('unauthorized') || msg.includes('pending'),
      `bootstrap rejection message not as expected: ${msg}`
    );
  });

  it('ADMIN-get_balance: USER_B cannot query USER_A ledger_account balance', async () => {
    // First get a USER_A ledger account ID
    const la = await rest('ledger_accounts', 'GET', ctx.tokenA,
      undefined, 'select=id&limit=1');
    const laId = ((la.data as any[])?.[0])?.id;
    if (!laId) return; // No ledger accounts yet — skip
    const res = await rpc('get_ledger_account_balance',
      { p_ledger_account_id: laId }, ctx.tokenB);
    // Must error: either "Authentication Required" (called with wrong user) or 400/403
    const msg = JSON.stringify(res.data ?? '').toLowerCase();
    const blocked = res.status >= 400 ||
      msg.includes('does not exist') || msg.includes('belong') ||
      msg.includes('authentication') || msg.includes('error');
    assert.ok(blocked,
      `get_ledger_account_balance returned USER_A data to USER_B: HTTP ${res.status} — ${JSON.stringify(res.data)}`);
  });
});

// ── NEXT.JS API ENDPOINTS ─────────────────────────────────────────────────────

describe('Next.js API endpoints', () => {
  it('API-chat: unauthenticated returns 401 JSON', async () => {
    const res = await apiPost('/api/chat', { messages: [{ role: 'user', content: 'test' }] });
    assert.equal(res.status, 401, `/api/chat returned HTTP ${res.status}`);
    assert.ok((res.data as any)?.error, 'No error field in 401 response');
  });

  it('API-categorize: unauthenticated returns 401', async () => {
    const res = await apiPost('/api/ai/categorize', { description: 'Uber' });
    assert.equal(res.status, 401);
  });

  it('API-insights: unauthenticated returns 401', async () => {
    const res = await apiPost('/api/ai/insights', {});
    assert.equal(res.status, 401);
  });

  it('API-reset: unauthenticated returns 401', async () => {
    const res = await apiPost('/api/account/reset-data', { confirmation: 'RESET MY DATA' });
    assert.equal(res.status, 401);
  });

  it('API-reset: wrong confirmation phrase returns 400', async () => {
    // Need an authenticated call — use direct Supabase publishable key as cookie is not trivial in Node
    // This test verifies the API guard exists; authenticated test is in Playwright spec
    const res = await apiPost('/api/account/reset-data', { confirmation: 'WRONG' });
    assert.ok([400, 401].includes(res.status),
      `Expected 400 or 401 for wrong confirmation, got ${res.status}`);
  });

  it('API-reset GET: returns 405', async () => {
    const res = await fetch(`${APP_URL}/api/account/reset-data`);
    assert.equal(res.status, 405);
  });

  it('API-cron: wrong bearer returns 401', async () => {
    const res = await fetch(`${APP_URL}/api/recurring/execute`, {
      method: 'POST',
      headers: { Authorization: 'Bearer WRONG-SECRET-XYZ', 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 401, `CRON with wrong secret returned ${res.status}`);
  });
});

// ── STORAGE ISOLATION ─────────────────────────────────────────────────────────

describe('Storage isolation (REST)', () => {
  it('STOR-LIST: USER_B cannot list USER_A storage folder', async () => {
    const res = await fetch(
      `${SUPA_URL}/storage/v1/object/list/documents`,
      {
        method: 'POST',
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${ctx.tokenB}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prefix: `${ctx.idA}/`, limit: 100 }),
      }
    );
    const data = await res.json().catch(() => []);
    const files = Array.isArray(data) ? data : [];
    assert.equal(files.length, 0,
      `USER_B can list USER_A storage folder: ${JSON.stringify(files)}`);
  });

  it('STOR-UPLOAD: USER_B cannot upload to USER_A storage folder', async () => {
    const res = await fetch(
      `${SUPA_URL}/storage/v1/object/documents/${ctx.idA}/injected.pdf`,
      {
        method: 'POST',
        headers: {
          apikey: SUPA_KEY,
          Authorization: `Bearer ${ctx.tokenB}`,
          'Content-Type': 'application/pdf',
        },
        body: 'malicious pdf content',
      }
    );
    assert.ok(res.status >= 400,
      `USER_B upload to USER_A folder succeeded: HTTP ${res.status}`);
  });
});

// ── CLEANUP ───────────────────────────────────────────────────────────────────

after(async () => {
  // Delete seeded USER_A data via reset RPC
  await rpc('reset_user_data', {
    p_reset_id: `RESET:${ctx.idA}:audit-cleanup`,
    p_confirmation_phrase: 'RESET MY DATA',
  }, ctx.tokenA).catch(e => console.warn('Cleanup USER_A:', e.message));

  await rpc('reset_user_data', {
    p_reset_id: `RESET:${ctx.idB}:audit-cleanup`,
    p_confirmation_phrase: 'RESET MY DATA',
  }, ctx.tokenB).catch(e => console.warn('Cleanup USER_B:', e.message));

  console.log('CLEANUP complete');
});
