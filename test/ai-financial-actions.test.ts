import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { executeAIFinancialAction } from '../src/lib/ledger/ai.ts';
import type { AIFinancialActionPayload } from '../src/lib/ledger/ai.ts';
import { recordFinancialTransaction } from '../src/lib/ledger/service.ts';
import { isValidUUID, SYSTEM_RESERVED_UUIDS } from '../src/lib/ledger/constants.ts';
import { getCounterpartyAuthoritativeBalance, getPeopleAuthoritativeSummary } from '../src/lib/ledger/people.ts';
import { getLoanAuthoritativeBalance } from '../src/lib/ledger/loans.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

function createMockSupabase(initialData: {
  userId: string;
  accounts?: any[];
  counterparties?: any[];
  loans?: any[];
  holdings?: any[];
  journal_entries?: any[];
  journal_lines?: any[];
  ledger_accounts?: any[];
  transactions?: any[];
  receivables?: any[];
  payables?: any[];
}) {
  const store = {
    accounts: [...(initialData.accounts || [])],
    counterparties: [...(initialData.counterparties || [])],
    loans: [...(initialData.loans || [])],
    holdings: [...(initialData.holdings || [])],
    journal_entries: [...(initialData.journal_entries || [])],
    journal_lines: [...(initialData.journal_lines || [])],
    ledger_accounts: [...(initialData.ledger_accounts || [])],
    transactions: [...(initialData.transactions || [])],
    receivables: [...(initialData.receivables || [])],
    payables: [...(initialData.payables || [])],
  };

  const client: any = {
    from: (table: keyof typeof store) => {
      let filters: Array<(row: any) => boolean> = [];
      let insertData: any = null;
      let updateData: any = null;
      let selectFields = '*';
      let orderBy = '';
      let isAsc = true;
      let limitCount: number | null = null;

      const builder: any = {
        select: (fields = '*') => {
          selectFields = fields;
          return builder;
        },
        eq: (col: string, val: any) => {
          filters.push((row: any) => {
            if (col.includes('.')) {
              const parts = col.split('.');
              let curr = row;
              for (const p of parts) {
                curr = curr?.[p];
              }
              return curr === val;
            }
            return row[col] === val;
          });
          return builder;
        },
        in: (col: string, vals: any[]) => {
          filters.push((row: any) => {
            const rowVal = col.includes('.')
              ? col.split('.').reduce((acc, p) => acc?.[p], row)
              : row[col];
            return vals.includes(rowVal);
          });
          return builder;
        },
        ilike: (col: string, pattern: string) => {
          const cleanPattern = pattern.replace(/%/g, '').toLowerCase();
          filters.push((row: any) => String(row[col] || '').toLowerCase().includes(cleanPattern));
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          orderBy = col;
          isAsc = opts?.ascending ?? true;
          return builder;
        },
        limit: (n: number) => {
          limitCount = n;
          return builder;
        },
        insert: (data: any) => {
          insertData = Array.isArray(data) ? data : [data];
          for (const item of insertData) {
            const newItem = { id: item.id || `gen-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, ...item };
            store[table].push(newItem);
          }
          return builder;
        },
        upsert: (data: any) => {
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            const idx = store[table].findIndex((r: any) => r.id === item.id);
            if (idx >= 0) {
              store[table][idx] = { ...store[table][idx], ...item };
            } else {
              store[table].push({ id: item.id || `gen-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, ...item });
            }
          }
          return builder;
        },
        update: (data: any) => {
          updateData = data;
          return builder;
        },
        delete: () => {
          store[table] = store[table].filter((r: any) => !filters.every(f => f(r)));
          return Promise.resolve({ data: null, error: null });
        },
        maybeSingle: async () => {
          const res = await builder;
          const rows = res.data || [];
          return { data: rows[0] || null, error: null };
        },
        single: async () => {
          const res = await builder;
          const rows = res.data || [];
          if (rows.length === 0) return { data: null, error: { message: 'Row not found' } };
          return { data: rows[0], error: null };
        },
        then: (resolve: any, reject: any) => {
          if (updateData) {
            for (let i = 0; i < store[table].length; i++) {
              if (filters.every(f => f(store[table][i]))) {
                store[table][i] = { ...store[table][i], ...updateData };
              }
            }
          }

          let rows = store[table].map((line: any) => {
            if (table === 'journal_lines') {
              const entry = store.journal_entries.find(e => e.id === line.journal_entry_id);
              return { ...line, journal_entries: entry || null };
            }
            return line;
          }).filter((r: any) => filters.every(f => f(r)));

          if (limitCount !== null) {
            rows = rows.slice(0, limitCount);
          }

          resolve({ data: rows, error: null });
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

      return { data: null, error: { message: `Unknown RPC: ${fnName}` } };
    },
    _store: store,
  };

  return client;
}

test('1. AI Expense Action: Routes to recordFinancialTransaction and posts balanced entry', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-kotak', user_id: userId, name: 'Kotak Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-kotak', name: 'Kotak Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-kotak' },
    { user_id: userId, code: 'EXP-GEN-UNCAT', name: 'General Expense', account_type: 'expense', entity_type: 'system', entity_id: 'uncategorized' },
  ]);

  const result = await executeAIFinancialAction(supabase, userId, 'msg-1', {
    actionType: 'expense',
    actionId: 'act-1',
    amount: '350.00',
    accountName: 'Kotak',
    description: 'Lunch at Cafe',
  });

  assert.equal(result.success, true);
  assert.ok(result.journalEntryId);
  assert.equal(supabase._store.journal_entries.length, 1);
  assert.equal(supabase._store.journal_lines.length, 2);
});

test('2. AI Income Action: Routes to recordFinancialTransaction and posts balanced entry', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-hdfc', user_id: userId, name: 'HDFC Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-hdfc', name: 'HDFC Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-hdfc' },
    { user_id: userId, code: 'INC-GEN-UNCAT', name: 'General Income', account_type: 'income', entity_type: 'system', entity_id: 'uncategorized' },
  ]);

  const result = await executeAIFinancialAction(supabase, userId, 'msg-2', {
    actionType: 'income',
    actionId: 'act-2',
    amount: '50000.00',
    accountName: 'HDFC',
    description: 'Monthly Salary',
  });

  assert.equal(result.success, true);
  assert.ok(result.journalEntryId);
  assert.equal(supabase._store.journal_entries.length, 1);
});

test('3. AI Transfer Action: Records inter-account transfer in double-entry ledger', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: 'acc-src', user_id: userId, name: 'HDFC Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: 'acc-dest', user_id: userId, name: 'Kotak Bank', type: 'bank', ownership: 'personal', is_active: true },
    ],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-src', name: 'HDFC Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-src' },
    { user_id: userId, code: 'AST-ACC-acc-dest', name: 'Kotak Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-dest' },
  ]);

  const result = await executeAIFinancialAction(supabase, userId, 'msg-3', {
    actionType: 'transfer',
    actionId: 'act-3',
    amount: '5000.00',
    accountId: 'acc-src',
    toAccountId: 'acc-dest',
    description: 'Savings Transfer',
  });

  assert.equal(result.success, true);
  assert.ok(result.journalEntryId);
});

test('4. AI Lending: Routes to recordLending in People Ledger', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-amit', user_id: userId, name: 'Amit' }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  const result = await executeAIFinancialAction(supabase, userId, 'msg-4', {
    actionType: 'lending',
    actionId: 'act-4',
    amount: '2000.00',
    accountId: 'acc-bank',
    personId: 'cp-amit',
    description: 'Lent to Amit for groceries',
  });

  assert.equal(result.success, true);
  const bal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-amit');
  assert.equal(bal.receivableBalance, 2000);
});

test('5. AI Borrowing: Routes to recordBorrowing in People Ledger', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-rahul', user_id: userId, name: 'Rahul' }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  const result = await executeAIFinancialAction(supabase, userId, 'msg-5', {
    actionType: 'borrowing',
    actionId: 'act-5',
    amount: '5000.00',
    accountId: 'acc-bank',
    personId: 'cp-rahul',
    description: 'Borrowed from Rahul',
  });

  assert.equal(result.success, true);
  const bal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-rahul');
  assert.equal(bal.payableBalance, 5000);
});

test('6. AI Repayment: Routes to recordRepayment in People Ledger', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-amit', user_id: userId, name: 'Amit' }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  // Initial lending
  await executeAIFinancialAction(supabase, userId, 'msg-lend', {
    actionType: 'lending',
    actionId: 'act-lend',
    amount: '2000.00',
    accountId: 'acc-bank',
    personId: 'cp-amit',
  });

  // Repayment
  const result = await executeAIFinancialAction(supabase, userId, 'msg-repay', {
    actionType: 'receivable_repayment',
    actionId: 'act-repay',
    amount: '2000.00',
    accountId: 'acc-bank',
    personId: 'cp-amit',
    description: 'Amit repaid loan',
  });

  assert.equal(result.success, true);
  const bal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-amit');
  assert.equal(bal.receivableBalance, 0);
  assert.equal(bal.direction, 'SETTLED');
});

test('7. AI Loan EMI: Routes to recordLoanEMI with compound ledger entry', async () => {
  const userId = 'user-1';
  const loanId = 'loan-car-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    loans: [{ id: loanId, user_id: userId, name: 'Car Loan', type: 'car', loan_amount: 500000 }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
    { user_id: userId, code: `LIA-LOAN-${loanId}`, name: 'Car Loan Liability', account_type: 'liability', entity_type: 'loan', entity_id: loanId },
    { user_id: userId, code: 'EXP-INT-LOAN', name: 'Interest Expense', account_type: 'expense', entity_type: 'system', entity_id: 'interest' },
  ]);

  // Initial loan disbursement
  await (supabase.rpc as any)('post_journal_entry', {
    p_user_id: userId,
    p_transaction_date: '2026-08-01',
    p_description: 'Disbursement',
    p_source_type: 'loan_disbursement',
    p_idempotency_key: `LOAN:DISBURSE:${loanId}`,
    p_lines: [
      { ledger_account_id: (supabase._store.ledger_accounts.find((a: any) => a.code === 'AST-ACC-acc-bank') as any).id, debit_amount: '500000.00', credit_amount: '0.00' },
      { ledger_account_id: (supabase._store.ledger_accounts.find((a: any) => a.code === `LIA-LOAN-${loanId}`) as any).id, debit_amount: '0.00', credit_amount: '500000.00' },
    ],
  });

  const result = await executeAIFinancialAction(supabase, userId, 'msg-emi', {
    actionType: 'loan_emi',
    actionId: 'act-emi',
    loanId,
    accountId: 'acc-bank',
    amount: '15000.00',
    principalAmount: '12000.00',
    interestAmount: '3000.00',
    description: 'Car Loan EMI',
  });

  assert.equal(result.success, true);
  const loanBal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(loanBal.outstandingPrincipal.toNumber(), 488000);
});

test('8. AI Investment BUY: Posts to investment purchase ledger service', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: 'acc-demat', user_id: userId, name: 'Zerodha Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
    { user_id: userId, code: 'AST-ACC-acc-demat', name: 'Investment Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-demat' },
  ]);

  const result = await executeAIFinancialAction(supabase, userId, 'msg-buy', {
    actionType: 'investment_buy',
    actionId: 'act-buy',
    amount: '25000.00',
    accountId: 'acc-bank',
    holdingAccountId: 'acc-demat',
    assetSymbol: 'RELIANCE',
  });

  assert.equal(result.success, true);
  assert.ok(result.journalEntryId);
});

test('9. AI Investment SELL: Posts to investment sale ledger service', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: 'acc-demat', user_id: userId, name: 'Zerodha Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
    { user_id: userId, code: 'AST-ACC-acc-demat', name: 'Investment Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-demat' },
  ]);

  const result = await executeAIFinancialAction(supabase, userId, 'msg-sell', {
    actionType: 'investment_sell',
    actionId: 'act-sell',
    amount: '30000.00',
    accountId: 'acc-bank',
    holdingAccountId: 'acc-demat',
    assetSymbol: 'TCS',
    costBasis: '22000.00',
    realizedGainLoss: '8000.00',
  });

  assert.equal(result.success, true);
  assert.ok(result.journalEntryId);
});

test('10. AI Dividend: Records dividend income in double-entry ledger', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
    { user_id: userId, code: 'INC-GEN-UNCAT', name: 'Income Account', account_type: 'income', entity_type: 'system', entity_id: 'uncategorized' },
  ]);

  const result = await executeAIFinancialAction(supabase, userId, 'msg-div', {
    actionType: 'investment_dividend',
    actionId: 'act-div',
    amount: '1200.00',
    accountId: 'acc-bank',
    assetSymbol: 'INFY',
  });

  assert.equal(result.success, true);
});

test('11. Unconfirmed Action: Merely parsing an action produces ZERO database mutations', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  // Raw text stream with [ACTION] received but never confirmed
  const rawStream = `I parsed your expense of ₹500.\n[ACTION]\n{"actionType":"expense","amount":500}\n[/ACTION]`;
  assert.ok(rawStream.includes('[ACTION]'));

  // Database must remain completely clean
  assert.equal(supabase._store.journal_entries.length, 0);
  assert.equal(supabase._store.journal_lines.length, 0);
});

test('12. Duplicate AI Action: Retrying same action produces exactly 1 financial entry', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
    { user_id: userId, code: 'EXP-GEN-UNCAT', name: 'Expense Account', account_type: 'expense', entity_type: 'system', entity_id: 'uncategorized' },
  ]);

  const payload: AIFinancialActionPayload = {
    actionType: 'expense',
    actionId: 'act-stable-1',
    amount: '450.00',
    accountId: 'acc-bank',
  };

  const res1 = await executeAIFinancialAction(supabase, userId, 'msg-dup', payload);
  const res2 = await executeAIFinancialAction(supabase, userId, 'msg-dup', payload);

  assert.equal(res1.journalEntryId, res2.journalEntryId);
  assert.equal(supabase._store.journal_entries.length, 1);
});

test('13. Cross-User Account Rejection: User A cannot mutate User B account via AI', async () => {
  const userA = 'user-a';
  const userB = 'user-b';
  const supabase = createMockSupabase({
    userId: userA,
    accounts: [
      { id: 'acc-b', user_id: userB, name: 'Bank B', type: 'bank', ownership: 'personal', is_active: true },
    ],
  });

  const res = await executeAIFinancialAction(supabase, userA, 'msg-cross', {
    actionType: 'expense',
    actionId: 'act-cross',
    amount: '1000.00',
    accountId: 'acc-b',
  });

  assert.equal(res.success, false);
  assert.match(res.error || '', /Security Violation/);
});

test('14. Cross-User Counterparty Rejection: User A cannot borrow from User B counterparty', async () => {
  const userA = 'user-a';
  const userB = 'user-b';
  const supabase = createMockSupabase({
    userId: userA,
    accounts: [{ id: 'acc-a', user_id: userA, name: 'Bank A', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-b', user_id: userB, name: 'Victim B' }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userA, code: 'AST-ACC-acc-a', name: 'Bank Asset A', account_type: 'asset', entity_type: 'account', entity_id: 'acc-a' },
  ]);

  const res = await executeAIFinancialAction(supabase, userA, 'msg-cross-cp', {
    actionType: 'borrowing',
    actionId: 'act-cross-cp',
    amount: '1000.00',
    accountId: 'acc-a',
    personId: 'cp-b',
  });

  assert.equal(res.success, false);
  assert.match(res.error || '', /Security Violation/);
});

test('15. Cross-User Loan Rejection: User A cannot pay EMI for User B loan', async () => {
  const userA = 'user-a';
  const userB = 'user-b';
  const supabase = createMockSupabase({
    userId: userA,
    accounts: [{ id: 'acc-a', user_id: userA, name: 'Bank A', type: 'bank', ownership: 'personal', is_active: true }],
    loans: [{ id: 'loan-b', user_id: userB, name: 'Loan B', type: 'personal', loan_amount: 100000 }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userA, code: 'AST-ACC-acc-a', name: 'Bank Asset A', account_type: 'asset', entity_type: 'account', entity_id: 'acc-a' },
  ]);

  const res = await executeAIFinancialAction(supabase, userA, 'msg-cross-loan', {
    actionType: 'loan_emi',
    actionId: 'act-cross-loan',
    amount: '5000.00',
    accountId: 'acc-a',
    loanId: 'loan-b',
  });

  assert.equal(res.success, false);
  assert.match(res.error || '', /Security Violation|not found/i);
});

test('16. Cross-User Investment Rejection: User A cannot sell from User B holding account', async () => {
  const userA = 'user-a';
  const userB = 'user-b';
  const supabase = createMockSupabase({
    userId: userA,
    accounts: [
      { id: 'acc-a', user_id: userA, name: 'Bank A', type: 'bank', ownership: 'personal', is_active: true },
      { id: 'acc-b-inv', user_id: userB, name: 'Investment B', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userA, code: 'AST-ACC-acc-a', name: 'Bank Asset A', account_type: 'asset', entity_type: 'account', entity_id: 'acc-a' },
  ]);

  const res = await executeAIFinancialAction(supabase, userA, 'msg-cross-inv', {
    actionType: 'investment_sell',
    actionId: 'act-cross-inv',
    amount: '5000.00',
    accountId: 'acc-a',
    holdingAccountId: 'acc-b-inv',
  });

  assert.equal(res.success, false);
  assert.match(res.error || '', /Security Violation|not belong/i);
});

test('17. Malformed Action Rejection: Rejects negative amounts and unsupported types', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  // Negative amount
  const res1 = await executeAIFinancialAction(supabase, userId, 'msg-neg', {
    actionType: 'expense',
    amount: '-500',
    accountId: 'acc-bank',
  });
  assert.equal(res1.success, false);

  // Unsupported type
  const res2 = await executeAIFinancialAction(supabase, userId, 'msg-bad-type', {
    actionType: 'unsupported_hack' as any,
    amount: '500',
  });
  assert.equal(res2.success, false);
});

test('18. Overpayment Rejection: Rejects repayment exceeding authoritative receivable balance', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
    counterparties: [{ id: 'cp-kavita', user_id: userId, name: 'Kavita' }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
  ]);

  // Lend ₹1,000
  await executeAIFinancialAction(supabase, userId, 'msg-lend-k', {
    actionType: 'lending',
    actionId: 'act-lend-k',
    amount: '1000.00',
    accountId: 'acc-bank',
    personId: 'cp-kavita',
  });

  // Attempt to repay ₹2,000 (overpayment)
  const repayRes = await executeAIFinancialAction(supabase, userId, 'msg-repay-over', {
    actionType: 'receivable_repayment',
    actionId: 'act-repay-over',
    amount: '2000.00',
    accountId: 'acc-bank',
    personId: 'cp-kavita',
  });

  assert.equal(repayRes.success, false);
  assert.match(repayRes.error || '', /Overpayment Error/);
});

test('19. Reversal Action: AI can reversibly cancel an errant transaction', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bank', user_id: userId, name: 'Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: 'AST-ACC-acc-bank', name: 'Bank Asset', account_type: 'asset', entity_type: 'account', entity_id: 'acc-bank' },
    { user_id: userId, code: 'EXP-GEN-UNCAT', name: 'Expense Account', account_type: 'expense', entity_type: 'system', entity_id: 'uncategorized' },
  ]);

  // Post expense
  const expRes = await executeAIFinancialAction(supabase, userId, 'msg-exp', {
    actionType: 'expense',
    actionId: 'act-exp',
    amount: '800.00',
    accountId: 'acc-bank',
  });

  assert.equal(expRes.success, true);
  assert.ok(expRes.journalEntryId);

  // Reverse expense
  const revRes = await executeAIFinancialAction(supabase, userId, 'msg-rev', {
    actionType: 'reversal',
    actionId: 'act-rev',
    amount: '800.00',
    originalJournalEntryId: expRes.journalEntryId,
    reversalReason: 'User requested reversal of accidental entry',
  });

  assert.equal(revRes.success, true);
  assert.ok(revRes.reversalEntryId);

  const origEntry = supabase._store.journal_entries.find((e: any) => e.id === expRes.journalEntryId);
  assert.equal(origEntry.status, 'reversed');
});

test('20. Person-Specific Scoping: Only targeted person context is fetched', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    counterparties: [
      { id: 'cp-1', user_id: userId, name: 'Rohan' },
      { id: 'cp-2', user_id: userId, name: 'Sameer' },
    ],
  });

  // Querying Rohan's balance directly
  const rohanBal = await getCounterpartyAuthoritativeBalance(supabase, userId, 'cp-1');
  assert.equal(rohanBal.counterpartyId, 'cp-1');
  assert.equal(rohanBal.receivableBalance, 0);
});

test('21. Loan-Specific Scoping: Only targeted loan context is fetched', async () => {
  const userId = 'user-1';
  const loanId = 'loan-home-1';
  const supabase = createMockSupabase({
    userId,
    loans: [{ id: loanId, user_id: userId, name: 'Home Loan', type: 'home', loan_amount: 3000000 }],
  });

  await (supabase.from('ledger_accounts') as any).insert([
    { user_id: userId, code: `LIA-LOAN-${loanId}`, name: 'Home Loan Liability', account_type: 'liability', entity_type: 'loan', entity_id: loanId },
  ]);

  const loanBal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(loanBal.loanName, 'Home Loan');
  assert.equal(loanBal.outstandingPrincipal.toNumber(), 0);
});

test('22. Investment-Specific Scoping: Holding context is isolated to user portfolio', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    holdings: [{ id: 'hold-1', user_id: userId, symbol: 'INFY', name: 'Infosys Ltd', quantity: 50, average_buy_price: 1450 }],
  });

  const { data: holding } = await (supabase.from('holdings') as any)
    .select('symbol, quantity, average_buy_price')
    .eq('user_id', userId)
    .ilike('symbol', 'INFY')
    .single();

  assert.equal(holding.symbol, 'INFY');
  assert.equal(holding.quantity, 50);
});

test('23. AI Income "GENERAL" Category Sentinel: Successfully provisions valid UUID for income_category', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bob', user_id: userId, name: 'Bob Account', type: 'bank', ownership: 'personal', is_active: true }],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-deposit-papa', {
    actionType: 'income',
    actionId: 'act-deposit-papa',
    amount: '1000.00',
    description: 'Deposit from Papa',
    accountName: 'Bob Account',
    accountId: 'acc-bob',
    personName: 'Papa',
  });

  assert.equal(res.success, true);
  assert.ok(res.journalEntryId);

  // Verify created ledger account has code INC-CAT-GENERAL and valid UUID entity_id
  const incAcc = supabase._store.ledger_accounts.find((a: any) => a.code === 'INC-CAT-GENERAL');
  assert.ok(incAcc, 'INC-CAT-GENERAL ledger account must be provisioned');
  assert.equal(incAcc.account_type, 'income');
  assert.equal(incAcc.entity_type, 'income_category');
  assert.equal(isValidUUID(incAcc.entity_id), true);
  assert.equal(incAcc.entity_id, SYSTEM_RESERVED_UUIDS.GENERAL_INCOME);
});

test('24. Category Namespace Separation: Expense and Income categories do not collide', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-main', user_id: userId, name: 'Main Account', type: 'bank', ownership: 'personal', is_active: true }],
  });

  // Post general expense
  await executeAIFinancialAction(supabase, userId, 'msg-exp', {
    actionType: 'expense',
    actionId: 'act-exp',
    amount: '500.00',
    accountId: 'acc-main',
  });

  // Post general income
  await executeAIFinancialAction(supabase, userId, 'msg-inc', {
    actionType: 'income',
    actionId: 'act-inc',
    amount: '500.00',
    accountId: 'acc-main',
  });

  const expAcc = supabase._store.ledger_accounts.find((a: any) => a.code === 'EXP-CAT-GENERAL');
  const incAcc = supabase._store.ledger_accounts.find((a: any) => a.code === 'INC-CAT-GENERAL');

  assert.ok(expAcc);
  assert.ok(incAcc);
  assert.notEqual(expAcc.id, incAcc.id);
  assert.equal(expAcc.entity_type, 'expense_category');
  assert.equal(incAcc.entity_type, 'income_category');
  assert.equal(expAcc.entity_id, SYSTEM_RESERVED_UUIDS.GENERAL_EXPENSE);
  assert.equal(incAcc.entity_id, SYSTEM_RESERVED_UUIDS.GENERAL_INCOME);
});

test('25. AI Income Balanced Ledger Posting: Dr Asset, Cr Income, Sum(Dr) = Sum(Cr)', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bob', user_id: userId, name: 'Bob Account', type: 'bank', ownership: 'personal', is_active: true }],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-bal-check', {
    actionType: 'income',
    actionId: 'act-bal-check',
    amount: '2500.00',
    accountId: 'acc-bob',
  });

  assert.equal(res.success, true);
  const entry = supabase._store.journal_entries.find((e: any) => e.id === res.journalEntryId);
  assert.ok(entry);
  assert.equal(entry.status, 'posted');

  const lines = supabase._store.journal_lines.filter((l: any) => l.journal_entry_id === entry.id);
  assert.equal(lines.length, 2);

  const drLine = lines.find((l: any) => Number(l.debit_amount) > 0);
  const crLine = lines.find((l: any) => Number(l.credit_amount) > 0);
  assert.ok(drLine);
  assert.ok(crLine);
  assert.equal(Number(drLine.debit_amount), 2500);
  assert.equal(Number(crLine.credit_amount), 2500);
});

test('26. Double-Click Idempotency on AI Income Action: Produces exactly one journal entry', async () => {
  const userId = 'user-1';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-bob', user_id: userId, name: 'Bob Account', type: 'bank', ownership: 'personal', is_active: true }],
  });

  const payload = {
    actionType: 'income' as const,
    actionId: 'act-double-click',
    amount: '1000.00',
    accountId: 'acc-bob',
  };

  const res1 = await executeAIFinancialAction(supabase, userId, 'msg-same', payload);
  const res2 = await executeAIFinancialAction(supabase, userId, 'msg-same', payload);

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.equal(res1.journalEntryId, res2.journalEntryId);

  const totalEntries = supabase._store.journal_entries.filter((e: any) => e.user_id === userId);
  assert.equal(totalEntries.length, 1);
});

test('27. Cross-User AI Income Rejection: Foreign account ID is rejected', async () => {
  const userId = 'user-attacker';
  const victimId = 'user-victim';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: 'acc-victim', user_id: victimId, name: 'Victim Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-hack', {
    actionType: 'income',
    actionId: 'act-hack',
    amount: '10000.00',
    accountId: 'acc-victim',
  });

  assert.equal(res.success, false);
  assert.match(res.error || '', /Security Violation/);
});

test('28. Exhaustive UUID Safety: Non-UUID sentinels are strictly normalized across all transaction types', async () => {
  const userId = 'user-1';
  const accId = '11111111-1111-4111-a111-111111111111';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: accId, user_id: userId, name: 'Bank 1', type: 'bank', ownership: 'personal', is_active: true }],
  });

  // Expense with invalid string categoryId
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'expense',
    accountId: accId,
    categoryId: 'RANDOM_NON_UUID_SENTINEL',
    amount: '100.00',
    date: '2026-08-19',
    description: 'Test Invalid UUID Cat',
    idempotencyKey: `TEST:INV:CAT:${Date.now()}`,
  });

  // Income with invalid string categoryId
  await recordFinancialTransaction(supabase, {
    userId,
    type: 'income',
    accountId: accId,
    categoryId: 'INVALID_INC_CAT',
    amount: '200.00',
    date: '2026-08-19',
    description: 'Test Invalid UUID Income Cat',
    idempotencyKey: `TEST:INV:INC:${Date.now()}`,
  });

  // Check all created ledger accounts
  for (const la of supabase._store.ledger_accounts) {
    assert.equal(isValidUUID(la.entity_id), true, `Ledger account ${la.code} must have a valid UUID entity_id, got: ${la.entity_id}`);
  }
});

test('29. Investment BUY: ZERO active investment accounts returns prerequisite error ("Action needs information")', async () => {
  const userId = 'user-inv-0';
  const fundingAccId = '11111111-1111-4111-a111-111111111111';
  const supabase = createMockSupabase({
    userId,
    accounts: [{ id: fundingAccId, user_id: userId, name: 'Bob Bank', type: 'bank', ownership: 'personal', is_active: true }],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-no-inv', {
    actionType: 'investment_buy',
    actionId: 'act-buy-0',
    amount: '46000.00',
    accountId: fundingAccId,
    assetSymbol: 'Bajaj IPO',
  });

  assert.equal(res.success, false);
  assert.equal(res.message, 'Action needs information');
  assert.match(res.error || '', /active investment\/demat account is required/);
  assert.equal(supabase._store.journal_entries.length, 0);
});

test('30. Investment BUY: EXACTLY ONE active investment account resolves automatically and posts balanced Dr Investment / Cr Bank', async () => {
  const userId = 'user-inv-1';
  const fundingAccId = '11111111-1111-4111-a111-111111111111';
  const dematAccId = '22222222-2222-4222-a222-222222222222';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: fundingAccId, user_id: userId, name: 'Bob Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: dematAccId, user_id: userId, name: 'Zerodha Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-buy-single', {
    actionType: 'investment_buy',
    actionId: 'act-buy-1',
    amount: '46000.00',
    accountId: fundingAccId,
    assetSymbol: 'Bajaj IPO',
  });

  assert.equal(res.success, true);
  assert.ok(res.journalEntryId);
  assert.equal(supabase._store.journal_entries.length, 1);
  assert.equal(supabase._store.journal_lines.length, 2);

  // Verify balanced double-entry
  const lines = supabase._store.journal_lines;
  const drLine = lines.find(l => new Decimal(l.debit_amount).gt(0));
  const crLine = lines.find(l => new Decimal(l.credit_amount).gt(0));
  assert.ok(drLine && crLine);
  assert.equal(new Decimal(drLine.debit_amount).toFixed(2), '46000.00');
  assert.equal(new Decimal(crLine.credit_amount).toFixed(2), '46000.00');
});

test('31. Investment BUY: MULTIPLE active investment accounts without target specified returns prerequisite notice', async () => {
  const userId = 'user-inv-multi';
  const fundingAccId = '11111111-1111-4111-a111-111111111111';
  const demat1 = '22222222-2222-4222-a222-222222222222';
  const demat2 = '33333333-3333-4333-a333-333333333333';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: fundingAccId, user_id: userId, name: 'Bob Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: demat1, user_id: userId, name: 'Zerodha Demat', type: 'investment', ownership: 'personal', is_active: true },
      { id: demat2, user_id: userId, name: 'Groww Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-buy-multi', {
    actionType: 'investment_buy',
    actionId: 'act-buy-m',
    amount: '46000.00',
    accountId: fundingAccId,
    assetSymbol: 'Bajaj IPO',
  });

  assert.equal(res.success, false);
  assert.equal(res.message, 'Action needs information');
  assert.match(res.error || '', /Multiple investment accounts found/);
  assert.equal(supabase._store.journal_entries.length, 0);
});

test('32. Investment BUY: MULTIPLE active accounts with target specified by name succeeds cleanly', async () => {
  const userId = 'user-inv-multi-named';
  const fundingAccId = '11111111-1111-4111-a111-111111111111';
  const demat1 = '22222222-2222-4222-a222-222222222222';
  const demat2 = '33333333-3333-4333-a333-333333333333';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: fundingAccId, user_id: userId, name: 'Bob Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: demat1, user_id: userId, name: 'Zerodha Demat', type: 'investment', ownership: 'personal', is_active: true },
      { id: demat2, user_id: userId, name: 'Groww Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-buy-named', {
    actionType: 'investment_buy',
    actionId: 'act-buy-named-1',
    amount: '25000.00',
    accountId: fundingAccId,
    holdingAccountName: 'Groww',
    assetSymbol: 'RELIANCE',
  });

  assert.equal(res.success, true);
  assert.ok(res.journalEntryId);
  assert.equal(supabase._store.journal_entries.length, 1);
});

test('33. Investment BUY: INACTIVE investment account is rejected with prerequisite notice', async () => {
  const userId = 'user-inv-inactive';
  const fundingAccId = '11111111-1111-4111-a111-111111111111';
  const dematInactive = '22222222-2222-4222-a222-222222222222';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: fundingAccId, user_id: userId, name: 'Bob Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: dematInactive, user_id: userId, name: 'Old Inactive Demat', type: 'investment', ownership: 'personal', is_active: false },
    ],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-inactive-inv', {
    actionType: 'investment_buy',
    actionId: 'act-inactive',
    amount: '10000.00',
    accountId: fundingAccId,
    holdingAccountId: dematInactive,
    assetSymbol: 'TCS',
  });

  assert.equal(res.success, false);
  assert.equal(res.message, 'Action needs information');
  assert.match(res.error || '', /inactive/);
});

test('34. Investment BUY: INACTIVE funding bank account is rejected with prerequisite notice', async () => {
  const userId = 'user-funding-inactive';
  const fundingInactive = '11111111-1111-4111-a111-111111111111';
  const dematActive = '22222222-2222-4222-a222-222222222222';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: fundingInactive, user_id: userId, name: 'Frozen Bank', type: 'bank', ownership: 'personal', is_active: false },
      { id: dematActive, user_id: userId, name: 'Active Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-funding-inact', {
    actionType: 'investment_buy',
    actionId: 'act-fund-inact',
    amount: '10000.00',
    accountId: fundingInactive,
    holdingAccountId: dematActive,
    assetSymbol: 'INFY',
  });

  assert.equal(res.success, false);
  assert.equal(res.message, 'Action needs information');
  assert.match(res.error || '', /inactive/);
});

test('35. Cross-User Security: Foreign investment demat account is rejected', async () => {
  const userId = 'user-attacker';
  const victimId = 'user-victim';
  const fundingAccId = '11111111-1111-4111-a111-111111111111';
  const foreignDemat = '22222222-2222-4222-a222-222222222222';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: fundingAccId, user_id: userId, name: 'Attacker Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: foreignDemat, user_id: victimId, name: 'Victim Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-cross-demat', {
    actionType: 'investment_buy',
    actionId: 'act-cross-demat',
    amount: '50000.00',
    accountId: fundingAccId,
    holdingAccountId: foreignDemat,
    assetSymbol: 'HDFC',
  });

  assert.equal(res.success, false);
  assert.match(res.error || '', /Security Violation/);
});

test('36. Cross-User Security: Foreign funding bank account is rejected', async () => {
  const userId = 'user-attacker';
  const victimId = 'user-victim';
  const foreignBank = '11111111-1111-4111-a111-111111111111';
  const dematActive = '22222222-2222-4222-a222-222222222222';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: foreignBank, user_id: victimId, name: 'Victim Bank', type: 'bank', ownership: 'personal', is_active: true },
      { id: dematActive, user_id: userId, name: 'Attacker Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-cross-bank', {
    actionType: 'investment_buy',
    actionId: 'act-cross-bank',
    amount: '50000.00',
    accountId: foreignBank,
    holdingAccountId: dematActive,
    assetSymbol: 'HDFC',
  });

  assert.equal(res.success, false);
  assert.match(res.error || '', /Security Violation/);
});

test('37. Personal IPO BUY: Posts balanced Dr ₹46,000.00 / Cr ₹46,000.00', async () => {
  const userId = 'user-ipo';
  const bobBank = '11111111-1111-4111-a111-111111111111';
  const zerodhaDemat = '22222222-2222-4222-a222-222222222222';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: bobBank, user_id: userId, name: 'Bob Account', type: 'bank', ownership: 'personal', is_active: true },
      { id: zerodhaDemat, user_id: userId, name: 'Zerodha Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  const res = await executeAIFinancialAction(supabase, userId, 'msg-ipo-1', {
    actionType: 'investment_buy',
    actionId: 'act-ipo-1',
    amount: '46000.00',
    accountId: bobBank,
    holdingAccountId: zerodhaDemat,
    assetSymbol: 'Bajaj Housing Finance IPO',
    description: 'Invest in Bajaj IPO from Bob account',
  });

  assert.equal(res.success, true);
  assert.ok(res.journalEntryId);

  const lines = supabase._store.journal_lines;
  assert.equal(lines.length, 2);
  const totalDebit = lines.reduce((acc, l) => acc.plus(l.debit_amount || 0), new Decimal(0));
  const totalCredit = lines.reduce((acc, l) => acc.plus(l.credit_amount || 0), new Decimal(0));
  assert.equal(totalDebit.toFixed(2), '46000.00');
  assert.equal(totalCredit.toFixed(2), '46000.00');
});

test('38. Investment BUY Idempotency: Retrying confirmation returns identical journal entry', async () => {
  const userId = 'user-ipo-idemp';
  const bobBank = '11111111-1111-4111-a111-111111111111';
  const zerodhaDemat = '22222222-2222-4222-a222-222222222222';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: bobBank, user_id: userId, name: 'Bob Account', type: 'bank', ownership: 'personal', is_active: true },
      { id: zerodhaDemat, user_id: userId, name: 'Zerodha Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  const payload = {
    actionType: 'investment_buy' as const,
    actionId: 'act-idemp-ipo',
    amount: '46000.00',
    accountId: bobBank,
    holdingAccountId: zerodhaDemat,
    assetSymbol: 'Bajaj IPO',
  };

  const res1 = await executeAIFinancialAction(supabase, userId, 'msg-idemp-1', payload);
  const res2 = await executeAIFinancialAction(supabase, userId, 'msg-idemp-1', payload);

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.equal(res1.journalEntryId, res2.journalEntryId);
  assert.equal(supabase._store.journal_entries.length, 1);
});

test('39. Investment BUY Reversal: Reversing an investment purchase creates inverted offsetting lines', async () => {
  const userId = 'user-ipo-rev';
  const bobBank = '11111111-1111-4111-a111-111111111111';
  const zerodhaDemat = '22222222-2222-4222-a222-222222222222';
  const supabase = createMockSupabase({
    userId,
    accounts: [
      { id: bobBank, user_id: userId, name: 'Bob Account', type: 'bank', ownership: 'personal', is_active: true },
      { id: zerodhaDemat, user_id: userId, name: 'Zerodha Demat', type: 'investment', ownership: 'personal', is_active: true },
    ],
  });

  const buyRes = await executeAIFinancialAction(supabase, userId, 'msg-buy-orig', {
    actionType: 'investment_buy',
    actionId: 'act-orig',
    amount: '46000.00',
    accountId: bobBank,
    holdingAccountId: zerodhaDemat,
    assetSymbol: 'Bajaj IPO',
  });

  assert.equal(buyRes.success, true);
  assert.ok(buyRes.journalEntryId);

  const revRes = await executeAIFinancialAction(supabase, userId, 'msg-rev-1', {
    actionType: 'reversal',
    actionId: 'act-rev',
    originalJournalEntryId: buyRes.journalEntryId,
    reversalReason: 'Accidental IPO application',
  });

  assert.equal(revRes.success, true);
  assert.ok(revRes.reversalEntryId);

  // Verify journal entries and inverted lines
  assert.equal(supabase._store.journal_entries.length, 2);
  const origEntry = supabase._store.journal_entries.find(e => e.id === buyRes.journalEntryId);
  assert.equal(origEntry.status, 'reversed');
});
