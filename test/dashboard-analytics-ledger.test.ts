import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import {
  getAuthoritativeDashboardStats,
  getAuthoritativeMonthlyTrend,
  getAuthoritativeSpendingByCategory,
  getAuthoritativeDailySpending,
} from '../src/lib/ledger/analytics.ts';
import {
  recordFinancialTransaction,
  reverseFinancialTransaction,
} from '../src/lib/ledger/service.ts';
import {
  recordLoanDisbursement,
  recordLoanEMI,
} from '../src/lib/ledger/loans.ts';
import {
  recordLending,
  recordBorrowing,
  recordRepayment,
} from '../src/lib/ledger/people.ts';

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
      getUser: async () => ({ data: { user: { id: defaultUserId } }, error: null }),
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
          filters.push((r: any) => r[col] !== val);
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
        ilike: () => builder,
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
          if (limitCount) {
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
          for (const it of items) {
            const idx = store[table].findIndex(r => r.id === it.id);
            if (idx >= 0) store[table][idx] = { ...store[table][idx], ...it };
            else store[table].push({ id: it.id || `mock-${Date.now()}`, ...it });
          }
          return {
            then: (resolve: any) => resolve({ error: null }),
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
            ilike: () => updateBuilder,
            select: () => ({
              single: async () => ({ data: store[table].find(r => filters.every(f => f(r))), error: null }),
            }),
            then: (resolve: any) => resolve({ data: store[table].filter(r => filters.every(f => f(r))), error: null }),
          };
          return updateBuilder;
        },
        delete: () => ({
          eq: (col: string, val: any) => {
            const idx = store[table].findIndex(r => r[col] === val);
            if (idx !== -1) store[table].splice(idx, 1);
            return Promise.resolve({ error: null });
          },
        }),
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

      if (fnName === 'post_reversal_entry') {
        const p_user_id = params.p_user_id;
        const p_original_entry_id = params.p_original_entry_id || params.p_original_journal_entry_id;

        const original = store.journal_entries.find(e => e.id === p_original_entry_id && e.user_id === p_user_id);
        if (!original) return { data: null, error: { message: 'Original entry not found' } };
        if (original.status === 'reversed') return { data: null, error: { message: 'Already reversed' } };

        original.status = 'reversed';
        return { data: `rev-${Date.now()}`, error: null };
      }

      return { data: null, error: { message: `Unknown RPC function ${fnName}` } };
    },
  };

  return client;
}

// ====================================================
// TEST SUITE: DASHBOARD & ANALYTICS LEDGER CUTOVER
// ====================================================

test('1. Dashboard Net Worth: Exactly equals ledger Assets - Liabilities', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: 'acc-hdfc', user_id: userId, name: 'HDFC Bank', type: 'bank', ownership: 'personal', is_active: true },
    ],
  });

  // Provision ledger accounts
  const bankAcc = (await (supabase.from('ledger_accounts') as any).insert({
    user_id: userId,
    code: 'AST-ACC-acc-hdfc',
    name: 'HDFC Bank Asset',
    account_type: 'asset',
    entity_type: 'account',
    entity_id: 'acc-hdfc',
  }).select().single()).data;

  const incomeAcc = (await (supabase.from('ledger_accounts') as any).insert({
    user_id: userId,
    code: 'INC-SALARY',
    name: 'Salary Income',
    account_type: 'income',
  }).select().single()).data;

  // Post income ₹100,000 (Dr Bank ₹100k, Cr Income ₹100k)
  const incomeRes = await recordFinancialTransaction(supabase, {
    userId,
    type: 'income',
    accountId: 'acc-hdfc',
    amount: '100000.00',
    date: '2026-08-01',
    description: 'Salary',
  });
  if (!incomeRes.success) {
    throw new Error(`Income failed: ${incomeRes.error}`);
  }

  // Create Loan ₹50,000 disbursed to bank
  await (supabase.from('loans') as any).insert({
    id: 'loan-001',
    user_id: userId,
    name: 'Personal Loan',
    principal_amount: 50000,
  });

  await recordLoanDisbursement(supabase, {
    userId,
    loanId: 'loan-001',
    accountId: 'acc-hdfc',
    amount: '50000.00',
    date: '2026-08-05',
  });

  // At this point:
  // Bank Balance = ₹150,000 (Assets)
  // Loan Liability = ₹50,000 (Liabilities)
  // Net Worth = ₹150,000 - ₹50,000 = ₹100,000
  let stats = await getAuthoritativeDashboardStats(supabase, userId, '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z');
  assert.equal(stats.personalNetWorth, 100000);
  assert.equal(stats.availablePersonalCash, 150000);
  assert.equal(stats.totalLoanLiabilities, 50000);
});

test('2. Receivables Authority: Uses People Ledger AST-REC balances', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-sbi', user_id: userId, name: 'SBI', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-rahul', user_id: userId, name: 'Rahul' }],
  });

  // Disburse ₹50,000 into bank first
  await (supabase.from('ledger_accounts') as any).insert({
    user_id: userId,
    code: 'AST-ACC-acc-sbi',
    name: 'SBI Asset',
    account_type: 'asset',
    entity_type: 'account',
    entity_id: 'acc-sbi',
  });
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'income',
    accountId: 'acc-sbi',
    amount: '50000.00',
    date: '2026-08-01',
    description: 'Initial funds',
  });

  // Lend ₹20,000 to Rahul
  await recordLending(supabase, {
    userId,
    counterpartyId: 'cp-rahul',
    counterpartyName: 'Rahul',
    accountId: 'acc-sbi',
    amount: '20000.00',
    date: '2026-08-02',
  });

  // Rahul repays ₹5,000
  await recordRepayment(supabase, {
    userId,
    counterpartyId: 'cp-rahul',
    accountId: 'acc-sbi',
    amount: '5000.00',
    direction: 'in',
    date: '2026-08-10',
  });

  const stats = await getAuthoritativeDashboardStats(supabase, userId, '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z');
  assert.equal(stats.totalReceivables, 15000);
  assert.equal(stats.availablePersonalCash, 35000); // 50,000 - 20,000 + 5,000
  assert.equal(stats.personalNetWorth, 50000); // Cash (35,000) + Receivable (15,000)
});

test('3. Payables Authority: Uses People Ledger LIA-PAY balances', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-icici', user_id: userId, name: 'ICICI', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-priya', user_id: userId, name: 'Priya' }],
  });

  await (supabase.from('ledger_accounts') as any).insert({
    user_id: userId,
    code: 'AST-ACC-acc-icici',
    name: 'ICICI Asset',
    account_type: 'asset',
    entity_type: 'account',
    entity_id: 'acc-icici',
  });

  // Borrow ₹30,000 from Priya
  await recordBorrowing(supabase, {
    userId,
    counterpartyId: 'cp-priya',
    counterpartyName: 'Priya',
    accountId: 'acc-icici',
    amount: '30000.00',
    date: '2026-08-01',
  });

  // Repay ₹10,000 to Priya
  await recordRepayment(supabase, {
    userId,
    counterpartyId: 'cp-priya',
    accountId: 'acc-icici',
    amount: '10000.00',
    direction: 'out',
    date: '2026-08-05',
  });

  const stats = await getAuthoritativeDashboardStats(supabase, userId, '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z');
  assert.equal(stats.totalPayables, 20000);
  assert.equal(stats.availablePersonalCash, 20000); // Borrowed 30k, repaid 10k
  assert.equal(stats.personalNetWorth, 0); // Cash (20k) - Payable (20k) = 0
});

test('4. Loan Liabilities: Uses LIA-LOAN ledger balances', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    loans: [{ id: 'loan-car', user_id: userId, name: 'Car Loan', principal_amount: 300000 }],
  });

  await (supabase.from('ledger_accounts') as any).insert({
    user_id: userId,
    code: 'AST-ACC-acc-bank',
    name: 'Bank Asset',
    account_type: 'asset',
    entity_type: 'account',
    entity_id: 'acc-bank',
  });

  // Disburse ₹300k
  await recordLoanDisbursement(supabase, {
    userId,
    loanId: 'loan-car',
    accountId: 'acc-bank',
    amount: '300000.00',
    date: '2026-08-01',
  });

  // Pay EMI: ₹25,000 principal + ₹3,000 interest
  await recordLoanEMI(supabase, {
    userId,
    loanId: 'loan-car',
    accountId: 'acc-bank',
    principalAmount: '25000.00',
    interestAmount: '3000.00',
    date: '2026-08-15',
  });

  const stats = await getAuthoritativeDashboardStats(supabase, userId, '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z');
  assert.equal(stats.totalLoanLiabilities, 275000);
  assert.equal(stats.availablePersonalCash, 272000); // 300k disbursed - 28k EMI
  assert.equal(stats.thisMonthExpenses, 3000); // Interest expense component
  assert.equal(stats.personalNetWorth, -3000); // Cash (272k) - Loan Liability (275k) = -3,000
});

test('5. Income & Expense Totals: Derived from posted journal entries', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  await (supabase.from('ledger_accounts') as any).insert({
    user_id: userId,
    code: 'AST-ACC-acc-bank',
    name: 'Bank Asset',
    account_type: 'asset',
    entity_type: 'account',
    entity_id: 'acc-bank',
  });

  // Post Income ₹80,000
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'income',
    accountId: 'acc-bank',
    amount: '80000.00',
    date: '2026-08-02',
    description: 'Consulting Fee',
  });

  // Post Expense ₹30,000
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'expense',
    accountId: 'acc-bank',
    amount: '30000.00',
    date: '2026-08-10',
    description: 'Office Rent',
  });

  const stats = await getAuthoritativeDashboardStats(supabase, userId, '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z');
  assert.equal(stats.thisMonthIncome, 80000);
  assert.equal(stats.thisMonthExpenses, 30000);
  assert.equal(stats.personalNetWorth, 50000);
});

test('6. Reversed-Entry Exclusion: Excluded from income, expense, and net worth', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  await (supabase.from('ledger_accounts') as any).insert({
    user_id: userId,
    code: 'AST-ACC-acc-bank',
    name: 'Bank Asset',
    account_type: 'asset',
    entity_type: 'account',
    entity_id: 'acc-bank',
  });

  const txRes = await recordFinancialTransaction(supabase, {
    userId,
    type: 'income',
    accountId: 'acc-bank',
    amount: '25000.00',
    date: '2026-08-01',
    description: 'Mistaken Income',
  });

  // Reverse it
  await reverseFinancialTransaction(supabase, {
    userId,
    journalEntryId: txRes.journalEntryId!,
    reason: 'Incorrect deposit entry',
  });

  const stats = await getAuthoritativeDashboardStats(supabase, userId, '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z');
  assert.equal(stats.thisMonthIncome, 0);
  assert.equal(stats.availablePersonalCash, 0);
  assert.equal(stats.personalNetWorth, 0);
});

test('7. Stale/Deleted Legacy Projections: Zero impact on dashboard/report totals', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', balance: 9999999, is_active: true }, // Corrupted legacy balance
    ],
    receivables: [
      { id: 'rec-1', user_id: userId, remaining_amount: 888888, status: 'active' }, // Corrupted legacy receivable
    ],
    payables: [
      { id: 'pay-1', user_id: userId, remaining_amount: 777777, status: 'active' }, // Corrupted legacy payable
    ],
  });

  await (supabase.from('ledger_accounts') as any).insert({
    user_id: userId,
    code: 'AST-ACC-acc-bank',
    name: 'Bank Asset',
    account_type: 'asset',
    entity_type: 'account',
    entity_id: 'acc-bank',
  });

  // Legitimate ledger transaction of ₹12,000
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'income',
    accountId: 'acc-bank',
    amount: '12000.00',
    date: '2026-08-01',
    description: 'Actual Income',
  });

  const stats = await getAuthoritativeDashboardStats(supabase, userId, '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z');
  assert.equal(stats.availablePersonalCash, 12000);
  assert.equal(stats.personalNetWorth, 12000);
  assert.equal(stats.totalReceivables, 0);
  assert.equal(stats.totalPayables, 0);
});

test('8. Cross-User Isolation: User B data does not affect User A dashboard', async () => {
  const userA = 'user-a';
  const userB = 'user-b';
  const supabase = createMockSupabase({
    userId: userA,
    accounts: [
      { id: 'acc-a', user_id: userA, name: 'User A Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: 'acc-b', user_id: userB, name: 'User B Bank', type: 'bank', ownership: 'personal', is_active: true },
    ],
  });

  // Provision accounts for A and B
  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userA, code: 'AST-ACC-acc-a', name: 'User A Bank', account_type: 'asset', entity_type: 'account', entity_id: 'acc-a' },
    { user_id: userB, code: 'AST-ACC-acc-b', name: 'User B Bank', account_type: 'asset', entity_type: 'account', entity_id: 'acc-b' },
  ]);

  // User A income ₹5,000
  await recordFinancialTransaction(supabase, {
    userId: userA,
    type: 'income',
    accountId: 'acc-a',
    amount: '5000.00',
    date: '2026-08-01',
    description: 'Income A',
  });

  // User B income ₹500,000
  await recordFinancialTransaction(supabase, {
    userId: userB,
    type: 'income',
    accountId: 'acc-b',
    amount: '500000.00',
    date: '2026-08-01',
    description: 'Income B',
  });

  const statsA = await getAuthoritativeDashboardStats(supabase, userA, '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z');
  assert.equal(statsA.personalNetWorth, 5000);
  assert.equal(statsA.availablePersonalCash, 5000);
  assert.equal(statsA.thisMonthIncome, 5000);
});

test('9. Investment Cashflow & Valuation: No double counting', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: 'acc-zerodha', user_id: userId, name: 'Zerodha', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
    { user_id: userId, code: 'AST-ACC-acc-zerodha', name: 'Zerodha Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-zerodha' },
  ]);

  // Initial cash: ₹100,000
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'income',
    accountId: 'acc-bank',
    amount: '100000.00',
    date: '2026-08-01',
    description: 'Initial Deposit',
  });

  // Buy shares worth ₹40,000 (Transfer: Dr Zerodha, Cr Bank)
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'transfer',
    accountId: 'acc-bank',
    toAccountId: 'acc-zerodha',
    amount: '40000.00',
    date: '2026-08-05',
    description: 'Buy Nifty 50 ETF',
  });

  const stats = await getAuthoritativeDashboardStats(supabase, userId, '2026-08-01T00:00:00Z', '2026-08-31T23:59:59Z');
  assert.equal(stats.availablePersonalCash, 60000); // 100k - 40k
  assert.equal(stats.totalInvestments, 40000); // 40k in Zerodha
  assert.equal(stats.personalNetWorth, 100000); // 60k cash + 40k investment = 100k (ZERO double counting)
});
