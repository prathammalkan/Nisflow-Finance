import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  getPeopleAuthoritativeSummary,
  getCounterpartyAuthoritativeBalance,
  recordLending,
  recordBorrowing,
} from '../src/lib/ledger/people.ts';
import {
  getLoansAuthoritativeSummary,
  getLoanAuthoritativeBalance,
  recordLoanDisbursement,
  recordLoanEMI,
} from '../src/lib/ledger/loans.ts';
import {
  resolveAccount,
  resolveCounterparty,
  resolveLoan,
} from '../src/lib/ai/entity-resolution.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// =========================================================================
// MOCK SUPABASE ENGINE FOR P3 HARDENING VERIFICATION
// =========================================================================
function createMockSupabase(initialState: {
  userId?: string;
  counterparties?: any[];
  ledgerAccounts?: any[];
  journalEntries?: any[];
  journalLines?: any[];
  accounts?: any[];
  loans?: any[];
} = {}) {
  const defaultUserId = initialState.userId || 'user-uuid-1';
  const state = {
    counterparties: [...(initialState.counterparties || [])],
    ledgerAccounts: [...(initialState.ledgerAccounts || [])],
    journalEntries: [...(initialState.journalEntries || [])],
    journalLines: [...(initialState.journalLines || [])],
    accounts: [...(initialState.accounts || [])],
    loans: [...(initialState.loans || [])],
  };

  const client: any = {
    _state: state,
    auth: {
      getUser: async () => ({ data: { user: { id: defaultUserId } }, error: null }),
    },
    from: (tableName: string) => {
      let currentTable = (state as any)[
        tableName === 'ledger_accounts' ? 'ledgerAccounts' :
        tableName === 'journal_entries' ? 'journalEntries' :
        tableName === 'journal_lines' ? 'journalLines' :
        tableName
      ] || [];

      let filters: Array<(row: any) => boolean> = [];
      let orderByField: string | null = null;
      let orderAscending = true;

      const getNested = (obj: any, propPath: string) => {
        if (!propPath.includes('.')) return obj?.[propPath];
        return propPath.split('.').reduce((acc, part) => acc?.[part], obj);
      };

      const builder: any = {
        select: (cols?: string) => builder,
        eq: (col: string, val: any) => {
          filters.push((r: any) => getNested(r, col) === val);
          return builder;
        },
        in: (col: string, vals: any[]) => {
          filters.push((r: any) => {
            if (Array.isArray(vals)) return vals.includes(getNested(r, col));
            return true;
          });
          return builder;
        },
        ilike: (col: string, val: any) => {
          const lowerVal = String(val).toLowerCase().replace(/%/g, '');
          filters.push((r: any) => String(getNested(r, col) || '').toLowerCase().includes(lowerVal));
          return builder;
        },
        limit: (n: number) => builder,
        order: (field: string, opts?: { ascending?: boolean }) => {
          orderByField = field;
          orderAscending = opts?.ascending ?? true;
          return builder;
        },
        maybeSingle: async () => {
          const row = currentTable.find(r => filters.every(f => f(r)));
          return { data: row || null, error: null };
        },
        single: async () => {
          const row = currentTable.find(r => filters.every(f => f(r)));
          if (!row) return { data: null, error: { message: 'Row not found' } };
          return { data: row, error: null };
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
            currentTable.push(row);
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
            const idx = currentTable.findIndex(r => r.id === it.id);
            if (idx !== -1) Object.assign(currentTable[idx], it);
            else currentTable.push(it);
          }
          return {
            then: (resolve: any) => resolve({ data: items, error: null }),
          };
        },
        update: (updates: any) => {
          const updateBuilder: any = {
            eq: (col: string, val: any) => {
              filters.push((r: any) => r[col] === val);
              for (const row of currentTable) {
                if (filters.every(f => f(row))) {
                  Object.assign(row, updates);
                }
              }
              return updateBuilder;
            },
            then: (resolve: any) => resolve({ data: currentTable.filter(r => filters.every(f => f(r))), error: null }),
          };
          return updateBuilder;
        },
        delete: () => ({
          eq: (col: string, val: any) => {
            const idx = currentTable.findIndex(r => r[col] === val);
            if (idx !== -1) currentTable.splice(idx, 1);
            return Promise.resolve({ error: null });
          },
        }),
        then: (resolve: any, reject: any) => {
          let rows = currentTable;
          if (tableName === 'journal_lines') {
            rows = rows.map(l => {
              const entry = state.journalEntries.find(e => e.id === l.journal_entry_id);
              return { ...l, journal_entries: entry || { status: 'posted', entry_number: 1, source_type: 'manual' } };
            });
          }
          rows = rows.filter(r => filters.every(f => f(r)));
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };

      return builder;
    },
    rpc: async (fnName: string, params: any) => {
      if (fnName === 'post_journal_entry') {
        const { p_user_id, p_transaction_date, p_description, p_source_type, p_idempotency_key, p_lines } = params;

        const existing = state.journalEntries.find(
          e => e.user_id === p_user_id && e.idempotency_key === p_idempotency_key
        );
        if (existing) return { data: existing.id, error: null };

        const entryId = `je-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        const entry = {
          id: entryId,
          user_id: p_user_id,
          entry_number: state.journalEntries.length + 1,
          transaction_date: p_transaction_date,
          description: p_description,
          source_type: p_source_type,
          idempotency_key: p_idempotency_key,
          status: 'posted',
          created_at: new Date().toISOString(),
        };
        state.journalEntries.push(entry);

        const lines: any[] = typeof p_lines === 'string' ? JSON.parse(p_lines) : p_lines;
        for (const l of lines) {
          state.journalLines.push({
            id: `jl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            journal_entry_id: entryId,
            ledger_account_id: l.ledger_account_id,
            user_id: p_user_id,
            debit_amount: Number(l.debit_amount || 0),
            credit_amount: Number(l.credit_amount || 0),
            memo: l.memo,
            created_at: new Date().toISOString(),
          });
        }

        return { data: entryId, error: null };
      }

      return { data: null, error: { message: `Unknown RPC ${fnName}` } };
    },
  };

  return client;
}

// =========================================================================
// TASK 1: AI-02 PROMPT-INJECTION DEFENSE
// =========================================================================

test('AI-02 [1.1]: Chat route system prompt encloses live financial context in <user_financial_data> boundary tags', () => {
  const chatRouteSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/chat/route.ts'),
    'utf-8'
  );

  assert.ok(
    chatRouteSrc.includes('<user_financial_data>'),
    'System prompt must include opening <user_financial_data> boundary tag'
  );
  assert.ok(
    chatRouteSrc.includes('</user_financial_data>'),
    'System prompt must include closing </user_financial_data> boundary tag'
  );
  assert.ok(
    chatRouteSrc.includes('SECURITY & UNTRUSTED DATA BOUNDARY') || chatRouteSrc.includes('SECURITY MANDATE'),
    'System prompt must contain explicit security mandate instructing model not to execute commands from user data'
  );
});

test('AI-02 [1.2]: AI Insights route encloses transactions in <user_financial_data> boundary tags', () => {
  const insightsRouteSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/ai/insights/route.ts'),
    'utf-8'
  );

  assert.ok(
    insightsRouteSrc.includes('<user_financial_data>') && insightsRouteSrc.includes('</user_financial_data>'),
    'Insights prompt must enclose transaction data in <user_financial_data> tags'
  );
  assert.ok(
    insightsRouteSrc.includes('SECURITY MANDATE'),
    'Insights system prompt must contain security mandate'
  );
});

// =========================================================================
// TASK 2: SEC-02 OPAQUE AI REFERENCES & NO RAW UUID EXPOSURE
// =========================================================================

test('SEC-02 [2.1]: Chat route does not expose raw database UUIDs in account list or people list', () => {
  const chatRouteSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/chat/route.ts'),
    'utf-8'
  );

  // In the accounts list mapping, ensure raw ID interpolation is removed
  assert.ok(
    !chatRouteSrc.includes('Balance: ₹${authBal.toFixed(2)}, ID: ${acc.id}'),
    'Account list format must NOT expose raw database UUIDs to the AI model'
  );

  // In the people list mapping, ensure raw ID interpolation is removed
  assert.ok(
    !chatRouteSrc.includes('- ${p.name} (ID: ${p.id})'),
    'People list format must NOT expose raw database UUIDs to the AI model'
  );
});

test('SEC-02 [2.2]: Server-side entity resolution resolves accounts by name strictly scoped to auth.uid()', async () => {
  const supabase = createMockSupabase({
    userId: 'user-alice',
    accounts: [
      { id: 'acc-alice-salary', user_id: 'user-alice', name: 'HDFC Salary Account', type: 'bank', is_active: true, balance: 50000 },
      { id: 'acc-bob-salary', user_id: 'user-bob', name: 'HDFC Salary Account', type: 'bank', is_active: true, balance: 99999 },
    ],
  });

  // User Alice resolves by name
  const res = await resolveAccount(supabase, 'user-alice', { name: 'HDFC Salary Account' });
  assert.equal(res.status, 'RESOLVED');
  assert.equal(res.entity?.id, 'acc-alice-salary');
  assert.equal(res.entity?.user_id, 'user-alice');
});

test('SEC-02 [2.3]: Server-side entity resolution rejects cross-tenant UUID lookups (IDOR prevention)', async () => {
  const supabase = createMockSupabase({
    userId: 'user-alice',
    accounts: [
      { id: 'acc-bob-private', user_id: 'user-bob', name: 'Bob Secret Demat', type: 'investment', is_active: true, balance: 500000 },
    ],
  });

  // User Alice attempts to resolve Bob's account ID directly
  const res = await resolveAccount(supabase, 'user-alice', { id: 'acc-bob-private' });
  assert.equal(res.status, 'SECURITY_VIOLATION');
  assert.ok(res.error?.includes('Security Violation'));
});

test('SEC-02 [2.4]: Server-side entity resolution rejects non-existent or forged IDs safely', async () => {
  const supabase = createMockSupabase({
    userId: 'user-alice',
    accounts: [],
  });

  const res = await resolveAccount(supabase, 'user-alice', { id: 'forged-uuid-999' });
  assert.equal(res.status, 'NOT_FOUND');
});

// =========================================================================
// TASK 3: PERF-01 & PERF-02 BATCHED / CONCURRENT LEDGER LOOKUPS
// =========================================================================

test('PERF-01 [3.1]: getLoansAuthoritativeSummary produces accurate totals across multiple loans', async () => {
  const supabase = createMockSupabase({
    userId: 'user-1',
    loans: [
      { id: 'loan-1', user_id: 'user-1', name: 'Home Loan', principal_amount: 500000, loan_type: 'taken', status: 'active', is_deleted: false },
      { id: 'loan-2', user_id: 'user-1', name: 'Car Loan', principal_amount: 200000, loan_type: 'taken', status: 'active', is_deleted: false },
      { id: 'loan-deleted', user_id: 'user-1', name: 'Old Loan', principal_amount: 100000, status: 'deleted', is_deleted: true },
    ],
    accounts: [{ id: 'acc-bank', user_id: 'user-1', name: 'HDFC Bank', balance: 1000000 }],
  });

  // Disburse Loan 1: ₹500,000
  await recordLoanDisbursement(supabase, {
    userId: 'user-1',
    loanId: 'loan-1',
    accountId: 'acc-bank',
    amount: '500000.00',
    date: '2026-08-01',
  });

  // Disburse Loan 2: ₹200,000
  await recordLoanDisbursement(supabase, {
    userId: 'user-1',
    loanId: 'loan-2',
    accountId: 'acc-bank',
    amount: '200000.00',
    date: '2026-08-01',
  });

  // Pay EMI on Loan 1: ₹50,000 principal + ₹10,000 interest
  await recordLoanEMI(supabase, {
    userId: 'user-1',
    loanId: 'loan-1',
    accountId: 'acc-bank',
    principalAmount: '50000.00',
    interestAmount: '10000.00',
    date: '2026-08-15',
  });

  const summary = await getLoansAuthoritativeSummary(supabase, 'user-1');

  // Total Outstanding = (500k - 50k) + 200k = 650,000
  assert.equal(summary.totalOutstandingPrincipal, 650000);
  assert.equal(summary.totalInterestPaid, 10000);
  assert.equal(summary.activeLoansCount, 2);
  assert.equal(summary.loans.length, 2, 'Deleted loans must be excluded');
});

test('PERF-01 [3.2]: getLoansAuthoritativeSummary handles empty dataset gracefully', async () => {
  const supabase = createMockSupabase({
    userId: 'user-empty',
    loans: [],
  });

  const summary = await getLoansAuthoritativeSummary(supabase, 'user-empty');
  assert.equal(summary.totalOutstandingPrincipal, 0);
  assert.equal(summary.totalInterestPaid, 0);
  assert.equal(summary.activeLoansCount, 0);
  assert.equal(summary.loans.length, 0);
});

test('PERF-02 [3.3]: getPeopleAuthoritativeSummary produces accurate totals across multiple counterparties', async () => {
  const supabase = createMockSupabase({
    userId: 'user-1',
    counterparties: [
      { id: 'cp-amit', user_id: 'user-1', name: 'Amit' },
      { id: 'cp-sneha', user_id: 'user-1', name: 'Sneha' },
    ],
    accounts: [{ id: 'acc-bank', user_id: 'user-1', name: 'HDFC Bank', balance: 50000 }],
  });

  // Lend ₹5,000 to Amit
  await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-amit',
    accountId: 'acc-bank',
    amount: '5000.00',
    receivableId: 'rec-amit-1',
  });

  // Borrow ₹3,000 from Sneha
  await recordBorrowing(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-sneha',
    accountId: 'acc-bank',
    amount: '3000.00',
    payableId: 'pay-sneha-1',
  });

  const summary = await getPeopleAuthoritativeSummary(supabase, 'user-1');

  assert.equal(summary.totalReceivable, 5000);
  assert.equal(summary.totalPayable, 3000);
  assert.equal(summary.netPosition, 2000);
  assert.equal(summary.peopleCount, 2);
  assert.equal(summary.balances['cp-amit'].receivableBalance, 5000);
  assert.equal(summary.balances['cp-sneha'].payableBalance, 3000);
});

test('PERF-02 [3.4]: getPeopleAuthoritativeSummary handles empty counterparties gracefully', async () => {
  const supabase = createMockSupabase({
    userId: 'user-empty',
    counterparties: [],
  });

  const summary = await getPeopleAuthoritativeSummary(supabase, 'user-empty');
  assert.equal(summary.totalReceivable, 0);
  assert.equal(summary.totalPayable, 0);
  assert.equal(summary.netPosition, 0);
  assert.equal(summary.peopleCount, 0);
  assert.deepEqual(summary.balances, {});
});
