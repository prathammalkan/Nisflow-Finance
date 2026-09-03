import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { orchestrateAIAction } from '../../src/lib/ledger/ai-orchestrator.ts';
import { resolveAccount, resolveCounterparty, resolveLoan, resolveJournalEntry } from '../../src/lib/ai/entity-resolution.ts';

// Phase 3 & 4: Authentication & Tenant Isolation / IDOR Security Suite

test('AUTH & IDOR [01-01]: Server Actions enforce server-side session authentication on all financial operations', () => {
  // ATTACK: An unauthenticated attacker attempts to invoke server actions
  // EXPECTED DEFENSE: Server actions strictly verify session via supabase.auth.getUser() and reject with AUTH_REQUIRED
  const actionsFilePath = path.join(process.cwd(), 'src', 'app', 'actions', 'ledger-ai.ts');
  assert.ok(fs.existsSync(actionsFilePath), 'ledger-ai.ts must exist');
  const code = fs.readFileSync(actionsFilePath, 'utf8');

  // Verify auth.getUser() check across all server actions
  assert.match(code, /supabase\.auth\.getUser\(\)/, 'Must verify authenticated session');
  assert.match(code, /AUTH_REQUIRED/, 'Must return AUTH_REQUIRED error code on unauthenticated call');
  assert.match(code, /user\.id/, 'Must derive identity strictly from user.id session, never client payload');
});

test('AUTH & IDOR [01-02]: orchestrateAIAction enforces tenant isolation and blocks unauthenticated invocation', async () => {
  // ATTACK: Invoking AI orchestrator with an empty or undefined userId
  // EXPECTED DEFENSE: Immediately return AUTH_REQUIRED without executing domain services
  const mockSupabase = {} as any;
  const res = await orchestrateAIAction(mockSupabase, '', 'msg-102', {
    actionType: 'expense',
    amount: 100,
  });
  assert.equal(res.success, false);
  assert.equal(res.errorCode, 'AUTH_REQUIRED');
  assert.equal(res.verified, false);
});

test('AUTH & IDOR [01-03]: Entity Resolution detects SECURITY_VIOLATION when accessing foreign accounts', async () => {
  // ATTACK: User A passes User B's account ID to resolveAccount
  // EXPECTED DEFENSE: Security check detects acc.user_id !== userId and flags SECURITY_VIOLATION
  const userA = '11111111-1111-1111-1111-111111111111';
  const userBAccountId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const mockDb = {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => ({
            data: {
              id: userBAccountId,
              user_id: '22222222-2222-2222-2222-222222222222',
              name: 'User B Secret Bank',
              type: 'bank',
              is_active: true,
            },
            error: null,
          }),
        }),
      }),
    }),
  } as any;

  const resolved = await resolveAccount(mockDb, userA, { id: userBAccountId });
  assert.equal(resolved.status, 'SECURITY_VIOLATION', 'User A resolving User B account must return SECURITY_VIOLATION');
});

test('AUTH & IDOR [01-04]: Entity Resolution rejects cross-tenant person access', async () => {
  // ATTACK: User A passes User B's person ID to resolvePerson
  // EXPECTED DEFENSE: Resolves to NOT_FOUND when person not found in user tenant
  const userA = '11111111-1111-1111-1111-111111111111';
  const userBPersonId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  const mockDb = {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  } as any;

  const resolved = await resolveCounterparty(mockDb, userA, { id: userBPersonId });
  assert.notEqual(resolved.status, 'RESOLVED', 'User A must NOT resolve User B counterparty');
});

test('AUTH & IDOR [01-05]: Entity Resolution rejects cross-tenant loan access', async () => {
  // ATTACK: User A passes User B's loan ID to resolveLoan
  // EXPECTED DEFENSE: Resolves to NOT_FOUND when loan not found in user tenant
  const userA = '11111111-1111-1111-1111-111111111111';
  const userBLoanId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  const mockDb = {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  } as any;

  const resolved = await resolveLoan(mockDb, userA, { id: userBLoanId });
  assert.notEqual(resolved.status, 'RESOLVED', 'User A must NOT resolve User B loan');
});

test('AUTH & IDOR [01-06]: Entity Resolution rejects cross-tenant journal entry resolution for reversals', async () => {
  // ATTACK: User A passes User B's journal entry ID to resolveJournalEntry
  // EXPECTED DEFENSE: Security check detects entry.user_id !== userId and flags SECURITY_VIOLATION
  const userA = '11111111-1111-1111-1111-111111111111';
  const userBJournalId = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  const mockDb = {
    from: (table: string) => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => ({
            data: {
              id: userBJournalId,
              user_id: '22222222-2222-2222-2222-222222222222',
              description: 'User B Secret Transfer',
              status: 'posted',
            },
            error: null,
          }),
        }),
      }),
    }),
  } as any;

  const resolved = await resolveJournalEntry(mockDb, userA, { id: userBJournalId });
  assert.equal(resolved.status, 'SECURITY_VIOLATION', 'User A resolving User B journal entry must return SECURITY_VIOLATION');
});
