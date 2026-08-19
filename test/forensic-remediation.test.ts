import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Decimal } from 'decimal.js';
import { SYSTEM_RESERVED_UUIDS, isValidUUID, normalizeEntityUUID } from '../src/lib/ledger/constants.ts';
import { recordFinancialTransaction, ensureLedgerAccount, reverseFinancialTransaction } from '../src/lib/ledger/service.ts';
import { deleteLoanAuthoritative, getLoanAuthoritativeBalance, getLoansAuthoritativeSummary, recordLoanDisbursement, recordLoanEMI } from '../src/lib/ledger/loans.ts';
import { executeAIFinancialAction } from '../src/lib/ledger/ai.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const TEST_USER_A = '11111111-1111-4111-a111-111111111111';
const TEST_USER_B = '22222222-2222-4222-a222-222222222222';

// In-memory mock database engine
function createMockSupabase(initialState: {
  userId?: string;
  accounts?: any[];
  loans?: any[];
  ledgerAccounts?: any[];
  journalEntries?: any[];
  journalLines?: any[];
  auditLogs?: any[];
  receivables?: any[];
  payables?: any[];
  investments?: any[];
  transactions?: any[];
} = {}) {
  const currentUserId = initialState.userId || TEST_USER_A;
  const state = {
    accounts: [...(initialState.accounts || [])],
    loans: [...(initialState.loans || [])],
    ledgerAccounts: [...(initialState.ledgerAccounts || [])],
    journalEntries: [...(initialState.journalEntries || [])],
    journalLines: [...(initialState.journalLines || [])],
    auditLogs: [...(initialState.auditLogs || [])],
    receivables: [...(initialState.receivables || [])],
    payables: [...(initialState.payables || [])],
    investments: [...(initialState.investments || [])],
    transactions: [...(initialState.transactions || [])],
  };

  const client: any = {
    auth: {
      getUser: async () => ({ data: { user: { id: currentUserId } }, error: null }),
    },
    from: (tableName: string) => {
      const stateKey =
        tableName === 'ledger_accounts' ? 'ledgerAccounts' :
        tableName === 'journal_entries' ? 'journalEntries' :
        tableName === 'journal_lines' ? 'journalLines' :
        tableName === 'ledger_audit_log' ? 'auditLogs' :
        tableName;

      const currentTable = (state as any)[stateKey] || [];
      const filters: Array<(r: any) => boolean> = [];
      let orderByField: string | null = null;
      let orderAscending = true;

      const builder: any = {
        select: (_cols?: string) => builder,
        eq: (col: string, val: any) => {
          filters.push((r: any) => {
            if (col.includes('.')) {
              const parts = col.split('.');
              let curr = r;
              for (const p of parts) curr = curr?.[p];
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
        ilike: (_col: string, _val: any) => builder,
        order: (col: string, opts?: { ascending?: boolean }) => {
          orderByField = col;
          orderAscending = opts?.ascending !== false;
          return builder;
        },
        limit: (_n: number) => builder,
        maybeSingle: async () => {
          const rows = currentTable
            .map((line: any) => {
              if (tableName === 'journal_lines') {
                const entry = state.journalEntries.find((e) => e.id === line.journal_entry_id);
                return { ...line, journal_entries: entry || null };
              }
              return line;
            })
            .filter((r: any) => filters.every((f) => f(r)));
          return { data: rows[0] || null, error: null };
        },
        single: async () => {
          const rows = currentTable
            .map((line: any) => {
              if (tableName === 'journal_lines') {
                const entry = state.journalEntries.find((e) => e.id === line.journal_entry_id);
                return { ...line, journal_entries: entry || null };
              }
              return line;
            })
            .filter((r: any) => filters.every((f) => f(r)));
          if (rows.length === 0) return { data: null, error: { message: 'Row not found' } };
          return { data: rows[0], error: null };
        },
        then: (resolve: any, reject: any) => {
          let rows = currentTable
            .map((line: any) => {
              if (tableName === 'journal_lines') {
                const entry = state.journalEntries.find((e) => e.id === line.journal_entry_id);
                return { ...line, journal_entries: entry || null };
              }
              return line;
            })
            .filter((r: any) => filters.every((f) => f(r)));

          if (orderByField) {
            rows = [...rows].sort((a, b) => {
              const valA = a[orderByField!];
              const valB = b[orderByField!];
              if (valA < valB) return orderAscending ? -1 : 1;
              if (valA > valB) return orderAscending ? 1 : -1;
              return 0;
            });
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
        insert: (dataToInsert: any) => {
          const items = Array.isArray(dataToInsert) ? dataToInsert : [dataToInsert];
          const createdItems: any[] = [];
          for (const it of items) {
            const row = {
              id: it.id || `mock-${crypto.randomUUID()}`,
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
              eq: () => ({
                single: async () => ({ data: createdItems[0], error: null }),
                maybeSingle: async () => ({ data: createdItems[0], error: null }),
              }),
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
                if (filters.every((f) => f(row))) {
                  Object.assign(row, updates);
                }
              }
              return updateBuilder;
            },
            ilike: () => updateBuilder,
            select: () => ({
              single: async () => ({ data: currentTable.find((r: any) => filters.every((f) => f(r))), error: null }),
            }),
            then: (resolve: any) => resolve({ data: currentTable.filter((r: any) => filters.every((f) => f(r))), error: null }),
          };
          return updateBuilder;
        },
        delete: () => ({
          eq: (col: string, val: any) => {
            const idx = currentTable.findIndex((r: any) => r[col] === val);
            if (idx !== -1) currentTable.splice(idx, 1);
            return Promise.resolve({ error: null });
          },
        }),
      };

      return builder;
    },
    rpc: async (fnName: string, args: any) => {
      if (fnName === 'post_journal_entry') {
        const { p_user_id, p_transaction_date, p_description, p_source_type, p_source_id, p_idempotency_key, p_lines, p_created_by, p_metadata } = args;

        // Idempotency check
        const existing = state.journalEntries.find(
          (j) => j.user_id === p_user_id && j.idempotency_key === p_idempotency_key
        );
        if (existing) return { data: existing.id, error: null };

        // Balancing check
        const lines: any[] = typeof p_lines === 'string' ? JSON.parse(p_lines) : p_lines;
        let totalDebit = new Decimal(0);
        let totalCredit = new Decimal(0);
        for (const line of lines) {
          totalDebit = totalDebit.plus(new Decimal(line.debit_amount || 0));
          totalCredit = totalCredit.plus(new Decimal(line.credit_amount || 0));
        }

        if (!totalDebit.equals(totalCredit)) {
          return { data: null, error: { message: `Unbalanced journal entry: Dr ${totalDebit} != Cr ${totalCredit}` } };
        }

        const entryId = `je-${crypto.randomUUID()}`;
        const newEntry = {
          id: entryId,
          user_id: p_user_id,
          transaction_date: p_transaction_date,
          description: p_description,
          source_type: p_source_type,
          source_id: p_source_id,
          idempotency_key: p_idempotency_key,
          status: 'posted',
          created_by: p_created_by,
          metadata: p_metadata || {},
          created_at: new Date().toISOString(),
        };
        state.journalEntries.push(newEntry);

        let payloadText = `${entryId}|${p_transaction_date}|${totalDebit.toFixed(2)}:`;

        for (const line of lines) {
          state.journalLines.push({
            id: `jl-${crypto.randomUUID()}`,
            journal_entry_id: entryId,
            ledger_account_id: line.ledger_account_id,
            user_id: p_user_id,
            debit_amount: line.debit_amount,
            credit_amount: line.credit_amount,
            currency: line.currency || 'INR',
            memo: line.memo,
            created_at: new Date().toISOString(),
            journal_entries: newEntry,
          });

          payloadText += `[${line.ledger_account_id},${line.debit_amount},${line.credit_amount}]`;

          // Synchronize cached accounts
          const la = state.ledgerAccounts.find((a) => a.id === line.ledger_account_id);
          if (la && la.entity_type === 'account' && la.entity_id) {
            const acc = state.accounts.find((a) => a.id === la.entity_id && a.user_id === p_user_id);
            if (acc) {
              const delta = la.account_type === 'asset'
                ? Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
                : Number(line.credit_amount || 0) - Number(line.debit_amount || 0);

              acc.balance = (acc.balance || 0) + delta;
              acc.current_balance = (acc.current_balance || 0) + delta;
            }
          }
        }

        // SHA-256 Audit Hash
        const sha256Hash = crypto.createHash('sha256').update(payloadText).digest('hex');
        state.auditLogs.push({
          id: `audit-${crypto.randomUUID()}`,
          user_id: p_user_id,
          journal_entry_id: entryId,
          action: 'POST',
          actor_id: p_created_by,
          payload_hash: sha256Hash,
          metadata: p_metadata || {},
          created_at: new Date().toISOString(),
        });

        return { data: entryId, error: null };
      }

      if (fnName === 'post_reversal_entry') {
        const { p_user_id, p_original_entry_id, p_reason, p_idempotency_key, p_created_by, p_metadata } = args;
        const original = state.journalEntries.find((j) => j.id === p_original_entry_id && j.user_id === p_user_id);
        if (!original) return { data: null, error: { message: 'Original entry not found' } };
        if (original.status === 'reversed') return { data: null, error: { message: 'Already reversed' } };

        const originalLines = state.journalLines.filter((l) => l.journal_entry_id === p_original_entry_id);
        const invertedLines = originalLines.map((l) => ({
          ledger_account_id: l.ledger_account_id,
          debit_amount: l.credit_amount,
          credit_amount: l.debit_amount,
          currency: l.currency,
          memo: `Reversal: ${l.memo || original.description}`,
        }));

        const res = await client.rpc('post_journal_entry', {
          p_user_id,
          p_transaction_date: new Date().toISOString().split('T')[0],
          p_description: `REVERSAL: ${original.description} (${p_reason})`,
          p_source_type: 'reversal',
          p_source_id: p_original_entry_id,
          p_idempotency_key,
          p_lines: invertedLines,
          p_created_by,
          p_metadata: { ...(p_metadata || {}), reversal_of_id: p_original_entry_id, reason: p_reason },
        });

        if (res.error) return res;

        original.status = 'reversed';
        original.reversal_of_id = res.data;

        const reversalHash = crypto.createHash('sha256').update(`REVERSE|${p_original_entry_id}|${res.data}`).digest('hex');
        state.auditLogs.push({
          id: `audit-${crypto.randomUUID()}`,
          user_id: p_user_id,
          journal_entry_id: res.data,
          action: 'REVERSE',
          actor_id: p_created_by,
          payload_hash: reversalHash,
          metadata: { reversed_entry_id: p_original_entry_id },
          created_at: new Date().toISOString(),
        });

        return { data: res.data, error: null };
      }

      if (fnName === 'get_ledger_account_balance') {
        const lines = state.journalLines.filter(
          (l) => l.ledger_account_id === args.p_ledger_account_id && l.journal_entries?.status === 'posted'
        );
        let debits = new Decimal(0);
        let credits = new Decimal(0);
        for (const line of lines) {
          debits = debits.plus(new Decimal(line.debit_amount || 0));
          credits = credits.plus(new Decimal(line.credit_amount || 0));
        }
        return { data: debits.minus(credits).toNumber(), error: null };
      }

      return { data: null, error: { message: `Unknown RPC: ${fnName}` } };
    },
  };

  return { client, state };
}

// ==========================================
// TEST SUITE: FORENSIC REMEDIATION
// ==========================================

test('1. SHA-256 Audit Hash: Audit payload hash is strictly a 64-character hex string', async () => {
  const { client, state } = createMockSupabase();

  const accId = '33333333-3333-4333-a333-333333333333';
  state.accounts.push({ id: accId, user_id: TEST_USER_A, name: 'HDFC Bank', balance: 10000, current_balance: 10000 });

  const res = await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'expense',
    accountId: accId,
    amount: '450.00',
    date: '2026-08-19',
    description: 'Groceries',
    idempotencyKey: 'TEST:SHA256:001',
  });

  assert.equal(res.success, true);
  assert.equal(state.auditLogs.length, 1);

  const log = state.auditLogs[0];
  assert.equal(typeof log.payload_hash, 'string');
  assert.equal(log.payload_hash.length, 64, 'SHA-256 digest must be exactly 64 hex characters');
  assert.match(log.payload_hash, /^[0-9a-f]{64}$/i, 'Hash must be valid hexadecimal');
});

test('2. Reversal SHA-256 Audit Hash: Reversal audit record also uses 64-character SHA-256', async () => {
  const { client, state } = createMockSupabase();

  const accId = '33333333-3333-4333-a333-333333333333';
  state.accounts.push({ id: accId, user_id: TEST_USER_A, name: 'HDFC Bank', balance: 5000, current_balance: 5000 });

  const postRes = await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'expense',
    accountId: accId,
    amount: '200.00',
    date: '2026-08-19',
    description: 'Coffee',
    idempotencyKey: 'TEST:REV:001',
  });

  const revRes = await reverseFinancialTransaction(client, {
    userId: TEST_USER_A,
    journalEntryId: postRes.journalEntryId!,
    reason: 'Duplicate payment',
    idempotencyKey: 'REV:TEST:001',
  });

  assert.equal(revRes.success, true);
  const revLog = state.auditLogs.find((l) => l.action === 'REVERSE');
  assert.ok(revLog);
  assert.equal(revLog.payload_hash.length, 64, 'Reversal hash must be 64 hex characters');
});

test('3. Account Balance Schema Parity: Stored procedure atomically updates both balance and current_balance', async () => {
  const { client, state } = createMockSupabase();

  const accId = '33333333-3333-4333-a333-333333333333';
  state.accounts.push({ id: accId, user_id: TEST_USER_A, name: 'HDFC Bank', balance: 10000, current_balance: 10000 });

  await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'expense',
    accountId: accId,
    amount: '1500.00',
    date: '2026-08-19',
    description: 'Shopping',
    idempotencyKey: 'TEST:BAL:001',
  });

  const account = state.accounts.find((a) => a.id === accId);
  assert.equal(account.balance, 8500);
  assert.equal(account.current_balance, 8500, 'balance and current_balance must be strictly identical');
});

test('4. Loan Safe Deletion: Deleting loan reverses all active ledger entries and zeros out liability', async () => {
  const { client, state } = createMockSupabase();

  const bankAccId = '33333333-3333-4333-a333-333333333333';
  const loanId = '44444444-4444-4444-a444-444444444444';

  state.accounts.push({ id: bankAccId, user_id: TEST_USER_A, name: 'HDFC Bank', balance: 0, current_balance: 0 });
  state.loans.push({
    id: loanId,
    user_id: TEST_USER_A,
    name: 'Car Loan',
    principal_amount: 50000,
    remaining_principal: 50000,
    status: 'active',
  });

  // 1. Disburse loan ₹50,000
  await recordLoanDisbursement(client, {
    userId: TEST_USER_A,
    loanId,
    loanName: 'Car Loan',
    accountId: bankAccId,
    amount: 50000,
    date: '2026-08-01',
  });

  const balanceBefore = await getLoanAuthoritativeBalance(client, TEST_USER_A, loanId);
  assert.equal(balanceBefore.outstandingPrincipal.toNumber(), 50000);

  // 2. Safely delete loan
  const delRes = await deleteLoanAuthoritative(client, TEST_USER_A, loanId);
  assert.equal(delRes.success, true);
  assert.equal(delRes.reversedEntryCount, 1);

  // 3. Verify loan status and authoritative liability
  const deletedLoan = state.loans.find((l) => l.id === loanId);
  assert.equal(deletedLoan.status, 'deleted');
  assert.equal(deletedLoan.is_deleted, true);

  const balanceAfter = await getLoanAuthoritativeBalance(client, TEST_USER_A, loanId);
  assert.equal(balanceAfter.outstandingPrincipal.toNumber(), 0, 'Outstanding principal must be ₹0.00 after deletion reversal');

  const summary = await getLoansAuthoritativeSummary(client, TEST_USER_A);
  assert.equal(summary.activeLoansCount, 0, 'Deleted loan must be excluded from active count');
});

test('5. Loan Deletion with EMI History: Reverses both disbursement and EMI payments accurately', async () => {
  const { client, state } = createMockSupabase();

  const bankAccId = '33333333-3333-4333-a333-333333333333';
  const loanId = '44444444-4444-4444-a444-444444444444';

  state.accounts.push({ id: bankAccId, user_id: TEST_USER_A, name: 'Bank', balance: 100000, current_balance: 100000 });
  state.loans.push({ id: loanId, user_id: TEST_USER_A, name: 'Personal Loan', principal_amount: 20000, status: 'active' });

  // Disbursement
  await recordLoanDisbursement(client, {
    userId: TEST_USER_A,
    loanId,
    loanName: 'Personal Loan',
    accountId: bankAccId,
    amount: 20000,
    date: '2026-08-01',
  });

  // EMI 1
  await recordLoanEMI(client, {
    userId: TEST_USER_A,
    loanId,
    accountId: bankAccId,
    principalAmount: 5000,
    interestAmount: 500,
    totalAmount: 5500,
    date: '2026-08-10',
  });

  // Delete loan
  const delRes = await deleteLoanAuthoritative(client, TEST_USER_A, loanId);
  assert.equal(delRes.success, true);
  assert.equal(delRes.reversedEntryCount, 2, 'Must reverse both disbursement and EMI entry');

  const balance = await getLoanAuthoritativeBalance(client, TEST_USER_A, loanId);
  assert.equal(balance.outstandingPrincipal.toNumber(), 0);
  assert.equal(balance.totalInterestPaid.toNumber(), 0);
});

test('6. Cross-User Loan Deletion Rejection: User B cannot delete User A loan', async () => {
  const { client, state } = createMockSupabase({ userId: TEST_USER_B });

  const loanId = '44444444-4444-4444-a444-444444444444';
  state.loans.push({ id: loanId, user_id: TEST_USER_A, name: 'User A Secret Loan', status: 'active' });

  const delRes = await deleteLoanAuthoritative(client, TEST_USER_B, loanId);
  assert.equal(delRes.success, false);
  assert.match(delRes.error!, /Security Violation|not found/i);
});

test('7. Category Entity Separation: Same category UUID creates distinct expense and income accounts', async () => {
  const { client, state } = createMockSupabase();

  const bankAccId = '33333333-3333-4333-a333-333333333333';
  const sharedCatId = '55555555-5555-4555-a555-555555555555';
  state.accounts.push({ id: bankAccId, user_id: TEST_USER_A, name: 'Bank', balance: 50000, current_balance: 50000 });

  // Post expense with sharedCatId
  await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'expense',
    accountId: bankAccId,
    categoryId: sharedCatId,
    amount: '300.00',
    date: '2026-08-19',
    description: 'Expense Entry',
    idempotencyKey: 'TEST:CAT:EXP:001',
  });

  // Post income with sharedCatId
  await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'income',
    accountId: bankAccId,
    categoryId: sharedCatId,
    amount: '800.00',
    date: '2026-08-19',
    description: 'Income Entry',
    idempotencyKey: 'TEST:CAT:INC:001',
  });

  const expAcc = state.ledgerAccounts.find((a) => a.code === `EXP-CAT-${sharedCatId}`);
  const incAcc = state.ledgerAccounts.find((a) => a.code === `INC-CAT-${sharedCatId}`);

  assert.ok(expAcc, 'EXP-CAT account must exist');
  assert.ok(incAcc, 'INC-CAT account must exist');
  assert.notEqual(expAcc.id, incAcc.id, 'Expense and Income accounts must be two distinct ledger accounts');
  assert.equal(expAcc.entity_type, 'expense_category');
  assert.equal(incAcc.entity_type, 'income_category');
});

test('8. Valid UUID Handling for Uncategorized Expense: Assigns reserved general UUID and code EXP-CAT-GENERAL', async () => {
  const { client, state } = createMockSupabase();

  const bankAccId = '33333333-3333-4333-a333-333333333333';
  state.accounts.push({ id: bankAccId, user_id: TEST_USER_A, name: 'Bank', balance: 10000, current_balance: 10000 });

  const res = await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'expense',
    accountId: bankAccId,
    categoryId: null, // No category
    amount: '120.00',
    date: '2026-08-19',
    description: 'Uncategorized expense',
    idempotencyKey: 'TEST:UNCAT:EXP:001',
  });

  assert.equal(res.success, true);
  const genExpAcc = state.ledgerAccounts.find((a) => a.code === 'EXP-CAT-GENERAL');
  assert.ok(genExpAcc);
  assert.equal(genExpAcc.entity_id, SYSTEM_RESERVED_UUIDS.GENERAL_EXPENSE);
  assert.ok(isValidUUID(genExpAcc.entity_id), 'entity_id must be a strictly valid UUID');
});

test('9. Valid UUID Handling for Uncategorized Income: Assigns reserved general UUID and code INC-CAT-GENERAL', async () => {
  const { client, state } = createMockSupabase();

  const bankAccId = '33333333-3333-4333-a333-333333333333';
  state.accounts.push({ id: bankAccId, user_id: TEST_USER_A, name: 'Bank', balance: 10000, current_balance: 10000 });

  const res = await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'income',
    accountId: bankAccId,
    categoryId: null,
    amount: '500.00',
    date: '2026-08-19',
    description: 'Uncategorized income',
    idempotencyKey: 'TEST:UNCAT:INC:001',
  });

  assert.equal(res.success, true);
  const genIncAcc = state.ledgerAccounts.find((a) => a.code === 'INC-CAT-GENERAL');
  assert.ok(genIncAcc);
  assert.equal(genIncAcc.entity_id, SYSTEM_RESERVED_UUIDS.GENERAL_INCOME);
  assert.ok(isValidUUID(genIncAcc.entity_id));
});

test('10. System Entity UUIDs: Capital gain, loss, dividend, opening balance all use valid UUID constants', async () => {
  const { client, state } = createMockSupabase();

  const bankAccId = '33333333-3333-4333-a333-333333333333';
  state.accounts.push({ id: bankAccId, user_id: TEST_USER_A, name: 'Bank', balance: 10000, current_balance: 10000 });

  // Opening balance
  await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'opening_balance',
    accountId: bankAccId,
    amount: '10000.00',
    date: '2026-08-01',
    description: 'Opening balance',
    idempotencyKey: 'TEST:SYS:OPEN',
  });

  // Dividend
  await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'dividend',
    accountId: bankAccId,
    amount: '250.00',
    date: '2026-08-10',
    description: 'Stock dividend',
    idempotencyKey: 'TEST:SYS:DIV',
  });

  // Capital Gain Sale
  await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'investment_sale',
    accountId: bankAccId,
    amount: '1500.00',
    date: '2026-08-15',
    description: 'Stock sale with gain',
    idempotencyKey: 'TEST:SYS:GAIN',
    metadata: { investmentId: '66666666-6666-4666-a666-666666666666', costBasis: 1000 },
  });

  const openAcc = state.ledgerAccounts.find((a) => a.code === 'EQU-OPEN-BAL');
  const divAcc = state.ledgerAccounts.find((a) => a.code === 'INC-DIVIDEND');
  const gainAcc = state.ledgerAccounts.find((a) => a.code === 'INC-CAP-GAIN');

  assert.ok(openAcc);
  assert.ok(divAcc);
  assert.ok(gainAcc);

  assert.ok(isValidUUID(openAcc.entity_id), 'Opening balance entity_id must be valid UUID');
  assert.ok(isValidUUID(divAcc.entity_id), 'Dividend entity_id must be valid UUID');
  assert.ok(isValidUUID(gainAcc.entity_id), 'Capital gain entity_id must be valid UUID');
});

test('11. AI Action Validation: Rejects zero and negative EMI amounts strictly', async () => {
  const { client, state } = createMockSupabase();

  const resZero = await executeAIFinancialAction(client, TEST_USER_A, 'msg-1', {
    actionType: 'loan_emi',
    amount: 0,
    principalAmount: 0,
    interestAmount: 0,
  });

  assert.equal(resZero.success, false);
  assert.match(resZero.error!, /strictly greater than ₹0\.00/i);

  const resNeg = await executeAIFinancialAction(client, TEST_USER_A, 'msg-2', {
    actionType: 'loan_emi',
    amount: -500,
  });

  assert.equal(resNeg.success, false);
  assert.match(resNeg.error!, /strictly greater than ₹0\.00/i);
});

test('12. UUID Normalization Helper: Handles invalid strings and returns fallback safely', () => {
  assert.equal(isValidUUID('GENERAL'), false);
  assert.equal(isValidUUID('12345'), false);
  assert.equal(isValidUUID(SYSTEM_RESERVED_UUIDS.GENERAL_EXPENSE), true);

  const normalized = normalizeEntityUUID('GENERAL', SYSTEM_RESERVED_UUIDS.GENERAL_EXPENSE);
  assert.equal(normalized, SYSTEM_RESERVED_UUIDS.GENERAL_EXPENSE);
});

test('13. High-Precision Trial Balance Invariant: Rejects sub-paise fractions and preserves 2-decimal precision', async () => {
  const { client, state } = createMockSupabase();
  const bankAccId = '33333333-3333-4333-a333-333333333333';
  state.accounts.push({ id: bankAccId, user_id: TEST_USER_A, name: 'Bank', balance: 10000, current_balance: 10000 });

  // Sub-paise amount
  const res = await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'expense',
    accountId: bankAccId,
    amount: '123.456',
    date: '2026-08-19',
    description: 'Fractional paise test',
    idempotencyKey: 'TEST:PAISE:001',
  });

  assert.equal(res.success, true);
  // Total line debits should be exactly 123.46 (rounded to 2 decimal places)
  const line = state.journalLines.find((l) => l.journal_entry_id === res.journalEntryId && Number(l.debit_amount) > 0);
  assert.ok(line);
  assert.equal(Number(line.debit_amount), 123.46);
});

test('14. Idempotency Key Deduping: Concurrent identical submissions return identical journal entry ID without duplicating lines', async () => {
  const { client, state } = createMockSupabase();
  const bankAccId = '33333333-3333-4333-a333-333333333333';
  state.accounts.push({ id: bankAccId, user_id: TEST_USER_A, name: 'Bank', balance: 10000, current_balance: 10000 });

  const [res1, res2] = await Promise.all([
    recordFinancialTransaction(client, {
      userId: TEST_USER_A,
      type: 'expense',
      accountId: bankAccId,
      amount: '500.00',
      date: '2026-08-19',
      description: 'Double click test',
      idempotencyKey: 'TEST:IDEMP:CONCURRENT',
    }),
    recordFinancialTransaction(client, {
      userId: TEST_USER_A,
      type: 'expense',
      accountId: bankAccId,
      amount: '500.00',
      date: '2026-08-19',
      description: 'Double click test',
      idempotencyKey: 'TEST:IDEMP:CONCURRENT',
    }),
  ]);

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.equal(res1.journalEntryId, res2.journalEntryId, 'Must return same journal entry ID');

  const postedEntries = state.journalEntries.filter((j) => j.idempotency_key === 'TEST:IDEMP:CONCURRENT');
  assert.equal(postedEntries.length, 1, 'Must only create exactly one journal entry');
});

test('15. Zero-Amount Rejection: Rejects zero and negative transactions across standard mutations', async () => {
  const { client, state } = createMockSupabase();
  const bankAccId = '33333333-3333-4333-a333-333333333333';
  state.accounts.push({ id: bankAccId, user_id: TEST_USER_A, name: 'Bank', balance: 10000, current_balance: 10000 });

  const resZero = await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'expense',
    accountId: bankAccId,
    amount: '0.00',
    date: '2026-08-19',
    description: 'Zero test',
    idempotencyKey: 'TEST:ZERO:001',
  });

  assert.equal(resZero.success, false);
  assert.match(resZero.error!, /strictly greater than ₹0\.00/i);

  const resNeg = await recordFinancialTransaction(client, {
    userId: TEST_USER_A,
    type: 'income',
    accountId: bankAccId,
    amount: '-100.00',
    date: '2026-08-19',
    description: 'Negative test',
    idempotencyKey: 'TEST:NEG:001',
  });

  assert.equal(resNeg.success, false);
  assert.match(resNeg.error!, /strictly greater than ₹0\.00/i);
});

