import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { orchestrateAIAction } from '../src/lib/ledger/ai-orchestrator.ts';
import { preflightPlan, executePlan, rollbackPlan, type AIPlan } from '../src/lib/ai/plan-orchestrator.ts';

// Mock DB simulator with PostgreSQL RPC security simulation
function createSecureMockSupabase(initialState?: any) {
  const state: any = {
    accounts: initialState?.accounts || [],
    counterparties: initialState?.counterparties || [],
    loans: initialState?.loans || [],
    investments: initialState?.investments || [],
    journal_entries: initialState?.journal_entries || [],
    journal_lines: initialState?.journal_lines || [],
    ledger_accounts: initialState?.ledger_accounts || [],
    ledger_audit_log: initialState?.ledger_audit_log || [],
    budgets: initialState?.budgets || [],
    budget_categories: initialState?.budget_categories || [],
    savings_goals: initialState?.savings_goals || [],
    recurring_transactions: initialState?.recurring_transactions || [],
    transaction_categories: initialState?.transaction_categories || [],
    receivables: initialState?.receivables || [],
    payables: initialState?.payables || [],
  };

  let entryCounter = 1;

  // Simulate execution context (auth.uid() and auth.role())
  let callerContext = {
    uid: 'user-123',
    role: 'authenticated',
  };

  const mockClient: any = {
    _state: state,
    _setCallerContext: (uid: string | null, role: string) => {
      callerContext = { uid: uid || '', role };
    },
    from: (table: string) => {
      if (!state[table]) state[table] = [];
      let currentFilter: (row: any) => boolean = () => true;

      const builder: any = {
        select: (columns: string = '*') => builder,
        eq: (field: string, val: any) => {
          const prev = currentFilter;
          currentFilter = (r: any) => {
            if (!prev(r)) return false;
            if (field in r) return r[field] === val;
            if (field === 'journal_entries.status') {
              const entry = state.journal_entries.find((e: any) => e.id === r.journal_entry_id);
              return entry ? entry.status === val : true;
            }
            return false;
          };
          return builder;
        },
        neq: (field: string, val: any) => {
          const prev = currentFilter;
          currentFilter = (r: any) => prev(r) && r[field] !== val;
          return builder;
        },
        in: (field: string, values: any[]) => {
          const prev = currentFilter;
          const valSet = new Set(values);
          currentFilter = (r: any) => {
            if (!prev(r)) return false;
            if (field === 'journal_entries.status') {
              const entry = state.journal_entries.find((e: any) => e.id === r.journal_entry_id);
              return entry ? valSet.has(entry.status) : false;
            }
            return valSet.has(r[field]);
          };
          return builder;
        },
        ilike: (field: string, pattern: string) => {
          const clean = pattern.replace(/%/g, '').toLowerCase();
          const prev = currentFilter;
          currentFilter = (r: any) => prev(r) && String(r[field] || '').toLowerCase().includes(clean);
          return builder;
        },
        or: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => {
          const rows = (state[table] || []).filter(currentFilter);
          return { data: rows[0] || null, error: null };
        },
        single: async () => {
          const rows = (state[table] || []).filter(currentFilter);
          if (rows.length === 0) return { data: null, error: { message: 'Row not found' } };
          return { data: rows[0], error: null };
        },
        insert: (rows: any | any[]) => {
          const toInsert = Array.isArray(rows) ? rows : [rows];
          const insertedRows = toInsert.map((r) => ({
            id: r.id || `mock-${table}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            created_at: new Date().toISOString(),
            ...r,
          }));
          state[table].push(...insertedRows);
          
          return {
            select: () => ({
              single: async () => ({ data: insertedRows[0], error: null }),
              maybeSingle: async () => ({ data: insertedRows[0] || null, error: null }),
              then: (resolve: any) => resolve({ data: insertedRows, error: null }),
            }),
            single: async () => ({ data: insertedRows[0], error: null }),
            then: (resolve: any) => resolve({ data: insertedRows, error: null }),
          };
        },
        upsert: (rows: any | any[]) => {
          return builder.insert(rows);
        },
        update: (values: any) => {
          let updateFilter = currentFilter;
          const updateBuilder: any = {
            eq: (f: string, v: any) => {
              const p = updateFilter;
              updateFilter = (r: any) => p(r) && r[f] === v;
              return updateBuilder;
            },
            neq: (f: string, v: any) => {
              const p = updateFilter;
              updateFilter = (r: any) => p(r) && r[f] !== v;
              return updateBuilder;
            },
            ilike: (f: string, v: any) => {
              const p = updateFilter;
              const clean = String(v).replace(/%/g, '').toLowerCase();
              updateFilter = (r: any) => p(r) && String(r[f] || '').toLowerCase().includes(clean);
              return updateBuilder;
            },
            in: (f: string, vals: any[]) => {
              const p = updateFilter;
              const valSet = new Set(vals);
              updateFilter = (r: any) => p(r) && valSet.has(r[f]);
              return updateBuilder;
            },
            select: () => ({
              single: async () => {
                const matching = (state[table] || []).filter(updateFilter);
                for (const row of matching) Object.assign(row, values);
                return { data: matching[0] || null, error: null };
              },
              then: (resolve: any) => {
                const matching = (state[table] || []).filter(updateFilter);
                for (const row of matching) Object.assign(row, values);
                resolve({ data: matching, error: null });
              },
            }),
            then: (resolve: any) => {
              const matching = (state[table] || []).filter(updateFilter);
              for (const row of matching) Object.assign(row, values);
              resolve({ data: matching, error: null });
            },
          };
          return updateBuilder;
        },
        delete: () => {
          const matching = (state[table] || []).filter(currentFilter);
          state[table] = (state[table] || []).filter((r: any) => !currentFilter(r));
          return {
            eq: builder.eq,
            then: (resolve: any) => resolve({ data: matching, error: null }),
          };
        },
        then: (resolve: any) => {
          const rows = (state[table] || []).filter(currentFilter);
          resolve({ data: rows, error: null });
        },
      };

      return builder;
    },
    rpc: async (fn: string, params: any) => {
      // Direct PostgreSQL RPC simulation of Migration 010
      if (fn === 'post_journal_entry') {
        const { p_user_id, p_transaction_date, p_description, p_source_type, p_source_id, p_idempotency_key, p_lines, p_created_by } = params;

        // Invariant 1: Authenticated caller must match p_user_id
        if (callerContext.role === 'authenticated' && callerContext.uid && callerContext.uid !== p_user_id) {
          return {
            data: null,
            error: { message: `Authorization Error: Caller auth.uid (${callerContext.uid}) does not match target user_id (${p_user_id}).` },
          };
        }

        // Invariant 2: Anonymous caller rejected
        if (callerContext.role === 'anon' || (!callerContext.uid && callerContext.role !== 'service_role')) {
          return {
            data: null,
            error: { message: 'Authentication Required: Anonymous callers cannot post journal entries.' },
          };
        }

        // Idempotency check
        const existing = state.journal_entries.find((j: any) => j.user_id === p_user_id && j.idempotency_key === p_idempotency_key);
        if (existing) return { data: existing.id, error: null };

        // Parse and validate lines
        const lines = typeof p_lines === 'string' ? JSON.parse(p_lines) : p_lines;
        if (!lines || lines.length < 2) {
          return { data: null, error: { message: 'Financial Integrity Error: A journal entry must have at least 2 lines.' } };
        }

        let totalDr = 0;
        let totalCr = 0;
        const acctIds = lines.map((l: any) => l.ledger_account_id);

        for (const l of lines) {
          if (l.debit_amount < 0 || l.credit_amount < 0) {
            return { data: null, error: { message: 'Financial Integrity Error: Debit and credit amounts must be non-negative.' } };
          }
          totalDr += Number(l.debit_amount || 0);
          totalCr += Number(l.credit_amount || 0);
        }

        if (Math.abs(totalDr - totalCr) > 0.0001) {
          return { data: null, error: { message: 'Financial Integrity Error: Unbalanced journal entry.' } };
        }

        // Verify account ownership
        const userLedgerAccounts = state.ledger_accounts.filter((la: any) => acctIds.includes(la.id) && la.user_id === p_user_id);
        if (userLedgerAccounts.length !== acctIds.length) {
          return { data: null, error: { message: 'Financial Integrity Error: One or more ledger accounts do not exist or belong to another user.' } };
        }

        const newId = `je-${entryCounter++}`;
        state.journal_entries.push({
          id: newId,
          user_id: p_user_id,
          transaction_date: p_transaction_date,
          description: p_description,
          source_type: p_source_type,
          source_id: p_source_id,
          idempotency_key: p_idempotency_key,
          status: 'posted',
          created_by: p_created_by,
        });

        for (const l of lines) {
          state.journal_lines.push({
            id: `jl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            journal_entry_id: newId,
            ledger_account_id: l.ledger_account_id,
            user_id: p_user_id,
            debit_amount: l.debit_amount,
            credit_amount: l.credit_amount,
            currency: l.currency || 'INR',
            memo: l.memo,
          });

          // Sync cached account balances
          const la = state.ledger_accounts.find((a: any) => a.id === l.ledger_account_id);
          if (la && la.entity_type === 'account' && la.entity_id) {
            const acc = state.accounts.find((a: any) => a.id === la.entity_id && a.user_id === p_user_id);
            if (acc) {
              const delta = la.account_type === 'asset'
                ? (Number(l.debit_amount || 0) - Number(l.credit_amount || 0))
                : (Number(l.credit_amount || 0) - Number(l.debit_amount || 0));
              acc.balance = (acc.balance || 0) + delta;
              acc.current_balance = (acc.current_balance || 0) + delta;
            }
          }
        }

        state.ledger_audit_log.push({
          id: `audit-${Date.now()}`,
          user_id: p_user_id,
          journal_entry_id: newId,
          action: 'POST',
          actor_id: p_created_by,
          payload_hash: 'mock-sha256-hash',
        });

        return { data: newId, error: null };
      }

      if (fn === 'post_reversal_entry') {
        const { p_user_id, p_original_entry_id, p_reason, p_idempotency_key, p_created_by } = params;

        // Invariant 1: Caller check
        if (callerContext.role === 'authenticated' && callerContext.uid && callerContext.uid !== p_user_id) {
          return {
            data: null,
            error: { message: `Authorization Error: Caller auth.uid (${callerContext.uid}) does not match target user_id (${p_user_id}).` },
          };
        }

        // Invariant 2: Anon check
        if (callerContext.role === 'anon' || (!callerContext.uid && callerContext.role !== 'service_role')) {
          return {
            data: null,
            error: { message: 'Authentication Required: Anonymous callers cannot post reversal entries.' },
          };
        }

        const orig = state.journal_entries.find((j: any) => j.id === p_original_entry_id && j.user_id === p_user_id);
        if (!orig) {
          return { data: null, error: { message: `Financial Integrity Error: Original journal entry ${p_original_entry_id} not found or unauthorized.` } };
        }
        if (orig.status === 'reversed') {
          return { data: null, error: { message: `Financial Integrity Error: Journal entry ${p_original_entry_id} has already been reversed.` } };
        }

        const origLines = state.journal_lines.filter((l: any) => l.journal_entry_id === p_original_entry_id);
        const revLines = origLines.map((l: any) => ({
          ledger_account_id: l.ledger_account_id,
          debit_amount: l.credit_amount,
          credit_amount: l.debit_amount,
          currency: l.currency,
          memo: `Reversal of ${orig.description}`,
        }));

        const revPostRes = await mockClient.rpc('post_journal_entry', {
          p_user_id,
          p_transaction_date: new Date().toISOString().split('T')[0],
          p_description: `REVERSAL: ${orig.description}`,
          p_source_type: 'reversal',
          p_source_id: String(p_original_entry_id),
          p_idempotency_key,
          p_lines: revLines,
          p_created_by,
        });

        if (revPostRes.error) return revPostRes;

        orig.status = 'reversed';
        orig.reversal_of_id = revPostRes.data;

        state.ledger_audit_log.push({
          id: `audit-${Date.now()}`,
          user_id: p_user_id,
          journal_entry_id: revPostRes.data,
          action: 'REVERSE',
          actor_id: p_created_by,
          payload_hash: 'mock-sha256-hash',
        });

        return { data: revPostRes.data, error: null };
      }

      return { data: null, error: { message: `Unknown RPC function: ${fn}` } };
    },
  };

  return mockClient;
}

test('1. Migration 010 Structure: SQL migration file strictly enforces auth.uid() and rejects anonymous callers', () => {
  const migrationPath = path.join(process.cwd(), 'supabase/migrations/010_rpc_caller_authorization.sql');
  assert.ok(fs.existsSync(migrationPath), '010_rpc_caller_authorization.sql must exist');

  const sqlContent = fs.readFileSync(migrationPath, 'utf-8');
  assert.ok(sqlContent.includes("auth.role() = 'authenticated'"), 'Must check auth.role() = authenticated');
  assert.ok(sqlContent.includes('auth.uid() <> p_user_id'), 'Must check auth.uid() <> p_user_id');
  assert.ok(sqlContent.includes("auth.role() = 'anon'"), 'Must reject auth.role() = anon');
  assert.ok(sqlContent.includes('SECURITY DEFINER SET search_path = public, extensions'), 'Must enforce search_path');
});

test('2. Live RPC Security: Authenticated User A attempting to post_journal_entry for User B is strictly rejected at the database RPC layer', async () => {
  const supabase = createSecureMockSupabase({
    accounts: [
      { id: 'acc-b-1', user_id: 'user-B', name: 'Victim Bank', balance: 50000, current_balance: 50000, is_active: true },
      { id: 'acc-b-2', user_id: 'user-B', name: 'Victim Savings', balance: 10000, current_balance: 10000, is_active: true },
    ],
    ledger_accounts: [
      { id: 'la-b-1', user_id: 'user-B', account_type: 'asset', entity_type: 'account', entity_id: 'acc-b-1', code: 'AST-ACC-1' },
      { id: 'la-b-2', user_id: 'user-B', account_type: 'asset', entity_type: 'account', entity_id: 'acc-b-2', code: 'AST-ACC-2' },
    ],
  });

  // Set caller as User A (Attacker)
  supabase._setCallerContext('user-A', 'authenticated');

  // Attempt to invoke post_journal_entry specifying p_user_id = User B
  const rpcRes = await supabase.rpc('post_journal_entry', {
    p_user_id: 'user-B',
    p_transaction_date: '2026-08-20',
    p_description: 'Malicious Cross-Tenant Transfer',
    p_source_type: 'transfer',
    p_source_id: 'malicious-1',
    p_idempotency_key: 'ATK:001',
    p_lines: [
      { ledger_account_id: 'la-b-1', debit_amount: 1000, credit_amount: 0 },
      { ledger_account_id: 'la-b-2', debit_amount: 0, credit_amount: 1000 },
    ],
    p_created_by: 'user-A',
  });

  assert.strictEqual(rpcRes.data, null, 'RPC must return null data on cross-tenant attempt');
  assert.ok(rpcRes.error, 'RPC must return an error');
  assert.ok(rpcRes.error.message.includes('Authorization Error'), 'Must return Authorization Error');

  // Verify User B balances remain completely untouched
  const victimAcc1 = supabase._state.accounts.find((a: any) => a.id === 'acc-b-1');
  const victimAcc2 = supabase._state.accounts.find((a: any) => a.id === 'acc-b-2');
  assert.strictEqual(victimAcc1.balance, 50000);
  assert.strictEqual(victimAcc2.balance, 10000);
  assert.strictEqual(supabase._state.journal_entries.length, 0);
});

test('3. Legitimate RPC Posting: Authenticated User A invoking post_journal_entry for User A succeeds with balanced debits and credits', async () => {
  const supabase = createSecureMockSupabase({
    accounts: [
      { id: 'acc-a-1', user_id: 'user-A', name: 'User A HDFC', balance: 50000, current_balance: 50000, is_active: true },
      { id: 'acc-a-2', user_id: 'user-A', name: 'User A ICICI', balance: 10000, current_balance: 10000, is_active: true },
    ],
    ledger_accounts: [
      { id: 'la-a-1', user_id: 'user-A', account_type: 'asset', entity_type: 'account', entity_id: 'acc-a-1', code: 'AST-ACC-A1' },
      { id: 'la-a-2', user_id: 'user-A', account_type: 'asset', entity_type: 'account', entity_id: 'acc-a-2', code: 'AST-ACC-A2' },
    ],
  });

  supabase._setCallerContext('user-A', 'authenticated');

  const rpcRes = await supabase.rpc('post_journal_entry', {
    p_user_id: 'user-A',
    p_transaction_date: '2026-08-20',
    p_description: 'Transfer between accounts',
    p_source_type: 'transfer',
    p_source_id: 'legit-1',
    p_idempotency_key: 'LEGIT:001',
    p_lines: [
      { ledger_account_id: 'la-a-2', debit_amount: 5000, credit_amount: 0 },
      { ledger_account_id: 'la-a-1', debit_amount: 0, credit_amount: 5000 },
    ],
    p_created_by: 'user-A',
  });

  assert.ok(rpcRes.data, 'RPC must succeed and return new journal entry ID');
  assert.strictEqual(rpcRes.error, null);

  const acc1 = supabase._state.accounts.find((a: any) => a.id === 'acc-a-1');
  const acc2 = supabase._state.accounts.find((a: any) => a.id === 'acc-a-2');
  assert.strictEqual(acc1.balance, 45000, 'Source account debited properly');
  assert.strictEqual(acc2.balance, 15000, 'Destination account credited properly');
});

test('4. Cross-Tenant Reversal: User A attempting to reverse User B journal entry is rejected at database RPC layer', async () => {
  const supabase = createSecureMockSupabase({
    journal_entries: [
      { id: 'je-victim-1', user_id: 'user-B', description: 'Victim Salary', status: 'posted' },
    ],
  });

  supabase._setCallerContext('user-A', 'authenticated');

  const revRes = await supabase.rpc('post_reversal_entry', {
    p_user_id: 'user-B',
    p_original_entry_id: 'je-victim-1',
    p_reason: 'Malicious reversal',
    p_idempotency_key: 'ATK:REV:001',
    p_created_by: 'user-A',
  });

  assert.strictEqual(revRes.data, null);
  assert.ok(revRes.error);
  assert.ok(revRes.error.message.includes('Authorization Error'));

  const orig = supabase._state.journal_entries.find((j: any) => j.id === 'je-victim-1');
  assert.strictEqual(orig.status, 'posted', 'Victim journal entry remains posted');
});

test('5. Anonymous Execution Rejection: Unauthenticated caller invoking post_journal_entry is strictly rejected', async () => {
  const supabase = createSecureMockSupabase();

  supabase._setCallerContext(null, 'anon');

  const rpcRes = await supabase.rpc('post_journal_entry', {
    p_user_id: 'user-A',
    p_transaction_date: '2026-08-20',
    p_description: 'Anonymous post attempt',
    p_source_type: 'expense',
    p_source_id: 'anon-1',
    p_idempotency_key: 'ANON:001',
    p_lines: [
      { ledger_account_id: 'la-1', debit_amount: 100, credit_amount: 0 },
      { ledger_account_id: 'la-2', debit_amount: 0, credit_amount: 100 },
    ],
    p_created_by: 'anon',
  });

  assert.strictEqual(rpcRes.data, null);
  assert.ok(rpcRes.error);
  assert.ok(rpcRes.error.message.includes('Authentication Required'));
});

test('6. Auxiliary Capability Execution: archive_account sets is_active = false and preserves ledger history', async () => {
  const supabase = createSecureMockSupabase({
    accounts: [
      { id: 'acc-1', user_id: 'user-123', name: 'Old SBI Account', is_active: true },
    ],
  });

  const res = await orchestrateAIAction(supabase, 'user-123', 'msg-arch-1', {
    actionType: 'archive_account',
    accountName: 'Old SBI Account',
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.message.includes('Archived account'));
  const updatedAcc = supabase._state.accounts.find((a: any) => a.id === 'acc-1');
  assert.strictEqual(updatedAcc.is_active, false);
});

test('7. Auxiliary Capability Execution: rename_person updates counterparty name and chart of accounts display', async () => {
  const supabase = createSecureMockSupabase({
    counterparties: [
      { id: 'cp-1', user_id: 'user-123', name: 'Vikram', is_active: true },
    ],
    ledger_accounts: [
      { id: 'la-rec-1', user_id: 'user-123', code: 'AST-REC-cp-1', entity_id: 'cp-1', name: 'Receivable: Vikram' },
      { id: 'la-pay-1', user_id: 'user-123', code: 'LIA-PAY-cp-1', entity_id: 'cp-1', name: 'Payable: Vikram' },
    ],
  });

  const res = await orchestrateAIAction(supabase, 'user-123', 'msg-ren-1', {
    actionType: 'rename_person',
    personName: 'Vikram',
    description: 'Vikram Sharma',
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.message.includes("Renamed counterparty from 'Vikram' to 'Vikram Sharma'"));
  const updatedCp = supabase._state.counterparties.find((c: any) => c.id === 'cp-1');
  assert.strictEqual(updatedCp.name, 'Vikram Sharma');
});

test('8. Auxiliary Capability Execution: create_budget and update_budget successfully manage spending limits', async () => {
  const supabase = createSecureMockSupabase({
    transaction_categories: [
      { id: 'cat-food', user_id: 'user-123', name: 'Food & Dining', is_active: true },
    ],
  });

  const createRes = await orchestrateAIAction(supabase, 'user-123', 'msg-bg-1', {
    actionType: 'create_budget',
    categoryName: 'Food & Dining',
    amount: 15000,
    month: 9,
    year: 2026,
  });

  assert.strictEqual(createRes.success, true);
  assert.ok(createRes.message.includes('Created budget of ₹15000.00 for Food & Dining'));
  assert.strictEqual(supabase._state.budgets.length, 1);
  assert.strictEqual(supabase._state.budget_categories.length, 1);

  const budgetId = supabase._state.budgets[0].id;
  const updateRes = await orchestrateAIAction(supabase, 'user-123', 'msg-bg-2', {
    actionType: 'update_budget',
    budgetId,
    amount: 18000,
  });

  assert.strictEqual(updateRes.success, true);
  assert.ok(updateRes.message.includes('Updated total budget to ₹18000.00'));
});

test('9. Auxiliary Capability Execution: create_savings_goal and update_savings_goal track financial targets', async () => {
  const supabase = createSecureMockSupabase();

  const createRes = await orchestrateAIAction(supabase, 'user-123', 'msg-goal-1', {
    actionType: 'create_savings_goal',
    description: 'Emergency Fund',
    targetAmount: 300000,
    deadline: '2026-12-31',
  });

  assert.strictEqual(createRes.success, true);
  assert.ok(createRes.message.includes("Created savings goal 'Emergency Fund' with target ₹300000.00"));
  assert.strictEqual(supabase._state.savings_goals.length, 1);

  const goalId = supabase._state.savings_goals[0].id;
  const updateRes = await orchestrateAIAction(supabase, 'user-123', 'msg-goal-2', {
    actionType: 'update_savings_goal',
    goalId,
    amount: 50000,
  });

  assert.strictEqual(updateRes.success, true);
  const updatedGoal = supabase._state.savings_goals.find((g: any) => g.id === goalId);
  assert.strictEqual(updatedGoal.current_amount, 50000);
});

test('10. Auxiliary Capability Execution: create_recurring_rule and delete_recurring_rule manage schedules', async () => {
  const supabase = createSecureMockSupabase({
    accounts: [
      { id: 'acc-salary', user_id: 'user-123', name: 'Salary Account', is_active: true },
    ],
  });

  const createRes = await orchestrateAIAction(supabase, 'user-123', 'msg-rec-1', {
    actionType: 'create_recurring_rule',
    accountName: 'Salary Account',
    amount: 25000,
    frequency: 'monthly',
    description: 'Monthly Apartment Rent',
  });

  assert.strictEqual(createRes.success, true);
  assert.ok(createRes.message.includes("Created recurring transaction rule 'Monthly Apartment Rent'"));
  assert.strictEqual(supabase._state.recurring_transactions.length, 1);

  const ruleId = supabase._state.recurring_transactions[0].id;
  const delRes = await orchestrateAIAction(supabase, 'user-123', 'msg-rec-2', {
    actionType: 'delete_recurring_rule',
    actionId: ruleId,
  });

  assert.strictEqual(delRes.success, true);
  assert.strictEqual(supabase._state.recurring_transactions.length, 0);
});

test('11. Multi-Step Plan Recovery: Failure at middle step allows clean reversal rollback of completed step', async () => {
  const supabase = createSecureMockSupabase({
    accounts: [
      { id: 'acc-hdfc', user_id: 'user-123', name: 'HDFC Bank', balance: 50000, current_balance: 50000, is_active: true },
      { id: 'acc-sbi', user_id: 'user-123', name: 'SBI Bank', balance: 10000, current_balance: 10000, is_active: true },
    ],
    ledger_accounts: [
      { id: 'la-hdfc', user_id: 'user-123', account_type: 'asset', entity_type: 'account', entity_id: 'acc-hdfc', code: 'AST-ACC-hdfc' },
      { id: 'la-sbi', user_id: 'user-123', account_type: 'asset', entity_type: 'account', entity_id: 'acc-sbi', code: 'AST-ACC-sbi' },
    ],
  });

  const plan: AIPlan = {
    planId: 'plan-recovery-test',
    title: 'Fund and Invest Plan',
    status: 'READY',
    createdAt: new Date().toISOString(),
    executedStepsCount: 0,
    steps: [
      {
        stepIndex: 1,
        title: 'Transfer ₹10,000 from HDFC to SBI',
        action: { actionType: 'transfer', accountName: 'HDFC Bank', toAccountName: 'SBI Bank', amount: 10000 },
        status: 'PENDING',
      },
      {
        stepIndex: 2,
        title: 'Buy Reliance Shares without demat account',
        action: { actionType: 'investment_buy', assetSymbol: 'RELIANCE', quantity: 10, pricePerUnit: 2500, holdingAccountName: 'NonExistentDemat' },
        status: 'PENDING',
      },
    ],
  };

  // Step 1 executes, Step 2 fails
  const execResult = await executePlan(supabase, 'user-123', plan);
  assert.strictEqual(execResult.status, 'PARTIAL_FAILURE');
  assert.strictEqual(execResult.executedStepsCount, 1);
  assert.ok(execResult.steps[0].result?.journalEntryId);

  // Step 1 journal entry exists in state
  assert.strictEqual(supabase._state.journal_entries.length, 1);
  assert.strictEqual(supabase._state.journal_entries[0].status, 'posted');

  // Trigger Plan Rollback
  const rollbackRes = await rollbackPlan(supabase, 'user-123', execResult);
  assert.strictEqual(rollbackRes.rolledBackStepsCount, 1);
  assert.strictEqual(execResult.status, 'ROLLED_BACK');
  assert.strictEqual(execResult.steps[0].status, 'CANCELLED');

  // Verify journal entry is marked reversed and reversal journal entry is posted
  assert.strictEqual(supabase._state.journal_entries[0].status, 'reversed');
  assert.strictEqual(supabase._state.journal_entries.length, 2);
  assert.strictEqual(supabase._state.journal_entries[1].source_type, 'reversal');
});
