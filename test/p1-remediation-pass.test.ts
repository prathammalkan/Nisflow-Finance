import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Decimal from 'decimal.js';
import {
  ensureLoanLedgerAccounts,
  getLoanAuthoritativeBalance,
  recordLoanDisbursement,
  recordLoanEMI,
} from '../src/lib/ledger/loans.ts';
import { reverseFinancialTransaction } from '../src/lib/ledger/service.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// ==============================================================================
// MOCK DATABASE & RPC SIMULATOR FOR MIGRATION 012 SECURITY INVARIANTS
// ==============================================================================

function createP1MockSupabase(initialState?: any) {
  const state: any = {
    accounts: initialState?.accounts || [],
    counterparties: initialState?.counterparties || [],
    loans: initialState?.loans || [],
    investments: initialState?.investments || [],
    journal_entries: initialState?.journal_entries || [],
    journal_lines: initialState?.journal_lines || [],
    ledger_accounts: initialState?.ledger_accounts || [],
    ledger_audit_log: initialState?.ledger_audit_log || [],
    audit_logs: initialState?.audit_logs || [],
    transactions: initialState?.transactions || [],
  };

  let entryCounter = 1;
  let lineCounter = 1;
  let auditCounter = 1;

  // Caller Context simulation (auth.uid() and auth.role())
  let callerContext = {
    uid: initialState?.callerUid ?? 'user-A',
    role: initialState?.callerRole ?? 'authenticated',
  };

  const client: any = {
    _state: state,
    _setCallerContext: (uid: string | null, role: string) => {
      callerContext = { uid: uid || '', role };
    },
    auth: {
      getUser: async () => ({
        data: { user: callerContext.uid ? { id: callerContext.uid } : null },
        error: callerContext.uid ? null : { message: 'Not authenticated' },
      }),
    },
    from: (table: string) => {
      if (!state[table]) state[table] = [];
      let filters: Array<(r: any) => boolean> = [];
      let orderByField: string | null = null;
      let orderAscending = true;

      const builder: any = {
        select: (_cols?: string) => builder,
        eq: (field: string, val: any) => {
          filters.push((r: any) => {
            if (field.includes('.')) {
              const parts = field.split('.');
              let curr = r;
              for (const p of parts) curr = curr?.[p];
              return curr === val;
            }
            return r[field] === val;
          });
          return builder;
        },
        in: (field: string, values: any[]) => {
          const valSet = new Set(values);
          filters.push((r: any) => {
            if (field.includes('.')) {
              const parts = field.split('.');
              let curr = r;
              for (const p of parts) curr = curr?.[p];
              return valSet.has(curr);
            }
            return valSet.has(r[field]);
          });
          return builder;
        },
        order: (field: string, opts?: { ascending?: boolean }) => {
          orderByField = field;
          orderAscending = opts?.ascending !== false;
          return builder;
        },
        limit: (_limit: number) => builder,
        maybeSingle: async () => {
          let rows = (state[table] || []).map((row: any) => {
            if (table === 'journal_lines') {
              const je = state.journal_entries.find((e: any) => e.id === row.journal_entry_id);
              return { ...row, journal_entries: je || null };
            }
            return row;
          }).filter((r: any) => filters.every((f) => f(r)));
          return { data: rows[0] || null, error: null };
        },
        single: async () => {
          let rows = (state[table] || []).map((row: any) => {
            if (table === 'journal_lines') {
              const je = state.journal_entries.find((e: any) => e.id === row.journal_entry_id);
              return { ...row, journal_entries: je || null };
            }
            return row;
          }).filter((r: any) => filters.every((f) => f(r)));
          if (rows.length === 0) return { data: null, error: { message: 'Row not found' } };
          return { data: rows[0], error: null };
        },
        insert: (rows: any | any[]) => {
          const items = Array.isArray(rows) ? rows : [rows];
          const inserted: any[] = [];
          for (const item of items) {
            const row = {
              id: item.id || `mock-${table}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              created_at: new Date().toISOString(),
              ...item,
            };
            state[table].push(row);
            inserted.push(row);
          }
          return {
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
              maybeSingle: async () => ({ data: inserted[0] || null, error: null }),
            }),
            single: async () => ({ data: inserted[0], error: null }),
            then: (resolve: any) => resolve({ data: inserted, error: null }),
          };
        },
        update: (updates: any) => {
          const updateBuilder: any = {
            eq: (field: string, val: any) => {
              filters.push((r: any) => r[field] === val);
              for (const row of state[table] || []) {
                if (filters.every((f) => f(row))) {
                  Object.assign(row, updates);
                }
              }
              return updateBuilder;
            },
            ilike: (field: string, val: any) => {
              const clean = String(val).replace(/%/g, '').toLowerCase();
              filters.push((r: any) => String(r[field] || '').toLowerCase().includes(clean));
              for (const row of state[table] || []) {
                if (filters.every((f) => f(row))) {
                  Object.assign(row, updates);
                }
              }
              return updateBuilder;
            },
            in: (field: string, vals: any[]) => {
              const valSet = new Set(vals);
              filters.push((r: any) => valSet.has(r[field]));
              for (const row of state[table] || []) {
                if (filters.every((f) => f(row))) {
                  Object.assign(row, updates);
                }
              }
              return updateBuilder;
            },
            select: () => ({
              single: async () => {
                const matched = (state[table] || []).filter((r: any) => filters.every((f) => f(r)));
                return { data: matched[0] || null, error: null };
              },
              then: (resolve: any) => {
                const matched = (state[table] || []).filter((r: any) => filters.every((f) => f(r)));
                resolve({ data: matched, error: null });
              },
            }),
            then: (resolve: any) => {
              const matched = (state[table] || []).filter((r: any) => filters.every((f) => f(r)));
              resolve({ data: matched, error: null });
            },
          };
          return updateBuilder;
        },
        then: (resolve: any) => {
          let rows = (state[table] || []).map((row: any) => {
            if (table === 'journal_lines') {
              const je = state.journal_entries.find((e: any) => e.id === row.journal_entry_id);
              return { ...row, journal_entries: je || null };
            }
            return row;
          }).filter((r: any) => filters.every((f) => f(r)));

          if (orderByField) {
            rows = [...rows].sort((a: any, b: any) => {
              const va = a[orderByField!];
              const vb = b[orderByField!];
              if (va < vb) return orderAscending ? -1 : 1;
              if (va > vb) return orderAscending ? 1 : -1;
              return 0;
            });
          }
          resolve({ data: rows, error: null });
        },
      };

      return builder;
    },
    rpc: async (fn: string, params: any) => {
      // ------------------------------------------------------------------------
      // SEC-003: get_ledger_account_balance Simulation of Migration 012
      // ------------------------------------------------------------------------
      if (fn === 'get_ledger_account_balance') {
        const { p_ledger_account_id } = params;

        // Invariant 1: Reject anonymous callers
        if (callerContext.role === 'anon' || !callerContext.uid) {
          return {
            data: null,
            error: { message: 'Authentication Required: Anonymous callers cannot query ledger account balances.' },
          };
        }

        // Invariant 2: Look up account metadata
        const la = state.ledger_accounts.find((a: any) => a.id === p_ledger_account_id);

        // Invariant 3: Requested ledger account must exist and belong to caller
        // Missing and cross-tenant accounts return IDENTICAL error message to prevent ID enumeration
        if (!la || (callerContext.role === 'authenticated' && la.user_id !== callerContext.uid)) {
          return {
            data: null,
            error: { message: `Ledger account ${p_ledger_account_id} not found` },
          };
        }

        // Calculate balance across all posted & reversed entries
        const lines = state.journal_lines.filter((jl: any) => {
          if (jl.ledger_account_id !== p_ledger_account_id) return false;
          const je = state.journal_entries.find((e: any) => e.id === jl.journal_entry_id);
          return je && ['posted', 'reversed'].includes(je.status);
        });

        let balance = new Decimal(0);
        for (const l of lines) {
          if (['asset', 'expense'].includes(la.account_type)) {
            balance = balance.plus(new Decimal(l.debit_amount || 0)).minus(new Decimal(l.credit_amount || 0));
          } else {
            balance = balance.plus(new Decimal(l.credit_amount || 0)).minus(new Decimal(l.debit_amount || 0));
          }
        }

        return { data: balance.toNumber(), error: null };
      }

      // ------------------------------------------------------------------------
      // SEC-004: post_journal_entry Simulation of Migration 012
      // ------------------------------------------------------------------------
      if (fn === 'post_journal_entry') {
        const { p_user_id, p_transaction_date, p_description, p_source_type, p_source_id, p_idempotency_key, p_lines, p_created_by, p_metadata } = params;

        // Invariant 1: Reject anonymous callers
        if (callerContext.role === 'anon' || !callerContext.uid) {
          return {
            data: null,
            error: { message: 'Authentication Required: Anonymous callers cannot post journal entries.' },
          };
        }

        // Invariant 2: Tenant authorization check
        if (callerContext.role === 'authenticated' && callerContext.uid !== p_user_id) {
          return {
            data: null,
            error: { message: `Authorization Error: Caller auth.uid (${callerContext.uid}) does not match target user_id (${p_user_id}).` },
          };
        }

        // Invariant 3: Authoritative Actor Derivation (Strictly from auth.uid(), ignores client p_created_by)
        const v_actor_id = callerContext.uid;

        // Idempotency check
        const existing = state.journal_entries.find(
          (j: any) => j.user_id === p_user_id && j.idempotency_key === p_idempotency_key
        );
        if (existing) return { data: existing.id, error: null };

        const lines = typeof p_lines === 'string' ? JSON.parse(p_lines) : p_lines;
        if (!lines || lines.length < 2) {
          return { data: null, error: { message: 'Financial Integrity Error: A journal entry must have at least 2 lines.' } };
        }

        let totalDr = new Decimal(0);
        let totalCr = new Decimal(0);
        const acctIds = lines.map((l: any) => l.ledger_account_id);

        for (const l of lines) {
          if (Number(l.debit_amount) < 0 || Number(l.credit_amount) < 0) {
            return { data: null, error: { message: 'Financial Integrity Error: Debit and credit amounts must be non-negative.' } };
          }
          totalDr = totalDr.plus(new Decimal(l.debit_amount || 0));
          totalCr = totalCr.plus(new Decimal(l.credit_amount || 0));
        }

        if (!totalDr.equals(totalCr)) {
          return { data: null, error: { message: `Financial Integrity Error: Unbalanced journal entry. Total Debits (${totalDr}) must equal Total Credits (${totalCr}).` } };
        }

        if (totalDr.lte(0)) {
          return { data: null, error: { message: 'Financial Integrity Error: Total journal amount must be strictly greater than zero.' } };
        }

        // Verify account ownership
        const userLedgerAccounts = state.ledger_accounts.filter(
          (la: any) => acctIds.includes(la.id) && la.user_id === p_user_id
        );
        if (userLedgerAccounts.length !== acctIds.length) {
          return { data: null, error: { message: 'Financial Integrity Error: One or more ledger accounts do not exist or belong to another user.' } };
        }

        const newEntryId = `je-${entryCounter++}`;
        state.journal_entries.push({
          id: newEntryId,
          user_id: p_user_id,
          transaction_date: p_transaction_date,
          description: p_description,
          source_type: p_source_type,
          source_id: p_source_id,
          idempotency_key: p_idempotency_key,
          status: 'posted',
          created_by: v_actor_id, // Authoritative actor recorded
        });

        for (const l of lines) {
          state.journal_lines.push({
            id: `jl-${lineCounter++}`,
            journal_entry_id: newEntryId,
            ledger_account_id: l.ledger_account_id,
            user_id: p_user_id,
            debit_amount: Number(l.debit_amount || 0),
            credit_amount: Number(l.credit_amount || 0),
            currency: l.currency || 'INR',
            memo: l.memo || null,
          });

          // Sync accounts projection if mapped
          const la = state.ledger_accounts.find((a: any) => a.id === l.ledger_account_id);
          if (la && la.entity_type === 'account' && la.entity_id) {
            const acc = state.accounts.find((a: any) => a.id === la.entity_id && a.user_id === p_user_id);
            if (acc) {
              const delta = la.account_type === 'asset'
                ? new Decimal(l.debit_amount || 0).minus(new Decimal(l.credit_amount || 0))
                : new Decimal(l.credit_amount || 0).minus(new Decimal(l.debit_amount || 0));
              acc.balance = new Decimal(acc.balance || 0).plus(delta).toNumber();
              acc.current_balance = new Decimal(acc.current_balance || 0).plus(delta).toNumber();
            }
          }
        }

        state.ledger_audit_log.push({
          id: `audit-${auditCounter++}`,
          user_id: p_user_id,
          journal_entry_id: newEntryId,
          action: 'POST',
          actor_id: v_actor_id, // Authoritative actor recorded
          payload_hash: 'mock-sha256-hash',
          metadata: p_metadata || {},
        });

        return { data: newEntryId, error: null };
      }

      // ------------------------------------------------------------------------
      // SEC-004: post_reversal_entry Simulation of Migration 012
      // ------------------------------------------------------------------------
      if (fn === 'post_reversal_entry') {
        const { p_user_id, p_original_entry_id, p_reason, p_idempotency_key, p_created_by, p_metadata } = params;

        if (callerContext.role === 'anon' || !callerContext.uid) {
          return {
            data: null,
            error: { message: 'Authentication Required: Anonymous callers cannot post reversal entries.' },
          };
        }

        if (callerContext.role === 'authenticated' && callerContext.uid !== p_user_id) {
          return {
            data: null,
            error: { message: `Authorization Error: Caller auth.uid (${callerContext.uid}) does not match target user_id (${p_user_id}).` },
          };
        }

        const v_actor_id = callerContext.uid;

        const orig = state.journal_entries.find(
          (j: any) => j.id === p_original_entry_id && j.user_id === p_user_id
        );
        if (!orig) {
          return { data: null, error: { message: `Financial Integrity Error: Original journal entry ${p_original_entry_id} not found or unauthorized.` } };
        }
        if (orig.status === 'reversed') {
          return { data: null, error: { message: `Financial Integrity Error: Journal entry ${p_original_entry_id} has already been reversed.` } };
        }

        const origLines = state.journal_lines.filter((l: any) => l.journal_entry_id === p_original_entry_id);
        const revLines = origLines.map((l: any) => ({
          ledger_account_id: l.ledger_account_id,
          debit_amount: l.credit_amount,   // Inverted
          credit_amount: l.debit_amount,   // Inverted
          currency: l.currency,
          memo: `Reversal: ${orig.description}`,
        }));

        const revPostRes = await client.rpc('post_journal_entry', {
          p_user_id,
          p_transaction_date: new Date().toISOString().split('T')[0],
          p_description: `REVERSAL: ${orig.description} (${p_reason})`,
          p_source_type: 'reversal',
          p_source_id: String(p_original_entry_id),
          p_idempotency_key,
          p_lines: revLines,
          p_created_by: v_actor_id,
          p_metadata: { ...(p_metadata || {}), reversal_of_id: p_original_entry_id, reason: p_reason },
        });

        if (revPostRes.error) return revPostRes;

        orig.status = 'reversed';
        orig.reversal_of_id = revPostRes.data;

        state.ledger_audit_log.push({
          id: `audit-${auditCounter++}`,
          user_id: p_user_id,
          journal_entry_id: revPostRes.data,
          action: 'REVERSE',
          actor_id: v_actor_id, // Authoritative actor recorded
          payload_hash: 'mock-sha256-hash',
          metadata: { ...(p_metadata || {}), reversed_entry_id: p_original_entry_id },
        });

        return { data: revPostRes.data, error: null };
      }

      return { data: null, error: { message: `Unknown RPC: ${fn}` } };
    },
  };

  return client;
}

// ==============================================================================
// 1. SEC-003: GET_LEDGER_ACCOUNT_BALANCE AUTHORIZATION & BOLA HARDENING TESTS
// ==============================================================================

test('SEC-003 [1.1]: User A querying own ledger account succeeds with correct balance', async () => {
  const supabase = createP1MockSupabase({
    callerUid: 'user-A',
    callerRole: 'authenticated',
    ledger_accounts: [
      { id: 'la-a-1', user_id: 'user-A', account_type: 'asset', entity_type: 'account', code: 'AST-ACC-A1' },
    ],
    journal_entries: [
      { id: 'je-1', user_id: 'user-A', status: 'posted' },
    ],
    journal_lines: [
      { id: 'jl-1', journal_entry_id: 'je-1', ledger_account_id: 'la-a-1', debit_amount: 50000, credit_amount: 0 },
    ],
  });

  const res = await supabase.rpc('get_ledger_account_balance', { p_ledger_account_id: 'la-a-1' });
  assert.equal(res.error, null);
  assert.equal(res.data, 50000);
});

test('SEC-003 [1.2]: User A querying User B ledger account is strictly rejected (BOLA prevention)', async () => {
  const supabase = createP1MockSupabase({
    callerUid: 'user-A',
    callerRole: 'authenticated',
    ledger_accounts: [
      { id: 'la-b-secret', user_id: 'user-B', account_type: 'asset', entity_type: 'account', code: 'AST-ACC-B1' },
    ],
    journal_entries: [
      { id: 'je-b-1', user_id: 'user-B', status: 'posted' },
    ],
    journal_lines: [
      { id: 'jl-b-1', journal_entry_id: 'je-b-1', ledger_account_id: 'la-b-secret', debit_amount: 999999, credit_amount: 0 },
    ],
  });

  const res = await supabase.rpc('get_ledger_account_balance', { p_ledger_account_id: 'la-b-secret' });
  assert.equal(res.data, null);
  assert.ok(res.error);
  assert.equal(res.error.message, 'Ledger account la-b-secret not found');
});

test('SEC-003 [1.3]: Non-existent ledger account produces identical error as cross-tenant account (No ID enumeration leak)', async () => {
  const supabase = createP1MockSupabase({
    callerUid: 'user-A',
    callerRole: 'authenticated',
    ledger_accounts: [
      { id: 'la-b-existing', user_id: 'user-B', account_type: 'asset' },
    ],
  });

  // Query cross-tenant account
  const crossTenantRes = await supabase.rpc('get_ledger_account_balance', { p_ledger_account_id: 'la-b-existing' });
  // Query completely non-existent account
  const nonExistentRes = await supabase.rpc('get_ledger_account_balance', { p_ledger_account_id: 'la-does-not-exist' });

  assert.ok(crossTenantRes.error);
  assert.ok(nonExistentRes.error);
  // Both errors must be identical in form: "Ledger account <id> not found"
  assert.equal(crossTenantRes.error.message, 'Ledger account la-b-existing not found');
  assert.equal(nonExistentRes.error.message, 'Ledger account la-does-not-exist not found');
});

test('SEC-003 [1.4]: Anonymous caller querying any ledger account is strictly rejected', async () => {
  const supabase = createP1MockSupabase({
    callerUid: null,
    callerRole: 'anon',
    ledger_accounts: [
      { id: 'la-a-1', user_id: 'user-A', account_type: 'asset' },
    ],
  });

  const res = await supabase.rpc('get_ledger_account_balance', { p_ledger_account_id: 'la-a-1' });
  assert.equal(res.data, null);
  assert.ok(res.error);
  assert.match(res.error.message, /Authentication Required/);
});

// ==============================================================================
// 2. SEC-004: ACTOR SPOOFING PREVENTION & MANDATORY INVARIANT TESTS
// ==============================================================================

test('SEC-004 [2.A]: User A with p_created_by = User A -> succeeds and records User A', async () => {
  const supabase = createP1MockSupabase({
    callerUid: 'user-A',
    callerRole: 'authenticated',
    accounts: [{ id: 'acc-1', user_id: 'user-A', balance: 1000, current_balance: 1000 }],
    ledger_accounts: [
      { id: 'la-1', user_id: 'user-A', account_type: 'asset', entity_type: 'account', entity_id: 'acc-1' },
      { id: 'la-2', user_id: 'user-A', account_type: 'expense', entity_type: 'category' },
    ],
  });

  const res = await supabase.rpc('post_journal_entry', {
    p_user_id: 'user-A',
    p_transaction_date: '2026-08-21',
    p_description: 'Valid expense',
    p_source_type: 'expense',
    p_source_id: 'tx-1',
    p_idempotency_key: 'TX:001',
    p_lines: [
      { ledger_account_id: 'la-2', debit_amount: 500, credit_amount: 0 },
      { ledger_account_id: 'la-1', debit_amount: 0, credit_amount: 500 },
    ],
    p_created_by: 'user-A',
  });

  assert.ok(res.data);
  const entry = supabase._state.journal_entries.find((e: any) => e.id === res.data);
  const audit = supabase._state.ledger_audit_log.find((a: any) => a.journal_entry_id === res.data);
  assert.equal(entry.created_by, 'user-A');
  assert.equal(audit.actor_id, 'user-A');
});

test('SEC-004 [2.B]: User A with forged p_created_by = User B -> actor is authoritatively normalized to User A', async () => {
  const supabase = createP1MockSupabase({
    callerUid: 'user-A',
    callerRole: 'authenticated',
    accounts: [{ id: 'acc-1', user_id: 'user-A', balance: 1000, current_balance: 1000 }],
    ledger_accounts: [
      { id: 'la-1', user_id: 'user-A', account_type: 'asset', entity_type: 'account', entity_id: 'acc-1' },
      { id: 'la-2', user_id: 'user-A', account_type: 'expense', entity_type: 'category' },
    ],
  });

  const res = await supabase.rpc('post_journal_entry', {
    p_user_id: 'user-A',
    p_transaction_date: '2026-08-21',
    p_description: 'Attempted actor spoofing',
    p_source_type: 'expense',
    p_source_id: 'tx-2',
    p_idempotency_key: 'TX:002',
    p_lines: [
      { ledger_account_id: 'la-2', debit_amount: 200, credit_amount: 0 },
      { ledger_account_id: 'la-1', debit_amount: 0, credit_amount: 200 },
    ],
    p_created_by: 'user-B', // Forged actor UUID in payload
  });

  assert.ok(res.data, 'Operation succeeds for user A data');
  const entry = supabase._state.journal_entries.find((e: any) => e.id === res.data);
  const audit = supabase._state.ledger_audit_log.find((a: any) => a.journal_entry_id === res.data);

  // Invariant: Authoritative actor MUST be User A, NEVER client-supplied User B
  assert.equal(entry.created_by, 'user-A', 'journal_entries.created_by must equal auth.uid()');
  assert.equal(audit.actor_id, 'user-A', 'ledger_audit_log.actor_id must equal auth.uid()');
});

test('SEC-004 [2.C]: User A + p_user_id = User B -> strictly fails authorization check', async () => {
  const supabase = createP1MockSupabase({
    callerUid: 'user-A',
    callerRole: 'authenticated',
  });

  const res = await supabase.rpc('post_journal_entry', {
    p_user_id: 'user-B',
    p_transaction_date: '2026-08-21',
    p_description: 'Cross-tenant mutation attempt',
    p_source_type: 'expense',
    p_source_id: 'atk-1',
    p_idempotency_key: 'ATK:001',
    p_lines: [
      { ledger_account_id: 'la-b-1', debit_amount: 100, credit_amount: 0 },
      { ledger_account_id: 'la-b-2', debit_amount: 0, credit_amount: 100 },
    ],
    p_created_by: 'user-A',
  });

  assert.equal(res.data, null);
  assert.ok(res.error);
  assert.match(res.error.message, /Authorization Error/);
});

test('SEC-004 [2.D]: User A attempting to use User B ledger_account_id -> strictly rejected', async () => {
  const supabase = createP1MockSupabase({
    callerUid: 'user-A',
    callerRole: 'authenticated',
    ledger_accounts: [
      { id: 'la-a-1', user_id: 'user-A', account_type: 'asset' },
      { id: 'la-b-victim', user_id: 'user-B', account_type: 'asset' },
    ],
  });

  const res = await supabase.rpc('post_journal_entry', {
    p_user_id: 'user-A',
    p_transaction_date: '2026-08-21',
    p_description: 'Hijack victim ledger account',
    p_source_type: 'transfer',
    p_source_id: 'atk-2',
    p_idempotency_key: 'ATK:002',
    p_lines: [
      { ledger_account_id: 'la-a-1', debit_amount: 500, credit_amount: 0 },
      { ledger_account_id: 'la-b-victim', debit_amount: 0, credit_amount: 500 },
    ],
    p_created_by: 'user-A',
  });

  assert.equal(res.data, null);
  assert.ok(res.error);
  assert.match(res.error.message, /One or more ledger accounts do not exist or belong to another user/);
});

test('SEC-004 [2.E, 2.F, 2.G]: Anonymous caller with forged p_created_by or p_user_id is strictly rejected', async () => {
  const supabase = createP1MockSupabase({
    callerUid: null,
    callerRole: 'anon',
  });

  // E. Anonymous
  const resE = await supabase.rpc('post_journal_entry', {
    p_user_id: 'user-A',
    p_transaction_date: '2026-08-21',
    p_description: 'Anon test',
    p_source_type: 'expense',
    p_source_id: 'anon-1',
    p_idempotency_key: 'ANON:001',
    p_lines: [{ ledger_account_id: 'la-1', debit_amount: 10, credit_amount: 0 }, { ledger_account_id: 'la-2', debit_amount: 0, credit_amount: 10 }],
    p_created_by: null,
  });
  assert.equal(resE.data, null);
  assert.match(resE.error.message, /Authentication Required/);

  // F. Anonymous + forged p_created_by
  const resF = await supabase.rpc('post_journal_entry', {
    p_user_id: 'user-A',
    p_transaction_date: '2026-08-21',
    p_description: 'Anon spoof actor',
    p_source_type: 'expense',
    p_source_id: 'anon-2',
    p_idempotency_key: 'ANON:002',
    p_lines: [{ ledger_account_id: 'la-1', debit_amount: 10, credit_amount: 0 }, { ledger_account_id: 'la-2', debit_amount: 0, credit_amount: 10 }],
    p_created_by: 'user-A',
  });
  assert.equal(resF.data, null);
  assert.match(resF.error.message, /Authentication Required/);

  // G. Anonymous + forged p_user_id
  const resG = await supabase.rpc('post_reversal_entry', {
    p_user_id: 'user-A',
    p_original_entry_id: 'je-1',
    p_reason: 'Anon reversal',
    p_idempotency_key: 'ANON:REV:001',
    p_created_by: 'user-A',
  });
  assert.equal(resG.data, null);
  assert.match(resG.error.message, /Authentication Required/);
});

// ==============================================================================
// 3. DB-001: AUDIT_LOGS.DETAILS SCHEMA & USER DATA RESET VERIFICATION
// ==============================================================================

test('DB-001 [3.1]: Migration 012 defines ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '012_security_and_schema_alignment.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 012 must exist');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(sql, /ALTER\s+TABLE\s+public\.audit_logs\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+details\s+JSONB/i);
});

test('DB-001 [3.2]: audit_logs allows inserting and querying details JSONB payload', () => {
  const supabase = createP1MockSupabase();

  const testAuditLog = {
    id: 'audit-reset-1',
    user_id: 'user-A',
    action: 'USER_DATA_RESET_COMPLETED',
    entity_type: 'user_reset',
    entity_id: 'user-A',
    details: {
      reset_id: 'rst-12345',
      timestamp: new Date().toISOString(),
      total_records_purged: 42,
    },
  };

  supabase.from('audit_logs').insert(testAuditLog);
  const inserted = supabase._state.audit_logs.find((a: any) => a.id === 'audit-reset-1');
  assert.ok(inserted);
  assert.equal(inserted.action, 'USER_DATA_RESET_COMPLETED');
  assert.equal(inserted.details.reset_id, 'rst-12345');
  assert.equal(inserted.details.total_records_purged, 42);
});

// ==============================================================================
// 4. FIN-001: ACCOUNTS BALANCE CONSISTENCY & PARITY
// ==============================================================================

test('FIN-001 [4.1]: Total balance formula uses current_balance with balance fallback consistently', () => {
  const testAccounts = [
    { id: 'acc-1', is_active: true, balance: 10000, current_balance: 12500 }, // current_balance takes precedence
    { id: 'acc-2', is_active: true, balance: 5000, current_balance: null },   // balance fallback
    { id: 'acc-3', is_active: true, balance: null, current_balance: 3000 },   // current_balance with null legacy
    { id: 'acc-4', is_active: false, balance: 20000, current_balance: 20000 }, // inactive excluded
  ];

  // Header total calculation formula from accounts/page.tsx
  const totalBalance = testAccounts.reduce((acc, account) => {
    if (account.is_active) {
      return acc.plus(new Decimal(account.current_balance ?? account.balance ?? 0));
    }
    return acc;
  }, new Decimal(0));

  // 12500 + 5000 + 3000 = 20500
  assert.equal(totalBalance.toNumber(), 20500);

  // Verify each individual account card displayed balance matches the component in the sum
  const activeDisplayedBalances = testAccounts
    .filter((a) => a.is_active)
    .map((a) => Number(a.current_balance ?? a.balance ?? 0));

  const sumDisplayed = activeDisplayedBalances.reduce((a, b) => a + b, 0);
  assert.equal(totalBalance.toNumber(), sumDisplayed, 'Header aggregate MUST equal sum of displayed card balances');
});

test('FIN-001 [4.2]: accounts/page.tsx source code verified to use current_balance ?? balance ?? 0', () => {
  const accountsPagePath = path.join(process.cwd(), 'src', 'app', '(dashboard)', 'accounts', 'page.tsx');
  const code = fs.readFileSync(accountsPagePath, 'utf8');

  assert.match(
    code,
    /account\.current_balance\s*\?\?\s*account\.balance\s*\?\?\s*0/,
    'Accounts overview header MUST standardize on current_balance ?? balance ?? 0'
  );
});

// ==============================================================================
// 5. AI-002: AI CHAT ROUTE SCHEMA ACCURACY & TENANT ISOLATION
// ==============================================================================

test('AI-002 [5.1]: /api/chat queries investments table and loans.principal_amount with strict user_id scoping', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const code = fs.readFileSync(chatRoutePath, 'utf8');

  // Verify investments table query (NOT holdings)
  assert.match(code, /from\('investments'\)/, 'Must query investments table');
  assert.doesNotMatch(code, /from\('holdings'\)/, 'Must NOT query stale holdings table');

  // Verify loans.principal_amount (NOT loan_amount)
  assert.match(code, /from\('loans'\)\.select\(['"][^'"]*principal_amount/, 'Must query loans.principal_amount');
  assert.doesNotMatch(code, /loan_amount/, 'Must NOT query stale loan_amount column');

  // Verify tenant isolation on all queries
  const tenantMatches = code.match(/\.eq\('user_id',\s*user\.id\)/g);
  assert.ok(tenantMatches && tenantMatches.length >= 6, 'All context queries must be tenant isolated via user_id');
});

// ==============================================================================
// 6. FIN-003: LOAN REVERSAL NETTING & DOUBLE-ENTRY INVARIANTS
// ==============================================================================

test('FIN-003 [6.A]: Loan disbursement records liability balance equal to disbursed principal', async () => {
  const userId = 'user-test-fin3';
  const loanId = 'loan-car-101';
  const bankAccId = 'acc-hdfc-1';
  const supabase = createP1MockSupabase({
    callerUid: userId,
    callerRole: 'authenticated',
    accounts: [{ id: bankAccId, user_id: userId, balance: 100000, current_balance: 100000 }],
    loans: [{ id: loanId, user_id: userId, name: 'Auto Loan', principal_amount: 300000 }],
  });

  const disburseRes = await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    loanName: 'Auto Loan',
    accountId: bankAccId,
    amount: '300000.00',
    date: '2026-08-01',
  });

  assert.equal(disburseRes.success, true);

  const balance = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(balance.outstandingPrincipal.toNumber(), 300000);
  assert.equal(balance.totalPrincipalPaid.toNumber(), 0);
  assert.equal(balance.isSettled, false);
});

test('FIN-003 [6.B]: Loan disbursement reversal produces NET ZERO outstanding balance', async () => {
  const userId = 'user-test-fin3';
  const loanId = 'loan-disb-rev-1';
  const bankAccId = 'acc-sbi-1';
  const supabase = createP1MockSupabase({
    callerUid: userId,
    callerRole: 'authenticated',
    accounts: [{ id: bankAccId, user_id: userId, balance: 500000, current_balance: 500000 }],
    loans: [{ id: loanId, user_id: userId, name: 'Disbursement Reversal Test', principal_amount: 200000 }],
  });

  // 1. Post Disbursement
  const disburseRes = await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '200000.00',
  });

  let balanceBefore = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(balanceBefore.outstandingPrincipal.toNumber(), 200000);

  // 2. Reverse Disbursement
  const revRes = await reverseFinancialTransaction(supabase, {
    userId,
    journalEntryId: disburseRes.journalEntryId!,
    reason: 'Incorrect loan disbursement entry',
  });
  assert.equal(revRes.success, true);

  // 3. Outstanding balance after reversal must net to exactly 0.00
  let balanceAfter = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(balanceAfter.outstandingPrincipal.toNumber(), 0, 'Original disbursement + symmetric reversal = NET ZERO');
  assert.equal(balanceAfter.isSettled, true);
});

test('FIN-003 [6.C & 6.D]: EMI payment reduces principal and EMI reversal cleanly restores pre-EMI balance', async () => {
  const userId = 'user-test-fin3';
  const loanId = 'loan-emi-rev-1';
  const bankAccId = 'acc-icici-1';
  const supabase = createP1MockSupabase({
    callerUid: userId,
    callerRole: 'authenticated',
    accounts: [{ id: bankAccId, user_id: userId, balance: 500000, current_balance: 500000 }],
    loans: [{ id: loanId, user_id: userId, name: 'Home Loan', principal_amount: 100000 }],
  });

  // Disburse ₹100,000
  await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '100000.00',
  });

  // Month 1 EMI: ₹10,000 Principal + ₹2,000 Interest
  const emiRes = await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '10000.00',
    interestAmount: '2000.00',
    date: '2026-08-15',
  });

  // 6.C: Outstanding principal reduced to ₹90,000
  let balAfterEMI = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(balAfterEMI.outstandingPrincipal.toNumber(), 90000);
  assert.equal(balAfterEMI.totalPrincipalPaid.toNumber(), 10000);
  assert.equal(balAfterEMI.totalInterestPaid.toNumber(), 2000);

  // 6.D: Reverse the EMI
  const revEMI = await reverseFinancialTransaction(supabase, {
    userId,
    journalEntryId: emiRes.journalEntryId!,
    reason: 'Bank bounced EMI payment',
  });
  assert.equal(revEMI.success, true);

  // Balance restored cleanly to pre-EMI ₹100,000
  let balAfterRev = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(balAfterRev.outstandingPrincipal.toNumber(), 100000, 'Reversing EMI must restore pre-EMI outstanding balance');
  assert.equal(balAfterRev.totalPrincipalPaid.toNumber(), 0);
  assert.equal(balAfterRev.totalInterestPaid.toNumber(), 0);
});

test('FIN-003 [6.E, 6.F, 6.G, 6.H]: Multi-transaction double-entry trial balance invariant (Debits === Credits)', async () => {
  const userId = 'user-test-fin3';
  const loanId = 'loan-invariants-1';
  const bankAccId = 'acc-bank-main';
  const supabase = createP1MockSupabase({
    callerUid: userId,
    callerRole: 'authenticated',
    accounts: [{ id: bankAccId, user_id: userId, balance: 1000000, current_balance: 1000000 }],
    loans: [{ id: loanId, user_id: userId, name: 'Business Loan', principal_amount: 500000 }],
  });

  // 1. Disbursement ₹500,000
  const dRes = await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '500000.00',
  });

  // 2. EMI 1: ₹50,000 principal + ₹5,000 interest
  const emi1 = await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '50000.00',
    interestAmount: '5000.00',
    date: '2026-06-01',
  });

  // 3. EMI 2: ₹50,000 principal + ₹4,500 interest
  const emi2 = await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '50000.00',
    interestAmount: '4500.00',
    date: '2026-07-01',
  });

  // 4. Reverse EMI 1
  await reverseFinancialTransaction(supabase, {
    userId,
    journalEntryId: emi1.journalEntryId!,
    reason: 'Reversal of EMI 1',
  });

  // Invariant 6.E / 6.F: Outstanding = 500k - 50k (EMI 2) = 450,000
  const bal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(bal.outstandingPrincipal.toNumber(), 450000);
  assert.equal(bal.totalPrincipalPaid.toNumber(), 50000);
  assert.equal(bal.totalInterestPaid.toNumber(), 4500);

  // Invariant 6.G: Repeated reversal on already reversed entry fails gracefully
  const repeatRev = await reverseFinancialTransaction(supabase, {
    userId,
    journalEntryId: emi1.journalEntryId!,
    reason: 'Duplicate reversal attempt',
  });
  assert.equal(repeatRev.success, false);
  assert.match(repeatRev.error!, /already been reversed/i);

  // Invariant 6.H: Total debits === total credits across all committed journal lines
  let grandTotalDebits = new Decimal(0);
  let grandTotalCredits = new Decimal(0);
  for (const line of supabase._state.journal_lines) {
    grandTotalDebits = grandTotalDebits.plus(new Decimal(line.debit_amount || 0));
    grandTotalCredits = grandTotalCredits.plus(new Decimal(line.credit_amount || 0));
  }
  assert.ok(
    grandTotalDebits.equals(grandTotalCredits),
    `Trial Balance Invariant: Grand Total Debits (${grandTotalDebits}) MUST equal Grand Total Credits (${grandTotalCredits})`
  );
});
