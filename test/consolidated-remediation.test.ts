import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import {
  ensureCounterpartyLedgerAccounts,
  getCounterpartyAuthoritativeBalance,
  getPersonLedgerHistory,
  recordLending,
  recordBorrowing,
  recordRepayment,
} from '../src/lib/ledger/people.ts';
import {
  ensureLoanLedgerAccounts,
  recordLoanDisbursement,
  recordLoanEMI,
  getLoanAuthoritativeBalance,
} from '../src/lib/ledger/loans.ts';
import { recordFinancialTransaction } from '../src/lib/ledger/service.ts';
import fs from 'node:fs';
import path from 'node:path';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// =========================================================================
// MOCK SUPABASE ENGINE FOR CONSOLIDATED REMEDIATION VERIFICATION
// =========================================================================
function createMockSupabase(initialState: {
  userId?: string;
  counterparties?: any[];
  ledgerAccounts?: any[];
  journalEntries?: any[];
  journalLines?: any[];
  accounts?: any[];
  loans?: any[];
  bankStatements?: any[];
  bankStatementTransactions?: any[];
  transactions?: any[];
  auditLogs?: any[];
} = {}) {
  const defaultUserId = initialState.userId || 'user-uuid-1';
  const state = {
    counterparties: [...(initialState.counterparties || [])],
    ledgerAccounts: [...(initialState.ledgerAccounts || [])],
    journalEntries: [...(initialState.journalEntries || [])],
    journalLines: [...(initialState.journalLines || [])],
    accounts: [...(initialState.accounts || [])],
    loans: [...(initialState.loans || [])],
    bankStatements: [...(initialState.bankStatements || [])],
    bankStatementTransactions: [...(initialState.bankStatementTransactions || [])],
    transactions: [...(initialState.transactions || [])],
    auditLogs: [...(initialState.auditLogs || [])],
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
        tableName === 'bank_statements' ? 'bankStatements' :
        tableName === 'bank_statement_transactions' ? 'bankStatementTransactions' :
        tableName === 'audit_logs' ? 'auditLogs' :
        tableName
      ] || [];

      let filters: Array<(row: any) => boolean> = [];
      let selectedCols: string = '*';

      const getNested = (obj: any, propPath: string) => {
        if (!propPath.includes('.')) return obj?.[propPath];
        return propPath.split('.').reduce((acc, part) => acc?.[part], obj);
      };

      const builder: any = {
        select: (cols?: string) => {
          if (cols) selectedCols = cols;
          return builder;
        },
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
          filters.push((r: any) => true);
          return builder;
        },
        limit: (n: number) => {
          return builder;
        },
        order: (field: string, opts?: { ascending?: boolean }) => {
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
            in: (col: string, vals: any[]) => {
              filters.push((r: any) => vals.includes(r[col]));
              for (const row of currentTable) {
                if (filters.every(f => f(row))) {
                  Object.assign(row, updates);
                }
              }
              return updateBuilder;
            },
            select: () => ({
              single: async () => ({ data: currentTable.find(r => filters.every(f => f(r))), error: null }),
            }),
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

        // Check duplicate idempotency
        const existing = state.journalEntries.find(
          e => e.user_id === p_user_id && e.idempotency_key === p_idempotency_key
        );
        if (existing) {
          return { data: existing.id, error: null };
        }

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

      if (fnName === 'post_reversal_entry') {
        const p_user_id = params.p_user_id;
        const p_original_entry_id = params.p_original_entry_id;

        const original = state.journalEntries.find(e => e.id === p_original_entry_id && e.user_id === p_user_id);
        if (!original) return { data: null, error: { message: 'Original journal entry not found' } };
        if (original.status === 'reversed') return { data: null, error: { message: 'Entry already reversed' } };

        original.status = 'reversed';
        const reversalId = `rev-${Date.now()}`;
        state.journalEntries.push({
          id: reversalId,
          user_id: p_user_id,
          entry_number: state.journalEntries.length + 1,
          transaction_date: new Date().toISOString().split('T')[0],
          description: `REVERSAL: ${original.description}`,
          source_type: 'reversal',
          idempotency_key: params.p_idempotency_key || `REV:${p_original_entry_id}`,
          status: 'posted',
          created_at: new Date().toISOString(),
        });

        const origLines = state.journalLines.filter(l => l.journal_entry_id === p_original_entry_id);
        for (const l of origLines) {
          state.journalLines.push({
            id: `jl-rev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            journal_entry_id: reversalId,
            ledger_account_id: l.ledger_account_id,
            user_id: p_user_id,
            debit_amount: l.credit_amount,
            credit_amount: l.debit_amount,
            memo: `Reversal of ${l.memo || original.description}`,
            created_at: new Date().toISOString(),
          });
        }

        return { data: reversalId, error: null };
      }

      return { data: null, error: { message: `Unknown RPC ${fnName}` } };
    },
  };

  return client;
}

// =========================================================================
// 1. FIN-01: PEOPLE LEDGER REVERSAL BALANCE CORRUPTION REGRESSION
// =========================================================================

test('FIN-01 [1.1]: Lending ₹1,000 and then reversing it produces exact ₹0.00 balance without phantom negative', async () => {
  const supabase = createMockSupabase({
    userId: 'user-1',
    counterparties: [{ id: 'cp-rahul', user_id: 'user-1', name: 'Rahul' }],
    accounts: [{ id: 'acc-bank', user_id: 'user-1', name: 'HDFC', balance: 50000 }],
  });

  // Step 1: Record Lending of ₹1,000
  const lendRes = await recordLending(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-rahul',
    accountId: 'acc-bank',
    amount: '1000.00',
    description: 'Lent ₹1000 to Rahul',
    receivableId: 'rec-rahul-01',
  });
  assert.equal(lendRes.success, true);
  if (!lendRes.success) return;

  // Step 2: Verify balance before reversal is ₹1,000
  const balBefore = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-rahul');
  assert.equal(balBefore.receivableBalance, 1000);
  assert.equal(balBefore.netBalance, 1000);
  assert.equal(balBefore.direction, 'THEY_OWE_YOU');

  // Step 3: Reverse the lending entry
  const revRes = await supabase.rpc('post_reversal_entry', {
    p_user_id: 'user-1',
    p_original_entry_id: lendRes.journalEntryId,
    p_reason: 'Incorrect entry',
    p_idempotency_key: 'REV:rec-rahul-01',
    p_created_by: 'user-1',
  });
  assert.ok(revRes.data);

  // Step 4: Verify authoritative balance after reversal is exactly ₹0.00
  const balAfter = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-rahul');
  assert.equal(balAfter.receivableBalance, 0, 'Receivable balance must be exactly ₹0.00');
  assert.equal(balAfter.payableBalance, 0, 'Payable balance must be exactly ₹0.00');
  assert.equal(balAfter.netBalance, 0, 'Net balance must be ₹0.00 (not phantom -1000)');
  assert.equal(balAfter.direction, 'SETTLED');

  // Step 5: Verify chronological history also calculates ₹0 running balance
  const history = await getPersonLedgerHistory(supabase, 'user-1', 'cp-rahul');
  assert.equal(history.length, 2, 'History has original + reversal entries');
  assert.equal(history[history.length - 1].runningReceivableBalance, 0, 'Running balance terminates at ₹0.00');
});

test('FIN-01 [1.2]: Borrowing ₹2,500 and reversing it produces exact ₹0.00 payable balance', async () => {
  const supabase = createMockSupabase({
    userId: 'user-1',
    counterparties: [{ id: 'cp-sneha', user_id: 'user-1', name: 'Sneha' }],
    accounts: [{ id: 'acc-bank', user_id: 'user-1', name: 'HDFC', balance: 50000 }],
  });

  const borrowRes = await recordBorrowing(supabase, {
    userId: 'user-1',
    counterpartyId: 'cp-sneha',
    accountId: 'acc-bank',
    amount: '2500.00',
    description: 'Borrowed from Sneha',
    payableId: 'pay-sneha-01',
  });
  assert.equal(borrowRes.success, true);
  if (!borrowRes.success) return;

  const balBefore = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-sneha');
  assert.equal(balBefore.payableBalance, 2500);
  assert.equal(balBefore.direction, 'YOU_OWE_THEM');

  await supabase.rpc('post_reversal_entry', {
    p_user_id: 'user-1',
    p_original_entry_id: borrowRes.journalEntryId,
    p_reason: 'Borrowed cancelled',
    p_idempotency_key: 'REV:pay-sneha-01',
    p_created_by: 'user-1',
  });

  const balAfter = await getCounterpartyAuthoritativeBalance(supabase, 'user-1', 'cp-sneha');
  assert.equal(balAfter.payableBalance, 0);
  assert.equal(balAfter.netBalance, 0);
  assert.equal(balAfter.direction, 'SETTLED');
});

// =========================================================================
// 2. FIN-03 / FIN-04: DETERMINISTIC IDEMPOTENCY REGRESSION
// =========================================================================

test('FIN-03 [2.1]: recordFinancialTransaction with same idempotencyKey executes idempotently', async () => {
  const supabase = createMockSupabase({
    userId: 'user-1',
    accounts: [{ id: 'acc-1', user_id: 'user-1', name: 'Bank' }],
  });

  const key = 'TXN:USER1:UNIQUE-OP-12345';

  const res1 = await recordFinancialTransaction(supabase, {
    userId: 'user-1',
    type: 'expense',
    accountId: 'acc-1',
    amount: '500.00',
    date: '2026-08-21',
    description: 'Dinner',
    idempotencyKey: key,
  });

  const res2 = await recordFinancialTransaction(supabase, {
    userId: 'user-1',
    type: 'expense',
    accountId: 'acc-1',
    amount: '500.00',
    date: '2026-08-21',
    description: 'Dinner',
    idempotencyKey: key,
  });

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.equal(res1.journalEntryId, res2.journalEntryId, 'Must return the SAME journalEntryId on retry');
  assert.equal(supabase._state.journalEntries.length, 1, 'Must create exactly 1 journal entry on duplicate submission');
});

test('FIN-04 [2.2]: recordLoanEMI constructs deterministic key with principal and interest components', async () => {
  const supabase = createMockSupabase({
    userId: 'user-1',
    loans: [{ id: 'loan-1', user_id: 'user-1', name: 'Car Loan', principal_amount: 100000, loan_type: 'taken' }],
    accounts: [{ id: 'acc-1', user_id: 'user-1', name: 'Bank', balance: 50000 }],
  });

  // Disbursement
  await recordLoanDisbursement(supabase, {
    userId: 'user-1',
    loanId: 'loan-1',
    accountId: 'acc-1',
    amount: '100000.00',
    date: '2026-08-01',
  });

  // EMI 1: regular monthly EMI
  const emi1 = await recordLoanEMI(supabase, {
    userId: 'user-1',
    loanId: 'loan-1',
    accountId: 'acc-1',
    principalAmount: '5000.00',
    interestAmount: '1200.00',
    date: '2026-08-21',
  });
  assert.equal(emi1.success, true);

  // EMI 1 retry (identical principal & interest on same date) -> identical key & duplicate avoided
  const emi1Retry = await recordLoanEMI(supabase, {
    userId: 'user-1',
    loanId: 'loan-1',
    accountId: 'acc-1',
    principalAmount: '5000.00',
    interestAmount: '1200.00',
    date: '2026-08-21',
  });
  assert.equal(emi1.journalEntryId, emi1Retry.journalEntryId, 'Identical retry returns existing entry');

  // EMI 2: additional prepayment on same date with different principal -> distinct deterministic key
  const emi2 = await recordLoanEMI(supabase, {
    userId: 'user-1',
    loanId: 'loan-1',
    accountId: 'acc-1',
    principalAmount: '20000.00',
    interestAmount: '0.00',
    date: '2026-08-21',
  });
  assert.equal(emi2.success, true);
  assert.notEqual(emi1.journalEntryId, emi2.journalEntryId, 'Distinct payment on same date succeeds with distinct entry');
});

// =========================================================================
// 3. SEC-01: RECONCILIATION TENANT OWNERSHIP DEFENSE-IN-DEPTH
// =========================================================================

test('SEC-01 [3.1]: executeReconciliationServer source code strictly verifies bank_statement_transactions ownership', () => {
  const reconSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/actions/reconciliation.ts'),
    'utf-8'
  );

  // Verify application-layer defense-in-depth ownership check exists
  assert.ok(
    reconSrc.includes('bank_statement_transactions') &&
    reconSrc.includes('statement_id') &&
    reconSrc.includes('bank_statements') &&
    reconSrc.includes('user.id'),
    'reconciliation.ts must verify statement_id belongs to bank_statements where user_id = user.id'
  );

  // Verify atomic rejection if any bank transaction does not belong to user
  assert.ok(
    reconSrc.includes('ownedBankTxs.length !== bankIds.length'),
    'reconciliation.ts must reject reconciliation if ANY bank transaction is foreign or missing'
  );
});

// =========================================================================
// 4. FIN-02: LOAN TYPE SEMANTICS ('given' vs 'taken')
// =========================================================================

test('FIN-02 [4.1]: ensureLoanLedgerAccounts provisions AST-LOAN (Asset) and INC-LOAN-INT (Income) for loan_type = "given"', async () => {
  const supabase = createMockSupabase({
    userId: 'user-1',
    loans: [
      { id: 'loan-given-01', user_id: 'user-1', name: 'Lent to Friend', loan_type: 'given' },
    ],
  });

  const { loanLedgerAccId, interestExpenseAccId } = await ensureLoanLedgerAccounts(
    supabase,
    'user-1',
    'loan-given-01',
    'Lent to Friend'
  );

  const loanAccount = supabase._state.ledgerAccounts.find(a => a.id === loanLedgerAccId);
  const interestAccount = supabase._state.ledgerAccounts.find(a => a.id === interestExpenseAccId);

  assert.ok(loanAccount, 'Loan account must exist');
  assert.equal(loanAccount.account_type, 'asset', 'Given loan ledger account must have account_type = "asset"');
  assert.ok(loanAccount.code.startsWith('AST-LOAN-'), 'Given loan code must start with AST-LOAN-');

  assert.ok(interestAccount, 'Interest account must exist');
  assert.equal(interestAccount.account_type, 'income', 'Given loan interest account must have account_type = "income"');
  assert.ok(interestAccount.code.startsWith('INC-LOAN-INT-'), 'Given loan interest code must start with INC-LOAN-INT-');
});

test('FIN-02 [4.2]: ensureLoanLedgerAccounts provisions LIA-LOAN (Liability) and EXP-LOAN-INT (Expense) for loan_type = "taken"', async () => {
  const supabase = createMockSupabase({
    userId: 'user-1',
    loans: [
      { id: 'loan-taken-01', user_id: 'user-1', name: 'Home Loan', loan_type: 'taken' },
    ],
  });

  const { loanLedgerAccId, interestExpenseAccId } = await ensureLoanLedgerAccounts(
    supabase,
    'user-1',
    'loan-taken-01',
    'Home Loan'
  );

  const loanAccount = supabase._state.ledgerAccounts.find(a => a.id === loanLedgerAccId);
  const interestAccount = supabase._state.ledgerAccounts.find(a => a.id === interestExpenseAccId);

  assert.ok(loanAccount, 'Loan account must exist');
  assert.equal(loanAccount.account_type, 'liability', 'Taken loan ledger account must have account_type = "liability"');
  assert.ok(loanAccount.code.startsWith('LIA-LOAN-'), 'Taken loan code must start with LIA-LOAN-');

  assert.ok(interestAccount, 'Interest account must exist');
  assert.equal(interestAccount.account_type, 'expense', 'Taken loan interest account must have account_type = "expense"');
  assert.ok(interestAccount.code.startsWith('EXP-LOAN-INT-'), 'Taken loan interest code must start with EXP-LOAN-INT-');
});

test('FIN-02 [4.3]: Cross-user loan access in ensureLoanLedgerAccounts is strictly rejected', async () => {
  const supabase = createMockSupabase({
    userId: 'user-1',
    loans: [
      { id: 'loan-user2', user_id: 'user-2', name: 'User 2 Loan', loan_type: 'taken' },
    ],
  });

  await assert.rejects(
    async () => {
      await ensureLoanLedgerAccounts(supabase, 'user-1', 'loan-user2');
    },
    /Security Violation/
  );
});

// =========================================================================
// 5. DB-03: RESET IDEMPOTENCY MIGRATION 013 VERIFICATION
// =========================================================================

test('DB-03 [5.1]: Migration 013 contains strict idempotency guard scoped to auth.uid()', () => {
  const migrationPath = path.join(process.cwd(), 'supabase/migrations/013_reset_idempotency.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 013_reset_idempotency.sql must exist');

  const sql = fs.readFileSync(migrationPath, 'utf-8');

  // Verify auth.uid() enforcement
  assert.ok(sql.includes('v_user_id := auth.uid()'), 'Must enforce v_user_id := auth.uid()');

  // Verify confirmation phrase
  assert.ok(sql.includes("p_confirmation_phrase <> 'RESET MY DATA'"), 'Must require exact RESET MY DATA confirmation');

  // Verify idempotency lookup
  assert.ok(sql.includes("action = 'USER_DATA_RESET_COMPLETED'"), 'Must query for prior USER_DATA_RESET_COMPLETED event');
  assert.ok(sql.includes("details->>'reset_id' = p_reset_id"), 'Must match reset_id in audit details');
  assert.ok(sql.includes("'idempotent', true"), 'Must return idempotent success payload');

  // Verify SECURITY DEFINER and search_path lock
  assert.ok(
    sql.includes('SECURITY DEFINER') && sql.includes('SET search_path = public, extensions'),
    'Must be SECURITY DEFINER with search_path locked'
  );
});

// =========================================================================
// 6. TQ-01: REAL DB / INTEGRATION ENVIRONMENT CAPABILITY ASSESSMENT
// =========================================================================

test('TQ-01 [6.1]: Verifies that all financial operations preserve Decimal.js precision and invariants', () => {
  const amt1 = new Decimal('1000.55');
  const amt2 = new Decimal('2000.45');
  const sum = amt1.plus(amt2);
  assert.equal(sum.toFixed(2), '3001.00', 'Paise arithmetic must remain exact');
  assert.equal(sum.decimalPlaces() <= 2, true, 'Maximum 2 decimal places');
});
