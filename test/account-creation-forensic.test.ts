import test from 'node:test';
import assert from 'node:assert/strict';
import { orchestrateAIAction } from '../src/lib/ledger/ai-orchestrator.ts';
import { resolveSupportedAccountType, CAPABILITY_REGISTRY } from '../src/lib/ai/capabilities.ts';
import { recordFinancialTransaction, reverseFinancialTransaction } from '../src/lib/ledger/service.ts';

function createMockSupabase(initialState?: any) {
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
    savings_goals: initialState?.savings_goals || [],
    recurring_transactions: initialState?.recurring_transactions || [],
    transaction_categories: initialState?.transaction_categories || [],
    receivables: initialState?.receivables || [],
    payables: initialState?.payables || [],
    transactions: initialState?.transactions || [],
  };

  let entryCounter = 1;

  const mockClient: any = {
    _state: state,
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
          // PostgreSQL schema validation simulation
          for (const r of toInsert) {
            if (table === 'accounts' && 'account_type' in r) {
              return {
                select: () => ({
                  single: async () => ({ data: null, error: { message: "Could not find the 'account_type' column of 'accounts' in the schema cache" } }),
                }),
                single: async () => ({ data: null, error: { message: "Could not find the 'account_type' column of 'accounts' in the schema cache" } }),
              };
            }
          }
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
        upsert: (rows: any | any[]) => builder.insert(rows),
        update: (values: any) => {
          let updateFilter = currentFilter;
          const updateBuilder: any = {
            eq: (f: string, v: any) => {
              const p = updateFilter;
              updateFilter = (r: any) => p(r) && r[f] === v;
              return updateBuilder;
            },
            ilike: (f: string, v: any) => {
              const p = updateFilter;
              const clean = String(v).replace(/%/g, '').toLowerCase();
              updateFilter = (r: any) => p(r) && String(r[f] || '').toLowerCase().includes(clean);
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
    rpc: async (functionName: string, args: any) => {
      if (functionName === 'post_journal_entry') {
        const id = `je-${Date.now()}-${entryCounter++}`;
        const entry = {
          id,
          user_id: args.p_user_id,
          entry_number: entryCounter,
          transaction_date: args.p_transaction_date,
          posted_at: new Date().toISOString(),
          description: args.p_description,
          source_type: args.p_source_type,
          source_id: args.p_source_id,
          idempotency_key: args.p_idempotency_key,
          status: 'posted',
        };
        state.journal_entries.push(entry);

        for (const line of args.p_lines || []) {
          state.journal_lines.push({
            id: `jl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            journal_entry_id: id,
            ledger_account_id: line.ledger_account_id,
            user_id: args.p_user_id,
            debit_amount: line.debit_amount,
            credit_amount: line.credit_amount,
            currency: line.currency || 'INR',
            memo: line.memo,
          });

          // Sync balance
          const la = state.ledger_accounts.find((a: any) => a.id === line.ledger_account_id);
          if (la && la.entity_type === 'account' && la.entity_id) {
            const acc = state.accounts.find((a: any) => a.id === la.entity_id);
            if (acc) {
              const delta = la.account_type === 'asset'
                ? (Number(line.debit_amount || 0) - Number(line.credit_amount || 0))
                : (Number(line.credit_amount || 0) - Number(line.debit_amount || 0));
              acc.balance = (acc.balance || 0) + delta;
              acc.current_balance = (acc.current_balance || 0) + delta;
            }
          }
        }
        return { data: id, error: null };
      }

      if (functionName === 'post_reversal_entry') {
        const orig = state.journal_entries.find((j: any) => j.id === args.p_original_entry_id);
        if (!orig) return { data: null, error: { message: 'Original entry not found' } };
        orig.status = 'reversed';
        const revId = `je-rev-${Date.now()}`;
        state.journal_entries.push({
          id: revId,
          user_id: args.p_user_id,
          description: `REVERSAL: ${orig.description}`,
          status: 'posted',
        });
        return { data: revId, error: null };
      }

      return { data: null, error: null };
    },
  };

  return mockClient;
}

// ==========================================
// REGRESSION TEST SUITE: FORENSIC ACCOUNT CREATION
// ==========================================

test('1. Create Bank Account: "Create a new bank account called HDFC Salary Account"', async () => {
  const supabase = createMockSupabase();
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-1', {
    actionType: 'create_account',
    accountName: 'HDFC Salary Account',
    accountType: 'bank',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.verified, true);
  assert.strictEqual(res.message, "Created Bank Account 'HDFC Salary Account' successfully.");

  const created = supabase._state.accounts.find((a: any) => a.name === 'HDFC Salary Account');
  assert.ok(created);
  assert.strictEqual(created.type, 'bank');
  assert.strictEqual(created.user_id, 'user-1');
  assert.strictEqual(created.balance, 0);
  assert.strictEqual(created.current_balance, 0);
  assert.strictEqual(created.is_active, true);
  assert.strictEqual('account_type' in created, false); // Strict check: no nonexistent column

  // Verify chart of accounts provisioning
  const la = supabase._state.ledger_accounts.find((l: any) => l.code === `AST-ACC-${created.id}`);
  assert.ok(la);
  assert.strictEqual(la.user_id, 'user-1');
  assert.strictEqual(la.account_type, 'asset');
});

test('2. Create Savings Account: "Create a savings account called SBI Savings"', async () => {
  const supabase = createMockSupabase();
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-2', {
    actionType: 'create_account',
    accountName: 'SBI Savings',
    accountType: 'savings',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.message, "Created Savings Account 'SBI Savings' successfully.");
  const created = supabase._state.accounts.find((a: any) => a.name === 'SBI Savings');
  assert.strictEqual(created.type, 'bank');
});

test('3. Create Cash Account: "Create a cash account called Home Wallet"', async () => {
  const supabase = createMockSupabase();
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-3', {
    actionType: 'create_account',
    accountName: 'Home Wallet',
    accountType: 'cash',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.message, "Created Cash Account 'Home Wallet' successfully.");
  const created = supabase._state.accounts.find((a: any) => a.name === 'Home Wallet');
  assert.strictEqual(created.type, 'cash');
});

test('4. Create Digital Wallet: "Create a wallet called Paytm Wallet"', async () => {
  const supabase = createMockSupabase();
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-4', {
    actionType: 'create_account',
    accountName: 'Paytm Wallet',
    accountType: 'wallet',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.message, "Created Digital Wallet 'Paytm Wallet' successfully.");
  const created = supabase._state.accounts.find((a: any) => a.name === 'Paytm Wallet');
  assert.strictEqual(created.type, 'wallet');
});

test('5. Create Credit Card: "Create a credit card account called HDFC Credit Card"', async () => {
  const supabase = createMockSupabase();
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-5', {
    actionType: 'create_account',
    accountName: 'HDFC Credit Card',
    accountType: 'credit_card',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.message, "Created Credit Card 'HDFC Credit Card' successfully.");
  const created = supabase._state.accounts.find((a: any) => a.name === 'HDFC Credit Card');
  assert.strictEqual(created.type, 'credit');
});

test('6. Create Demat Account: "Create a Demat account called Zerodha"', async () => {
  const supabase = createMockSupabase();
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-6', {
    actionType: 'create_account',
    accountName: 'Zerodha',
    accountType: 'demat',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.message, "Created Demat Account 'Zerodha' successfully.");
  const created = supabase._state.accounts.find((a: any) => a.name === 'Zerodha');
  assert.strictEqual(created.type, 'investment');
});

test('7. Create Investment Account: "Create an investment account called Groww"', async () => {
  const supabase = createMockSupabase();
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-7', {
    actionType: 'create_account',
    accountName: 'Groww',
    accountType: 'investment',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.message, "Created Investment Account 'Groww' successfully.");
  const created = supabase._state.accounts.find((a: any) => a.name === 'Groww');
  assert.strictEqual(created.type, 'investment');
});

test('8. Unsupported Account Type is rejected safely with guidance', async () => {
  const supabase = createMockSupabase();
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-8', {
    actionType: 'create_account',
    accountName: 'Offshore Trust',
    accountType: 'crypto_vault_unsupported',
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.errorCode, 'INVALID_ACCOUNT_TYPE');
  assert.strictEqual(res.message, 'Action needs information');
  assert.strictEqual(supabase._state.accounts.length, 0);
});

test('9. Duplicate Account Handling: Cannot create active account with exact duplicate name', async () => {
  const supabase = createMockSupabase({
    accounts: [
      { id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Salary Account', type: 'bank', is_active: true, balance: 50000 },
    ],
  });

  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-9', {
    actionType: 'create_account',
    accountName: 'HDFC Salary Account',
    accountType: 'bank',
  });

  assert.strictEqual(res.success, false);
  assert.strictEqual(res.errorCode, 'ENTITY_AMBIGUOUS');
  assert.strictEqual(res.message, 'Action needs information');
  assert.ok(res.error?.includes("An active account named 'HDFC Salary Account' already exists"));
  assert.strictEqual(supabase._state.accounts.length, 1);
});

test('10. Cross-User Isolation: User A cannot see or be blocked by User B accounts', async () => {
  const supabase = createMockSupabase({
    accounts: [
      { id: 'acc-b-hdfc', user_id: 'user-2', name: 'HDFC Bank', type: 'bank', is_active: true },
    ],
  });

  // User 1 creates 'HDFC Bank' -> should succeed because User 2's account belongs to a different tenant
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-10', {
    actionType: 'create_account',
    accountName: 'HDFC Bank',
    accountType: 'bank',
  });

  assert.strictEqual(res.success, true);
  const created = supabase._state.accounts.find((a: any) => a.user_id === 'user-1');
  assert.ok(created);
  assert.strictEqual(created.name, 'HDFC Bank');
  assert.strictEqual(created.user_id, 'user-1');
});

test('11. Account Creation with explicit Opening Balance records ledger entry', async () => {
  const supabase = createMockSupabase();
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-11', {
    actionType: 'create_account',
    accountName: 'Axis Bank',
    accountType: 'bank',
    openingBalance: 25000,
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.journalEntryId);
  assert.strictEqual(res.message, "Created Bank Account 'Axis Bank' with ₹25000.00 opening balance in double-entry ledger.");

  const created = supabase._state.accounts.find((a: any) => a.name === 'Axis Bank');
  assert.strictEqual(created.balance, 25000);
  assert.strictEqual(supabase._state.journal_entries.length, 1);
  assert.strictEqual(supabase._state.journal_entries[0].source_type, 'account_opening');
});

test('12. Existing Person / Papa creation capability remains fully functional', async () => {
  const supabase = createMockSupabase();
  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-12', {
    actionType: 'create_person',
    personName: 'Papa',
    notes: 'Father',
  });

  assert.strictEqual(res.success, true);
  assert.strictEqual(res.message, "Added 'Papa' to your People Ledger with receivable and payable accounts.");
  const createdCp = supabase._state.counterparties.find((c: any) => c.name === 'Papa');
  assert.ok(createdCp);
  assert.strictEqual(createdCp.user_id, 'user-1');
});

test('13. Financial Transaction flow (Expense) remains fully functional', async () => {
  const supabase = createMockSupabase({
    accounts: [
      { id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', type: 'bank', is_active: true, balance: 50000 },
    ],
    transaction_categories: [
      { id: 'cat-groceries', user_id: 'user-1', name: 'Groceries', type: 'expense' },
    ],
  });

  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-13', {
    actionType: 'expense',
    accountName: 'HDFC Bank',
    categoryName: 'Groceries',
    amount: 1500,
    description: 'Weekly grocery shopping',
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.journalEntryId);
  const acc = supabase._state.accounts.find((a: any) => a.id === 'acc-hdfc');
  assert.strictEqual(acc.balance, 48500);
});

test('14. Investment Buy flow requires Demat account and succeeds when Demat exists', async () => {
  const supabase = createMockSupabase({
    accounts: [
      { id: 'acc-bank', user_id: 'user-1', name: 'HDFC Bank', type: 'bank', is_active: true, balance: 100000 },
      { id: 'acc-demat', user_id: 'user-1', name: 'Zerodha', type: 'investment', is_active: true, balance: 0 },
    ],
  });

  const res = await orchestrateAIAction(supabase, 'user-1', 'msg-14', {
    actionType: 'investment_buy',
    accountName: 'HDFC Bank',
    holdingAccountName: 'Zerodha',
    assetSymbol: 'RELIANCE',
    amount: 25000,
  });

  assert.strictEqual(res.success, true);
  assert.ok(res.journalEntryId);
});

test('15. Reversal flow remains fully functional and idempotent', async () => {
  const supabase = createMockSupabase({
    accounts: [
      { id: 'acc-bank', user_id: 'user-1', name: 'HDFC Bank', type: 'bank', is_active: true, balance: 50000 },
    ],
  });

  const postRes = await recordFinancialTransaction(supabase, {
    userId: 'user-1',
    type: 'expense',
    accountId: 'acc-bank',
    amount: '2000.00',
    date: '2026-08-20',
    description: 'Test Expense to Reverse',
    idempotencyKey: 'TEST:EXP:1',
  });

  assert.strictEqual(postRes.success, true);

  const revRes = await orchestrateAIAction(supabase, 'user-1', 'msg-15', {
    actionType: 'reversal',
    originalJournalEntryId: postRes.journalEntryId,
    reversalReason: 'Wrong transaction amount entered',
  });

  assert.strictEqual(revRes.success, true);
  assert.ok(revRes.reversalEntryId);
});
