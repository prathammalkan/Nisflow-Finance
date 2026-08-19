import { test } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import {
  recordLending,
  recordBorrowing,
  recordRepayment,
  getPeopleAuthoritativeSummary,
  getCounterpartyAuthoritativeBalance,
} from '../src/lib/ledger/people.ts';
import { recordFinancialTransaction, reverseFinancialTransaction } from '../src/lib/ledger/service.ts';
import { postJournalEntry } from '../src/lib/ledger/engine.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

function createMockSupabase(initialState: {
  userId?: string;
  accounts?: any[];
  counterparties?: any[];
  loans?: any[];
  categories?: any[];
  transactions?: any[];
  third_party_funds?: any[];
  thirdParty?: any[];
  ledger_accounts?: any[];
  ledgerAccounts?: any[];
  journal_entries?: any[];
  journalEntries?: any[];
  journal_lines?: any[];
  journalLines?: any[];
  receivables?: any[];
  payables?: any[];
} = {}) {
  const defaultUserId = initialState.userId || 'user-uuid-1';
  const store: Record<string, any[]> = {
    accounts: [...(initialState.accounts || [])],
    counterparties: [...(initialState.counterparties || [])],
    loans: [...(initialState.loans || [])],
    categories: [...(initialState.categories || [])],
    transactions: [...(initialState.transactions || [])],
    third_party_funds: [...(initialState.thirdParty || initialState.third_party_funds || [])],
    ledger_accounts: [...(initialState.ledgerAccounts || initialState.ledger_accounts || [])],
    journal_entries: [...(initialState.journalEntries || initialState.journal_entries || [])],
    journal_lines: [...(initialState.journalLines || initialState.journal_lines || [])],
    ledger_audit_log: [],
    receivables: [...(initialState.receivables || [])],
    payables: [...(initialState.payables || [])],
  };

  const client: any = {
    _store: store,
    auth: {
      getUser: async () => ({
        data: { user: { id: defaultUserId, email: 'tester@example.com' } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (!store[table]) store[table] = [];

      let filters: Array<(row: any) => boolean> = [];
      let orderByField: string | null = null;
      let orderAscending = true;
      let limitCount: number | null = null;

      const builder: any = {
        select: (_cols?: string) => builder,
        eq: (col: string, val: any) => {
          filters.push((r: any) => {
            if (col.includes('.')) {
              const parts = col.split('.');
              let curr = r;
              for (const p of parts) {
                curr = curr?.[p];
              }
              return curr === val;
            }
            return r[col] === val;
          });
          return builder;
        },
        neq: (col: string, val: any) => {
          filters.push((r: any) => {
            if (col.includes('.')) {
              const parts = col.split('.');
              let curr = r;
              for (const p of parts) {
                curr = curr?.[p];
              }
              return curr !== val;
            }
            return r[col] !== val;
          });
          return builder;
        },
        in: (col: string, vals: any[]) => {
          filters.push((r: any) => vals.includes(r[col]));
          return builder;
        },
        gte: (col: string, val: any) => {
          filters.push((r: any) => {
            const rowVal = col.includes('.')
              ? col.split('.').reduce((acc, p) => acc?.[p], r)
              : r[col];
            return rowVal >= val;
          });
          return builder;
        },
        lte: (col: string, val: any) => {
          filters.push((r: any) => {
            const rowVal = col.includes('.')
              ? col.split('.').reduce((acc, p) => acc?.[p], r)
              : r[col];
            return rowVal <= val;
          });
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          orderByField = col;
          orderAscending = opts?.ascending !== false;
          return builder;
        },
        limit: (n: number) => {
          limitCount = n;
          return builder;
        },
        maybeSingle: async () => {
          let rows = store[table].map((line: any) => {
            if (table === 'journal_lines') {
              const entry = store.journal_entries.find(e => e.id === line.journal_entry_id);
              return { ...line, journal_entries: entry || null };
            }
            return line;
          }).filter((r: any) => filters.every(f => f(r)));
          return { data: rows[0] || null, error: null };
        },
        single: async () => {
          let rows = store[table].map((line: any) => {
            if (table === 'journal_lines') {
              const entry = store.journal_entries.find(e => e.id === line.journal_entry_id);
              return { ...line, journal_entries: entry || null };
            }
            return line;
          }).filter((r: any) => filters.every(f => f(r)));
          if (rows.length === 0) return { data: null, error: { message: 'Not found' } };
          return { data: rows[0], error: null };
        },
        then: (resolve: any, reject: any) => {
          let rows = store[table].map((line: any) => {
            if (table === 'journal_lines') {
              const entry = store.journal_entries.find(e => e.id === line.journal_entry_id);
              return { ...line, journal_entries: entry || null };
            }
            return line;
          }).filter((r: any) => filters.every(f => f(r)));

          if (orderByField) {
            rows = [...rows].sort((a, b) => {
              const valA = a[orderByField!];
              const valB = b[orderByField!];
              if (valA < valB) return orderAscending ? -1 : 1;
              if (valA > valB) return orderAscending ? 1 : -1;
              return 0;
            });
          }

          if (limitCount !== null) {
            rows = rows.slice(0, limitCount);
          }

          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
        insert: (dataToInsert: any) => {
          const items = Array.isArray(dataToInsert) ? dataToInsert : [dataToInsert];
          const createdItems: any[] = [];
          for (const it of items) {
            const row = {
              id: it.id || `mock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              created_at: new Date().toISOString(),
              ...it,
            };
            store[table].push(row);
            createdItems.push(row);
          }
          return {
            select: () => ({
              single: async () => ({ data: createdItems[0], error: null }),
              maybeSingle: async () => ({ data: createdItems[0], error: null }),
            }),
            single: async () => ({ data: createdItems[0], error: null }),
            then: (resolve: any) => resolve({ data: createdItems, error: null }),
          };
        },
        upsert: (dataToUpsert: any) => {
          const items = Array.isArray(dataToUpsert) ? dataToUpsert : [dataToUpsert];
          const upserted: any[] = [];
          for (const it of items) {
            const idx = store[table].findIndex(r => r.id === it.id);
            if (idx >= 0) {
              store[table][idx] = { ...store[table][idx], ...it };
              upserted.push(store[table][idx]);
            } else {
              const row = {
                id: it.id || `mock-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                created_at: new Date().toISOString(),
                ...it,
              };
              store[table].push(row);
              upserted.push(row);
            }
          }
          return {
            select: () => ({
              single: async () => ({ data: upserted[0], error: null }),
              maybeSingle: async () => ({ data: upserted[0], error: null }),
            }),
            single: async () => ({ data: upserted[0], error: null }),
            then: (resolve: any) => resolve({ data: upserted, error: null }),
          };
        },
        update: (updates: any) => {
          const updateBuilder: any = {
            eq: (col: string, val: any) => {
              filters.push((r: any) => r[col] === val);
              for (const row of store[table]) {
                if (filters.every(f => f(row))) {
                  Object.assign(row, updates);
                }
              }
              return updateBuilder;
            },
            select: () => ({
              single: async () => ({ data: store[table].find(r => filters.every(f => f(r))), error: null }),
              then: (resolve: any) => resolve({ data: store[table].filter(r => filters.every(f => f(r))), error: null }),
            }),
            then: (resolve: any) => resolve({ data: store[table].filter(r => filters.every(f => f(r))), error: null }),
          };
          return updateBuilder;
        },
      };

      return builder;
    },
    rpc: async (fnName: string, params: any) => {
      if (fnName === 'post_journal_entry') {
        const { p_user_id, p_transaction_date, p_description, p_source_type, p_idempotency_key, p_lines } = params;

        const existing = store.journal_entries.find(
          e => e.user_id === p_user_id && e.idempotency_key === p_idempotency_key
        );
        if (existing) return { data: existing.id, error: null };

        const lines: any[] = typeof p_lines === 'string' ? JSON.parse(p_lines) : p_lines;
        let totalDr = new Decimal(0);
        let totalCr = new Decimal(0);

        for (const l of lines) {
          totalDr = totalDr.plus(new Decimal(l.debit_amount || 0));
          totalCr = totalCr.plus(new Decimal(l.credit_amount || 0));
        }

        if (!totalDr.equals(totalCr)) {
          return { data: null, error: { message: `Trial Balance Violation: Dr(${totalDr}) != Cr(${totalCr})` } };
        }

        const entryId = `je-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const entry = {
          id: entryId,
          user_id: p_user_id,
          transaction_date: p_transaction_date,
          description: p_description,
          source_type: p_source_type,
          idempotency_key: p_idempotency_key,
          status: 'posted',
          created_at: new Date().toISOString(),
        };
        store.journal_entries.push(entry);

        for (const l of lines) {
          store.journal_lines.push({
            id: `jl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            journal_entry_id: entryId,
            ledger_account_id: l.ledger_account_id,
            user_id: p_user_id,
            debit_amount: l.debit_amount,
            credit_amount: l.credit_amount,
            memo: l.memo,
            created_at: new Date().toISOString(),
          });
        }

        return { data: entryId, error: null };
      }

      if (fnName === 'post_reversal_entry' || fnName === 'reverse_journal_entry') {
        const p_user_id = params.p_user_id;
        const p_original_entry_id = params.p_original_entry_id;
        const p_reason = params.p_reason || params.p_reversal_reason;
        const p_idempotency_key = params.p_idempotency_key;
        const orig = store.journal_entries.find(e => e.id === p_original_entry_id && e.user_id === p_user_id);
        if (!orig) return { data: null, error: { message: 'Original entry not found' } };
        if (orig.status === 'reversed') return { data: null, error: { message: 'Entry already reversed' } };

        orig.status = 'reversed';
        const origLines = store.journal_lines.filter(l => l.journal_entry_id === p_original_entry_id);

        const revEntryId = `je-rev-${Date.now()}`;
        store.journal_entries.push({
          id: revEntryId,
          user_id: p_user_id,
          transaction_date: new Date().toISOString().split('T')[0],
          description: `Reversal of [${orig.description}]: ${p_reason}`,
          source_type: 'reversal',
          idempotency_key: p_idempotency_key,
          status: 'posted',
          created_at: new Date().toISOString(),
        });

        for (const ol of origLines) {
          store.journal_lines.push({
            id: `jl-rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            journal_entry_id: revEntryId,
            ledger_account_id: ol.ledger_account_id,
            user_id: p_user_id,
            debit_amount: ol.credit_amount,
            credit_amount: ol.debit_amount,
            memo: `Reversal: ${ol.memo || ''}`,
            created_at: new Date().toISOString(),
          });
        }

        return { data: revEntryId, error: null };
      }

      return { data: null, error: { message: `Unknown RPC function: ${fnName}` } };
    },
  };

  return client;
}

test('1. Receivables Authority: Page total equals People Ledger total', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-sbi', user_id: userId, name: 'SBI', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [
      { id: 'cp-alice', user_id: userId, name: 'Alice' },
      { id: 'cp-bob', user_id: userId, name: 'Bob' },
    ],
  });

  // Provision ledger accounts
  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-sbi', name: 'SBI Bank', account_type: 'asset', entity_type: 'account', entity_id: 'acc-sbi' },
  ]);

  // Initial cash
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'income',
    accountId: 'acc-sbi',
    amount: '100000.00',
    date: '2026-08-01',
    description: 'Initial funds',
  });

  // Lend ₹30,000 to Alice, ₹20,000 to Bob
  await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-alice',
    counterpartyName: 'Alice',
    accountId: 'acc-sbi',
    amount: '30000.00',
    date: '2026-08-02',
  });

  await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-bob',
    counterpartyName: 'Bob',
    accountId: 'acc-sbi',
    amount: '20000.00',
    date: '2026-08-03',
  });

  // Bob repays ₹5,000
  await recordRepayment(supabase, {
    userId,
    counterpartyId: 'cp-bob',
    accountId: 'acc-sbi',
    amount: '5000.00',
    direction: 'in',
    date: '2026-08-10',
  });

  const peopleSummary = await getPeopleAuthoritativeSummary(supabase, userId);
  assert.equal(peopleSummary.totalReceivable, 45000); // 30,000 + 15,000 = 45,000

  const aliceBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-alice');
  assert.equal(aliceBal.receivableBalance, 30000);

  const bobBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-bob');
  assert.equal(bobBal.receivableBalance, 15000);
});

test('2. Payables Authority: Page total equals People Ledger total', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-icici', user_id: userId, name: 'ICICI', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [
      { id: 'cp-charlie', user_id: userId, name: 'Charlie' },
      { id: 'cp-david', user_id: userId, name: 'David' },
    ],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-icici', name: 'ICICI Bank', account_type: 'asset', entity_type: 'account', entity_id: 'acc-icici' },
  ]);

  // Borrow ₹40,000 from Charlie, ₹25,000 from David
  await recordBorrowing(supabase, {
    userId,
    counterpartyId: 'cp-charlie',
    counterpartyName: 'Charlie',
    accountId: 'acc-icici',
    amount: '40000.00',
    date: '2026-08-01',
  });

  await recordBorrowing(supabase, {
    userId,
    counterpartyId: 'cp-david',
    counterpartyName: 'David',
    accountId: 'acc-icici',
    amount: '25000.00',
    date: '2026-08-02',
  });

  // Repay ₹10,000 to Charlie
  await recordRepayment(supabase, {
    userId,
    counterpartyId: 'cp-charlie',
    accountId: 'acc-icici',
    amount: '10000.00',
    direction: 'out',
    date: '2026-08-08',
  });

  const peopleSummary = await getPeopleAuthoritativeSummary(supabase, userId);
  assert.equal(peopleSummary.totalPayable, 55000); // 30,000 + 25,000 = 55,000

  const charlieBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-charlie');
  assert.equal(charlieBal.payableBalance, 30000);

  const davidBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-david');
  assert.equal(davidBal.payableBalance, 25000);
});

test('3. Stale/Deleted Receivables Projection: Survives projection deletion', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-eve', user_id: userId, name: 'Eve' }],
    receivables: [
      { id: 'rec-stale', user_id: userId, counterparty_id: 'cp-eve', amount: 999999, remaining_amount: 999999, status: 'pending' },
    ],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  // Actual ledger transaction: Lend ₹12,000
  await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-eve',
    counterpartyName: 'Eve',
    accountId: 'acc-bank',
    amount: '12000.00',
    date: '2026-08-01',
  });

  // Corrupt / Delete the legacy table
  supabase._store.receivables = [];

  const eveBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-eve');
  assert.equal(eveBal.receivableBalance, 12000);

  const summary = await getPeopleAuthoritativeSummary(supabase, userId);
  assert.equal(summary.totalReceivable, 12000);
});

test('4. Stale/Deleted Payables Projection: Survives projection deletion', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-frank', user_id: userId, name: 'Frank' }],
    payables: [
      { id: 'pay-stale', user_id: userId, counterparty_id: 'cp-frank', amount: 777777, remaining_amount: 777777, status: 'pending' },
    ],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  // Actual ledger transaction: Borrow ₹18,000
  await recordBorrowing(supabase, {
    userId,
    counterpartyId: 'cp-frank',
    counterpartyName: 'Frank',
    accountId: 'acc-bank',
    amount: '18000.00',
    date: '2026-08-01',
  });

  // Corrupt / Delete the legacy table
  supabase._store.payables = [];

  const frankBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-frank');
  assert.equal(frankBal.payableBalance, 18000);

  const summary = await getPeopleAuthoritativeSummary(supabase, userId);
  assert.equal(summary.totalPayable, 18000);
});

test('5. Repayment Authority: Full repayment produces exactly ₹0.00', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-grace', user_id: userId, name: 'Grace' }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  // Lend ₹10,000
  await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-grace',
    counterpartyName: 'Grace',
    accountId: 'acc-bank',
    amount: '10000.00',
    date: '2026-08-01',
  });

  // Partial repayment ₹4,000
  await recordRepayment(supabase, {
    userId,
    counterpartyId: 'cp-grace',
    accountId: 'acc-bank',
    amount: '4000.00',
    direction: 'in',
    date: '2026-08-05',
  });

  let graceBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-grace');
  assert.equal(graceBal.receivableBalance, 6000);

  // Full settlement ₹6,000
  await recordRepayment(supabase, {
    userId,
    counterpartyId: 'cp-grace',
    accountId: 'acc-bank',
    amount: '6000.00',
    direction: 'in',
    date: '2026-08-10',
  });

  graceBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-grace');
  assert.equal(graceBal.receivableBalance, 0);
  assert.equal(graceBal.direction, 'SETTLED');
});

test('6. Reversals: Reversed lending/borrowing is excluded from balances', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-helen', user_id: userId, name: 'Helen' }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  // Lend ₹15,000
  const lendRes = await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-helen',
    counterpartyName: 'Helen',
    accountId: 'acc-bank',
    amount: '15000.00',
    date: '2026-08-01',
  });

  let helenBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-helen');
  assert.equal(helenBal.receivableBalance, 15000);

  // Reverse the lending entry
  await reverseFinancialTransaction(supabase, {
    userId,
    journalEntryId: (lendRes as any).journalEntryId,
    reason: 'Duplicate entry',
    idempotencyKey: `REV:${(lendRes as any).journalEntryId}`,
  });

  helenBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-helen');
  assert.equal(helenBal.receivableBalance, 0);
});

test('7. Bill Splitter: Authoritatively records user share and participant debts', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [
      { id: 'cp-p1', user_id: userId, name: 'Rohan' },
      { id: 'cp-p2', user_id: userId, name: 'Sameer' },
    ],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  // Initial funds: ₹10,000
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'income',
    accountId: 'acc-bank',
    amount: '10000.00',
    date: '2026-08-01',
    description: 'Initial Deposit',
  });

  // Total Bill: ₹3,000 (User Share: ₹1,000; Rohan: ₹1,000; Sameer: ₹1,000)
  // 1. Post user expense share
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'expense',
    accountId: 'acc-bank',
    amount: '1000.00',
    date: '2026-08-05',
    description: 'Bill Split (My Share): Team Lunch',
  });

  // 2. Post lending to Rohan and Sameer
  await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-p1',
    counterpartyName: 'Rohan',
    accountId: 'acc-bank',
    amount: '1000.00',
    date: '2026-08-05',
    description: 'Bill Split (Rohan): Team Lunch',
  });

  await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-p2',
    counterpartyName: 'Sameer',
    accountId: 'acc-bank',
    amount: '1000.00',
    date: '2026-08-05',
    description: 'Bill Split (Sameer): Team Lunch',
  });

  // Verify People Ledger Summary
  const summary = await getPeopleAuthoritativeSummary(supabase, userId);
  assert.equal(summary.totalReceivable, 2000); // Rohan (1k) + Sameer (1k)

  const rohanBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-p1');
  assert.equal(rohanBal.receivableBalance, 1000);

  const sameerBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-p2');
  assert.equal(sameerBal.receivableBalance, 1000);
});

test('8. Deterministic Idempotency: Retrying lending or borrowing produces exactly 1 entry', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-ivan', user_id: userId, name: 'Ivan' }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  // First lending call
  const res1 = await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-ivan',
    counterpartyName: 'Ivan',
    accountId: 'acc-bank',
    amount: '8000.00',
    date: '2026-08-01',
    receivableId: 'rec-ivan-001',
  });

  // Retry with same receivable ID
  const res2 = await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-ivan',
    counterpartyName: 'Ivan',
    accountId: 'acc-bank',
    amount: '8000.00',
    date: '2026-08-01',
    receivableId: 'rec-ivan-001',
  });

  assert.equal((res1 as any).journalEntryId, (res2 as any).journalEntryId);

  const ivanBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-ivan');
  assert.equal(ivanBal.receivableBalance, 8000); // NOT 16,000
});

test('9. Cross-User Security: User A cannot post lending/borrowing for User B counterparty', async () => {
  const userA = 'user-a';
  const userB = 'user-b';
  const supabase = createMockSupabase({
    userId: userA,
    accounts: [{ id: 'acc-a', user_id: userA, name: 'Bank A', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-b', user_id: userB, name: 'Target B' }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userA, code: 'AST-ACC-acc-a', name: 'Bank Asset A', account_type: 'asset', entity_type: 'account', entity_id: 'acc-a' },
  ]);

  const res = await recordLending(supabase, {
    userId: userA,
    counterpartyId: 'cp-b',
    accountId: 'acc-a',
    amount: '5000.00',
    date: '2026-08-01',
  });

  assert.equal(res.success, false);
});

test('10. Paise Precision: Rejects fractional amounts beyond 2 decimal places', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-karen', user_id: userId, name: 'Karen' }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  const res = await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-karen',
    counterpartyName: 'Karen',
    accountId: 'acc-bank',
    amount: '100.555',
    date: '2026-08-01',
  });

  assert.equal(res.success, false);
  assert.match((res as any).error, /precision/i);
});
