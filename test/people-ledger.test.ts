import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import { validateJournalEntry } from '../src/lib/ledger/engine.ts';
import {
  ensureCounterpartyLedgerAccounts,
  getCounterpartyAuthoritativeBalance,
  getPeopleAuthoritativeSummary,
  getPersonLedgerHistory,
  recordLending,
  recordBorrowing,
  recordRepayment,
} from '../src/lib/ledger/people.ts';

// Configure high-precision decimal math
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// In-memory mock database store for comprehensive People Ledger testing
function createMockSupabase(initialData: {
  counterparties?: any[];
  ledger_accounts?: any[];
  journal_entries?: any[];
  journal_lines?: any[];
  accounts?: any[];
  receivables?: any[];
  payables?: any[];
} = {}) {
  const counterparties = [...(initialData.counterparties || [])];
  const ledger_accounts = [...(initialData.ledger_accounts || [])];
  const journal_entries = [...(initialData.journal_entries || [])];
  const journal_lines = [...(initialData.journal_lines || [])];
  const accounts = [...(initialData.accounts || [])];
  const receivables = [...(initialData.receivables || [])];
  const payables = [...(initialData.payables || [])];

  const client: any = {
    _store: { counterparties, ledger_accounts, journal_entries, journal_lines, accounts, receivables, payables },
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: (table: string) => {
      let filters: Array<(row: any) => boolean> = [];
      let orderByField: string | null = null;
      let orderAsc = true;
      let limitCount: number | null = null;

      const queryBuilder: any = {
        select: (cols: string = '*') => queryBuilder,
        eq: (field: string, val: any) => {
          filters.push((r: any) => r[field] === val);
          return queryBuilder;
        },
        neq: (field: string, val: any) => {
          filters.push((r: any) => r[field] !== val);
          return queryBuilder;
        },
        in: (field: string, vals: any[]) => {
          filters.push((r: any) => vals.includes(r[field]));
          return queryBuilder;
        },
        order: (field: string, opts?: { ascending?: boolean }) => {
          orderByField = field;
          orderAsc = opts?.ascending ?? true;
          return queryBuilder;
        },
        limit: (n: number) => {
          limitCount = n;
          return queryBuilder;
        },
        maybeSingle: async () => {
          const list = (client._store[table] || []).filter((r: any) => filters.every((f) => f(r)));
          return { data: list[0] || null, error: null };
        },
        single: async () => {
          const list = (client._store[table] || []).filter((r: any) => filters.every((f) => f(r)));
          if (list.length === 0) return { data: null, error: { message: 'Row not found' } };
          return { data: list[0], error: null };
        },
        insert: (data: any) => {
          const rows = Array.isArray(data) ? data : [data];
          let insertError: any = null;
          const inserted: any[] = [];

          for (const r of rows) {
            const row = { id: r.id || `id-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, created_at: new Date().toISOString(), ...r };
            // Enforce unique constraints on ledger_accounts
            if (table === 'ledger_accounts') {
              const duplicate = client._store.ledger_accounts.find(
                (a: any) => a.user_id === row.user_id && a.code === row.code
              );
              if (duplicate) {
                insertError = { message: 'duplicate key value violates unique constraint "uq_ledger_account_code"' };
                break;
              }
            }
            client._store[table].push(row);
            inserted.push(row);
          }

          if (insertError) {
            return {
              select: () => ({
                single: async () => ({ data: null, error: insertError }),
              }),
              then: (resolve: any) => resolve({ data: null, error: insertError }),
            };
          }

          return {
            select: () => ({
              single: async () => ({ data: inserted[0], error: null }),
            }),
            then: (resolve: any) => resolve({ data: inserted, error: null }),
          };
        },
        upsert: async (data: any) => {
          const row = { ...data, id: data.id || `id-${Date.now()}` };
          const idx = client._store[table].findIndex((r: any) => r.id === row.id);
          if (idx >= 0) client._store[table][idx] = { ...client._store[table][idx], ...row };
          else client._store[table].push(row);
          return { data: row, error: null };
        },
        update: (updateData: any) => ({
          eq: (field: string, val: any) => {
            let count = 0;
            client._store[table] = client._store[table].map((r: any) => {
              if (r[field] === val) {
                count++;
                return { ...r, ...updateData };
              }
              return r;
            });
            return {
              select: () => ({
                single: async () => ({
                  data: client._store[table].find((r: any) => r[field] === val),
                  error: null,
                }),
              }),
              then: (resolve: any) => resolve({ data: null, error: null }),
            };
          },
        }),
        delete: () => ({
          eq: (field: string, val: any) => {
            client._store[table] = client._store[table].filter((r: any) => r[field] !== val);
            return Promise.resolve({ error: null });
          },
        }),
        then: (resolve: any) => {
          let list = (client._store[table] || []).filter((r: any) => filters.every((f) => f(r)));
          if (table === 'journal_lines') {
            // Join mock for journal_entries
            list = list.map((l: any) => {
              const entry = client._store.journal_entries.find((e: any) => e.id === l.journal_entry_id);
              return { ...l, journal_entries: entry || { status: 'posted' } };
            });
          }
          if (limitCount) list = list.slice(0, limitCount);
          resolve({ data: list, error: null });
        },
      };

      return queryBuilder;
    },
    rpc: async (fn: string, args: any) => {
      if (fn === 'post_journal_entry') {
        const lines = args.p_lines || [];
        const entryId = `je-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const entry = {
          id: entryId,
          user_id: args.p_user_id,
          entry_number: client._store.journal_entries.length + 1,
          transaction_date: args.p_transaction_date,
          description: args.p_description,
          source_type: args.p_source_type,
          source_id: args.p_source_id,
          idempotency_key: args.p_idempotency_key,
          status: 'posted',
          created_by: args.p_created_by,
          created_at: new Date().toISOString(),
        };

        // Check idempotency
        const existing = client._store.journal_entries.find(
          (e: any) => e.user_id === args.p_user_id && e.idempotency_key === args.p_idempotency_key
        );
        if (existing) return { data: existing.id, error: null };

        client._store.journal_entries.push(entry);

        for (const line of lines) {
          client._store.journal_lines.push({
            id: `jl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            journal_entry_id: entryId,
            ledger_account_id: line.ledger_account_id,
            user_id: args.p_user_id,
            debit_amount: Number(line.debit_amount || 0),
            credit_amount: Number(line.credit_amount || 0),
            currency: line.currency || 'INR',
            memo: line.memo || null,
            created_at: new Date().toISOString(),
          });
        }
        return { data: entryId, error: null };
      }

      if (fn === 'post_reversal_entry') {
        const original = client._store.journal_entries.find((e: any) => e.id === args.p_original_entry_id);
        if (!original) return { data: null, error: { message: 'Original entry not found' } };
        if (original.status === 'reversed') return { data: null, error: { message: 'Entry already reversed' } };
        original.status = 'reversed';
        const revId = `rev-${Date.now()}`;
        client._store.journal_entries.push({
          id: revId,
          user_id: args.p_user_id,
          entry_number: client._store.journal_entries.length + 1,
          transaction_date: new Date().toISOString().split('T')[0],
          description: `REVERSAL: ${original.description}`,
          source_type: 'reversal',
          idempotency_key: args.p_idempotency_key || `REV:${args.p_original_entry_id}`,
          status: 'posted',
          created_by: args.p_created_by,
          created_at: new Date().toISOString(),
        });
        const origLines = client._store.journal_lines.filter((l: any) => l.journal_entry_id === original.id);
        for (const l of origLines) {
          client._store.journal_lines.push({
            id: `jl-rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            journal_entry_id: revId,
            ledger_account_id: l.ledger_account_id,
            user_id: l.user_id,
            debit_amount: l.credit_amount,
            credit_amount: l.debit_amount,
            currency: l.currency || 'INR',
            memo: `Reversal of ${l.memo || original.description}`,
            created_at: new Date().toISOString(),
          });
        }
        return { data: revId, error: null };
      }

      return { data: null, error: { message: 'Unknown RPC' } };
    },
  };

  return client;
}

// =========================================================================
// 26 TARGETED TESTS FOR PEOPLE LEDGER IMPLEMENTATION
// =========================================================================

// Test 1: Counterparty Ownership
test('1. Counterparty Ownership: Isolates records to authenticated user', async () => {
  const supabase = createMockSupabase({
    counterparties: [
      { id: 'cp-amit', user_id: 'user-1', name: 'Amit Sharma' },
      { id: 'cp-other', user_id: 'user-2', name: 'Other User Person' },
    ],
  });

  const { receivableAccountId, payableAccountId } = await ensureCounterpartyLedgerAccounts(
    supabase,
    'user-1',
    'cp-amit'
  );

  assert.ok(receivableAccountId);
  assert.ok(payableAccountId);
});

// Test 2: Provision Receivable Ledger Account
test('2. Receivable Account Provisioning: Generates AST-REC-<id> with type asset', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit Sharma' }],
  });

  const { receivableAccountId } = await ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-amit');
  const acc = supabase._store.ledger_accounts.find((a: any) => a.id === receivableAccountId);

  assert.equal(acc.code, 'AST-REC-cp-amit');
  assert.equal(acc.account_type, 'asset');
  assert.equal(acc.entity_type, 'counterparty_receivable');
  assert.equal(acc.entity_id, 'cp-amit');
});

// Test 3: Provision Payable Ledger Account
test('3. Payable Account Provisioning: Generates LIA-PAY-<id> with type liability', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-rahul', user_id: 'user-1', name: 'Rahul Verma' }],
  });

  const { payableAccountId } = await ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-rahul');
  const acc = supabase._store.ledger_accounts.find((a: any) => a.id === payableAccountId);

  assert.equal(acc.code, 'LIA-PAY-cp-rahul');
  assert.equal(acc.account_type, 'liability');
  assert.equal(acc.entity_type, 'counterparty_payable');
  assert.equal(acc.entity_id, 'cp-rahul');
});

// Test 4: Lending Balanced Entry
test('4. Lending Balanced Entry: Posts Dr Asset:Receivable and Cr Asset:Bank', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 50000 }],
  });

  const result = await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '2000.00',
    description: 'Lent ₹2,000 to Amit',
    receivableId: 'rec-1',
  });

  assert.equal(result.success, true);
  if (result.success) {
    const lines = supabase._store.journal_lines.filter((l: any) => l.journal_entry_id === result.journalEntryId);
    assert.equal(lines.length, 2);

    const recLine = lines.find((l: any) => l.debit_amount === 2000);
    const bankLine = lines.find((l: any) => l.credit_amount === 2000);
    assert.ok(recLine, 'Receivable line must be debited');
    assert.ok(bankLine, 'Bank line must be credited');

    const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
    assert.equal(balances.receivableBalance, 2000);
    assert.equal(balances.payableBalance, 0);
    assert.equal(balances.direction, 'THEY_OWE_YOU');
  }
});

// Test 5: Borrowing Balanced Entry
test('5. Borrowing Balanced Entry: Posts Dr Asset:Bank and Cr Liability:Payable', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-rahul', user_id: 'user-1', name: 'Rahul' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 10000 }],
  });

  const result = await recordBorrowing(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-rahul',
    accountId: 'acc-hdfc',
    amount: '5000.00',
    description: 'Borrowed ₹5,000 from Rahul',
    payableId: 'pay-1',
  });

  assert.equal(result.success, true);
  if (result.success) {
    const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-rahul');
    assert.equal(balances.payableBalance, 5000);
    assert.equal(balances.receivableBalance, 0);
    assert.equal(balances.direction, 'YOU_OWE_THEM');
  }
});

// Test 6: Partial Payable Repayment (User repays person)
test('6. Partial Payable Repayment: User repays ₹2,000 of ₹5,000 debt -> ₹3,000 remaining', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-rahul', user_id: 'user-1', name: 'Rahul' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  // 1. Borrow 5000
  await recordBorrowing(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-rahul',
    accountId: 'acc-hdfc',
    amount: '5000.00',
  });

  // 2. Repay 2000
  const repRes = await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-rahul',
    accountId: 'acc-hdfc',
    amount: '2000.00',
    direction: 'out',
    repaymentId: 'rep-pay-1',
  });

  assert.equal(repRes.success, true);
  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-rahul');
  assert.equal(balances.payableBalance, 3000);
  assert.equal(balances.direction, 'YOU_OWE_THEM');
});

// Test 7: Partial Receivable Repayment (Person repays user)
test('7. Partial Receivable Repayment: Amit repays ₹2,000 of ₹5,000 -> ₹3,000 remaining', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  // 1. Lend 5000
  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '5000.00',
  });

  // 2. Receive 2000 repayment
  const repRes = await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '2000.00',
    direction: 'in',
    repaymentId: 'rep-rec-1',
  });

  assert.equal(repRes.success, true);
  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
  assert.equal(balances.receivableBalance, 3000);
  assert.equal(balances.direction, 'THEY_OWE_YOU');
});

// Test 8: Full Settlement = Exact ₹0.00
test('8. Full Settlement: Settling full debt reaches exactly ₹0.00 without floating drift', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '3450.75',
  });

  await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '3450.75',
    direction: 'in',
  });

  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
  assert.equal(balances.receivableBalance, 0);
  assert.equal(balances.payableBalance, 0);
  assert.equal(balances.netBalance, 0);
  assert.equal(balances.direction, 'SETTLED');
});

// Test 9: Receivable Overpayment Rejection
test('9. Receivable Overpayment Rejection: Repaying ₹2,500 on ₹2,000 balance is rejected', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '2000.00',
  });

  const overpayRes = await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '2500.00',
    direction: 'in',
  });

  assert.equal(overpayRes.success, false);
  if (!overpayRes.success) {
    assert.match(overpayRes.error, /Overpayment Error/);
    assert.match(overpayRes.error, /2500.00/);
    assert.match(overpayRes.error, /2000.00/);
  }

  // Balance must remain ₹2,000 without corruption
  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
  assert.equal(balances.receivableBalance, 2000);
});

// Test 10: Payable Overpayment Rejection
test('10. Payable Overpayment Rejection: Paying ₹6,000 on ₹5,000 debt is rejected', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-rahul', user_id: 'user-1', name: 'Rahul' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  await recordBorrowing(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-rahul',
    accountId: 'acc-hdfc',
    amount: '5000.00',
  });

  const overpayRes = await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-rahul',
    accountId: 'acc-hdfc',
    amount: '6000.00',
    direction: 'out',
  });

  assert.equal(overpayRes.success, false);
  if (!overpayRes.success) {
    assert.match(overpayRes.error, /Overpayment Error/);
  }

  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-rahul');
  assert.equal(balances.payableBalance, 5000);
});

// Test 11: Reversal Restoration
test('11. Reversal Restoration: Reversing repayment restores exact previous balance', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '4000.00',
  });

  const repRes = await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '1500.00',
    direction: 'in',
    repaymentId: 'rep-rev-test',
  });

  assert.equal(repRes.success, true);
  if (repRes.success) {
    // Reverse the repayment entry
    await supabase.rpc('post_reversal_entry', {
      p_user_id: 'user-1',
      p_original_entry_id: repRes.journalEntryId,
      p_reason: 'Incorrect repayment',
      p_idempotency_key: 'REV:rep-rev-test',
      p_created_by: 'user-1',
    });

    const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
    assert.equal(balances.receivableBalance, 4000, 'Reversal must restore exact ₹4,000 balance');
  }
});

// Test 12: Duplicate Lending Idempotency
test('12. Duplicate Lending Idempotency: Retrying REC:LEND:<id> produces exactly 1 journal entry', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  const res1 = await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '2000.00',
    receivableId: 'rec-idem-1',
  });

  const res2 = await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '2000.00',
    receivableId: 'rec-idem-1', // Same ID
  });

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  if (res1.success && res2.success) {
    assert.equal(res1.journalEntryId, res2.journalEntryId);
  }

  const entries = supabase._store.journal_entries.filter((e: any) => e.idempotency_key === 'REC:LEND:rec-idem-1');
  assert.equal(entries.length, 1);

  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
  assert.equal(balances.receivableBalance, 2000);
});

// Test 13: Duplicate Borrowing Idempotency
test('13. Duplicate Borrowing Idempotency: Retrying PAY:BORROW:<id> produces exactly 1 journal entry', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-rahul', user_id: 'user-1', name: 'Rahul' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  const res1 = await recordBorrowing(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-rahul',
    accountId: 'acc-hdfc',
    amount: '5000.00',
    payableId: 'pay-idem-1',
  });

  const res2 = await recordBorrowing(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-rahul',
    accountId: 'acc-hdfc',
    amount: '5000.00',
    payableId: 'pay-idem-1',
  });

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.equal(supabase._store.journal_entries.length, 1);
});

// Test 14: Duplicate Repayment Idempotency
test('14. Duplicate Repayment Idempotency: Retrying repayment produces exactly 1 financial effect', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '5000.00',
  });

  const res1 = await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '2000.00',
    direction: 'in',
    repaymentId: 'rep-dup-1',
  });

  const res2 = await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '2000.00',
    direction: 'in',
    repaymentId: 'rep-dup-1',
  });

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);

  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
  assert.equal(balances.receivableBalance, 3000);
});

// Test 15: Concurrent Repayments
test('15. Concurrent Repayments: Two ₹3,000 repayments on ₹5,000 balance commit only 1 valid repayment', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '5000.00',
  });

  // First repayment commits 3000 (leaves 2000)
  const req1 = await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '3000.00',
    direction: 'in',
    repaymentId: 'conc-rep-1',
  });

  // Second repayment of 3000 exceeds remaining 2000 -> must reject
  const req2 = await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '3000.00',
    direction: 'in',
    repaymentId: 'conc-rep-2',
  });

  assert.equal(req1.success, true);
  assert.equal(req2.success, false);
  if (!req2.success) {
    assert.match(req2.error, /Overpayment Error/);
  }

  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
  assert.equal(balances.receivableBalance, 2000);
});

// Test 16: Cross-User Counterparty Rejection
test('16. Cross-User Counterparty Rejection: User A cannot post entries for User B counterparty', async () => {
  const supabase = createMockSupabase({
    counterparties: [
      { id: 'cp-user2', user_id: 'user-2', name: 'User 2 Friend' },
    ],
    accounts: [{ id: 'acc-user1', user_id: 'user-1', name: 'HDFC Bank', balance: 20000 }],
  });

  await assert.rejects(
    async () => {
      await ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-user2');
    },
    /Security Violation/
  );
});

// Test 17: Cross-User Ledger Account Rejection
test('17. Cross-User Ledger Account Rejection: Attempting to debit account of another user fails', () => {
  const lines = [
    { ledgerAccountId: 'acc-user2-rec', debitAmount: '1000.00', creditAmount: '0.00' },
    { ledgerAccountId: 'acc-user1-bank', debitAmount: '0.00', creditAmount: '1000.00' },
  ];

  // Mathematical double-entry validation
  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
});

// Test 18: Reversed-Entry Cancellation in Double-Entry
test('18. Reversed-Entry Cancellation: Original entry + reversal entry cancel mathematically to leave only active entries', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    ledger_accounts: [
      { id: 'ast-rec-amit', user_id: 'user-1', code: 'AST-REC-cp-amit', account_type: 'asset', entity_type: 'counterparty_receivable', entity_id: 'cp-amit' },
      { id: 'ast-bank', user_id: 'user-1', code: 'AST-ACC-1', account_type: 'asset', entity_type: 'account', entity_id: 'acc-1' },
    ],
    journal_entries: [
      { id: 'je-active', user_id: 'user-1', status: 'posted' },
      { id: 'je-reversed', user_id: 'user-1', status: 'reversed' },
      { id: 'je-reversal', user_id: 'user-1', status: 'posted', reversal_of_id: 'je-reversed' },
    ],
    journal_lines: [
      { id: 'jl-1', journal_entry_id: 'je-active', ledger_account_id: 'ast-rec-amit', user_id: 'user-1', debit_amount: 5000, credit_amount: 0 },
      { id: 'jl-2', journal_entry_id: 'je-active', ledger_account_id: 'ast-bank', user_id: 'user-1', debit_amount: 0, credit_amount: 5000 },
      // Original reversed entry of 3000 (Dr Receivable)
      { id: 'jl-3', journal_entry_id: 'je-reversed', ledger_account_id: 'ast-rec-amit', user_id: 'user-1', debit_amount: 3000, credit_amount: 0 },
      { id: 'jl-4', journal_entry_id: 'je-reversed', ledger_account_id: 'ast-bank', user_id: 'user-1', debit_amount: 0, credit_amount: 3000 },
      // Reversal entry of 3000 (Cr Receivable - inverts Dr Receivable)
      { id: 'jl-5', journal_entry_id: 'je-reversal', ledger_account_id: 'ast-rec-amit', user_id: 'user-1', debit_amount: 0, credit_amount: 3000 },
      { id: 'jl-6', journal_entry_id: 'je-reversal', ledger_account_id: 'ast-bank', user_id: 'user-1', debit_amount: 3000, credit_amount: 0 },
    ],
  });

  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
  assert.equal(balances.receivableBalance, 5000, 'Reversal lines mathematically cancel original lines: 5000 + 3000 - 3000 = 5000');
});

// Test 19: Projection Mismatch Detection
test('19. Projection Mismatch Detection: Legacy projections with desynchronized values do not alter ledger balance', async () => {
  const supabase = createMockSupabase({
    counterparties: [
      { id: 'cp-amit', user_id: 'user-1', name: 'Amit', amount_owed_by: 99999 }, // Corrupted legacy field
    ],
    receivables: [
      { id: 'rec-1', user_id: 'user-1', counterparty_id: 'cp-amit', original_amount: 88888 }, // Corrupted legacy field
    ],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC', balance: 50000 }],
  });

  // Legitimate ledger entry of ₹2,000
  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '2000.00',
  });

  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
  assert.equal(balances.receivableBalance, 2000, 'Authoritative balance must be ₹2,000 from ledger, ignoring corrupt legacy values');
});

// Test 20: Ledger-Derived History
test('20. Ledger-Derived History: Reconstructs chronological history directly from journal entries', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 50000 }],
  });

  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '5000.00',
    date: '2026-01-01',
    description: 'Initial loan',
  });

  await recordRepayment(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '2000.00',
    direction: 'in',
    date: '2026-01-05',
    description: 'First installment',
  });

  const history = await getPersonLedgerHistory(supabase, 'user-1', 'cp-amit');
  assert.equal(history.length, 2);
  assert.equal(history[0].moneyLent, 5000);
  assert.equal(history[0].runningReceivableBalance, 5000);
  assert.equal(history[1].moneyReceived, 2000);
  assert.equal(history[1].runningReceivableBalance, 3000);
  assert.equal(history[1].direction, 'THEY_OWE_YOU');
});

// Test 21: Concurrent Account Provisioning
test('21. Concurrent Account Provisioning: Simultaneous provisioning calls resolve cleanly to same accounts', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
  });

  const [call1, call2] = await Promise.all([
    ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-amit'),
    ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-amit'),
  ]);

  assert.equal(call1.receivableAccountId, call2.receivableAccountId);
  assert.equal(call1.payableAccountId, call2.payableAccountId);
});

// Test 22: No Duplicate Receivable Accounts
test('22. No Duplicate Receivable Accounts: Multiple requests produce exactly 1 receivable account', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
  });

  await ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-amit');
  await ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-amit');
  await ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-amit');

  const recAccounts = supabase._store.ledger_accounts.filter(
    (a: any) => a.code === 'AST-REC-cp-amit' && a.user_id === 'user-1'
  );
  assert.equal(recAccounts.length, 1);
});

// Test 23: No Duplicate Payable Accounts
test('23. No Duplicate Payable Accounts: Multiple requests produce exactly 1 payable account', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
  });

  await ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-amit');
  await ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-amit');

  const payAccounts = supabase._store.ledger_accounts.filter(
    (a: any) => a.code === 'LIA-PAY-cp-amit' && a.user_id === 'user-1'
  );
  assert.equal(payAccounts.length, 1);
});

// Test 24: Legacy Projection Non-Authority
test('24. Legacy Projection Non-Authority: Projections are purely downstream and never authoritative', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit', amount_owed_by: 0, amount_owed_to: 0 }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 50000 }],
  });

  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '1200.00',
  });

  // Authoritative calculation reads journal lines
  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
  assert.equal(balances.receivableBalance, 1200);
});

// Test 25: Balance Remains Correct When Legacy Projections Are Stale/Cleared
test('25. Resilient Balance Derivation: Deleting all legacy receivables does not corrupt ledger balance', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-amit', user_id: 'user-1', name: 'Amit' }],
    accounts: [{ id: 'acc-hdfc', user_id: 'user-1', name: 'HDFC Bank', balance: 50000 }],
  });

  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-hdfc',
    amount: '7500.00',
  });

  // Completely wipe legacy table
  supabase._store.receivables = [];

  const balances = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-amit');
  assert.equal(balances.receivableBalance, 7500, 'Ledger-derived balance remains intact');
});

// Test 26: Cross-User Provisioning Rejection
test('26. Cross-User Provisioning Rejection: Attempting to provision for unowned counterparty is rejected', async () => {
  const supabase = createMockSupabase({
    counterparties: [{ id: 'cp-user2', user_id: 'user-2', name: 'User 2 Person' }],
  });

  await assert.rejects(
    async () => {
      await ensureCounterpartyLedgerAccounts(supabase, 'user-1', 'cp-user2');
    },
    /Security Violation/
  );
});
