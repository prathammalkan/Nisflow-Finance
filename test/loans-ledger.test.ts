import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import {
  ensureLoanLedgerAccounts,
  getLoanAuthoritativeBalance,
  getLoansAuthoritativeSummary,
  getLoanLedgerHistory,
  recordLoanDisbursement,
  recordLoanEMI,
} from '../src/lib/ledger/loans.ts';
import { reverseFinancialTransaction } from '../src/lib/ledger/service.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// In-memory mock database engine for testing
function createMockSupabase(initialState: {
  userId?: string;
  loans?: any[];
  ledgerAccounts?: any[];
  journalEntries?: any[];
  journalLines?: any[];
  accounts?: any[];
} = {}) {
  const defaultUserId = initialState.userId || 'user-uuid-1';
  const state = {
    loans: [...(initialState.loans || [])],
    ledgerAccounts: [...(initialState.ledgerAccounts || [])],
    journalEntries: [...(initialState.journalEntries || [])],
    journalLines: [...(initialState.journalLines || [])],
    accounts: [...(initialState.accounts || [])],
    auditLogs: [] as any[],
  };

  const client: any = {
    auth: {
      getUser: async () => ({ data: { user: { id: defaultUserId } }, error: null }),
    },
    from: (tableName: string) => {
      let currentTable = (state as any)[
        tableName === 'ledger_accounts' ? 'ledgerAccounts' :
        tableName === 'journal_entries' ? 'journalEntries' :
        tableName === 'journal_lines' ? 'journalLines' :
        tableName === 'ledger_audit_log' ? 'auditLogs' :
        tableName
      ] || [];

      let filters: Array<(row: any) => boolean> = [];
      let orderByField: string | null = null;
      let orderAscending = true;

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
        ilike: (col: string, val: any) => {
          filters.push((r: any) => true);
          return builder;
        },
        in: (col: string, vals: any[]) => {
          filters.push((r: any) => {
            if (col.includes('.')) {
              const parts = col.split('.');
              let curr = r;
              for (const p of parts) {
                curr = curr?.[p];
              }
              return vals.includes(curr);
            }
            return vals.includes(r[col]);
          });
          return builder;
        },
        order: (col: string, opts?: { ascending?: boolean }) => {
          orderByField = col;
          orderAscending = opts?.ascending !== false;
          return builder;
        },
        limit: (_n: number) => builder,
        maybeSingle: async () => {
          let rows = currentTable.map((line: any) => {
            if (tableName === 'journal_lines') {
              const entry = state.journalEntries.find(e => e.id === line.journal_entry_id);
              return { ...line, journal_entries: entry || null };
            }
            return line;
          }).filter((r: any) => filters.every(f => f(r)));
          return { data: rows[0] || null, error: null };
        },
        single: async () => {
          let rows = currentTable.map((line: any) => {
            if (tableName === 'journal_lines') {
              const entry = state.journalEntries.find(e => e.id === line.journal_entry_id);
              return { ...line, journal_entries: entry || null };
            }
            return line;
          }).filter((r: any) => filters.every(f => f(r)));
          if (rows.length === 0) return { data: null, error: { message: 'Not found' } };
          return { data: rows[0], error: null };
        },
        then: (resolve: any, reject: any) => {
          let rows = currentTable.map((line: any) => {
            if (tableName === 'journal_lines') {
              const entry = state.journalEntries.find(e => e.id === line.journal_entry_id);
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
            ilike: (col: string, val: any) => {
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

        // Validate debits == credits
        const lines: any[] = typeof p_lines === 'string' ? JSON.parse(p_lines) : p_lines;
        let totalDr = new Decimal(0);
        let totalCr = new Decimal(0);

        for (const l of lines) {
          totalDr = totalDr.plus(new Decimal(l.debit_amount || 0));
          totalCr = totalCr.plus(new Decimal(l.credit_amount || 0));
        }

        if (!totalDr.equals(totalCr)) {
          return { data: null, error: { message: `Trial Balance Violation: Debits (${totalDr}) != Credits (${totalCr})` } };
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
        state.journalEntries.push(entry);

        for (const l of lines) {
          state.journalLines.push({
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

        const original = state.journalEntries.find(e => e.id === p_original_entry_id && e.user_id === p_user_id);
        if (!original) {
          return { data: null, error: { message: 'Original journal entry not found' } };
        }
        if (original.status === 'reversed') {
          return { data: null, error: { message: 'Entry already reversed' } };
        }

        original.status = 'reversed';
        const reversalId = `rev-${Date.now()}`;
        state.journalEntries.push({
          id: reversalId,
          user_id: p_user_id,
          transaction_date: new Date().toISOString().split('T')[0],
          description: `REVERSAL: ${original.description}`,
          source_type: 'reversal',
          idempotency_key: params.p_idempotency_key,
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

      return { data: null, error: { message: `Unknown RPC function ${fnName}` } };
    },
    _state: state,
  };

  return client;
}

// ==========================================
// TEST SUITE: LOANS & EMI LEDGER INTEGRATION
// ==========================================

test('1. Loan liability account provisioning: Creates LIA-LOAN-<id> and EXP-LOAN-INT-<id>', async () => {
  const userId = 'user-1';
  const loanId = 'loan-home-001';
  const supabase = createMockSupabase({ userId });

  const accounts = await ensureLoanLedgerAccounts(supabase, userId, loanId, 'Home Loan');
  assert.ok(accounts.loanLedgerAccId);
  assert.ok(accounts.interestExpenseAccId);

  const liaAcc = supabase._state.ledgerAccounts.find((a: any) => a.id === accounts.loanLedgerAccId);
  assert.equal(liaAcc.code, `LIA-LOAN-${loanId}`);
  assert.equal(liaAcc.account_type, 'liability');
  assert.equal(liaAcc.entity_type, 'loan');

  const expAcc = supabase._state.ledgerAccounts.find((a: any) => a.id === accounts.interestExpenseAccId);
  assert.equal(expAcc.code, `EXP-LOAN-INT-${loanId}`);
  assert.equal(expAcc.account_type, 'expense');
});

test('2. Loan disbursement balanced entry: Posts Dr AST-ACC-<bank> and Cr LIA-LOAN-<id>', async () => {
  const userId = 'user-1';
  const loanId = 'loan-auto-001';
  const bankAccId = 'acc-bank-hdfc';
  const supabase = createMockSupabase({ userId });

  const res = await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    loanName: 'Car Loan',
    accountId: bankAccId,
    amount: '500000.00',
    date: '2026-01-15',
  });

  assert.equal(res.success, true);
  assert.ok(res.journalEntryId);

  const entry = supabase._state.journalEntries.find((e: any) => e.id === res.journalEntryId);
  assert.equal(entry.status, 'posted');
  assert.equal(entry.idempotency_key, `LOAN:DISBURSE:${loanId}`);

  const lines = supabase._state.journalLines.filter((l: any) => l.journal_entry_id === res.journalEntryId);
  assert.equal(lines.length, 2);

  const bankLine = lines.find((l: any) => Number(l.debit_amount) === 500000);
  const loanLine = lines.find((l: any) => Number(l.credit_amount) === 500000);
  assert.ok(bankLine, 'Bank must be debited for received funds');
  assert.ok(loanLine, 'Loan liability must be credited for debt created');

  const balance = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(balance.outstandingPrincipal.toNumber(), 500000);
  assert.equal(balance.isSettled, false);
});

test('3. EMI compound balanced entry: Dr Principal, Dr Interest, Cr Bank (Sum matched)', async () => {
  const userId = 'user-1';
  const loanId = 'loan-personal-001';
  const bankAccId = 'acc-bank-sbi';
  const supabase = createMockSupabase({ userId });

  // Disburse ₹100,000
  await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '100000.00',
  });

  // Record EMI: ₹8,000 Principal + ₹2,000 Interest = ₹10,000 Total
  const emiRes = await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '8000.00',
    interestAmount: '2000.00',
    totalAmount: '10000.00',
    date: '2026-02-15',
  });

  assert.equal(emiRes.success, true);
  assert.equal(emiRes.principalPaid, 8000);
  assert.equal(emiRes.interestPaid, 2000);
  assert.equal(emiRes.totalPaid, 10000);
  assert.equal(emiRes.newRemainingPrincipal, 92000);

  const emiLines = supabase._state.journalLines.filter((l: any) => l.journal_entry_id === emiRes.journalEntryId);
  assert.equal(emiLines.length, 3);

  const principalLine = emiLines.find((l: any) => Number(l.debit_amount) === 8000);
  const interestLine = emiLines.find((l: any) => Number(l.debit_amount) === 2000);
  const bankCreditLine = emiLines.find((l: any) => Number(l.credit_amount) === 10000);

  assert.ok(principalLine, 'Loan liability must be debited by principal component');
  assert.ok(interestLine, 'Interest expense must be debited by interest component');
  assert.ok(bankCreditLine, 'Bank account must be credited for total EMI');
});

test('4. Principal reduction: EMI successively reduces outstanding principal', async () => {
  const userId = 'user-1';
  const loanId = 'loan-002';
  const bankAccId = 'acc-bank-icici';
  const supabase = createMockSupabase({ userId });

  await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '50000.00',
  });

  // Month 1 EMI: ₹5,000 principal
  await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '5000.00',
    interestAmount: '500.00',
    date: '2026-01-01',
  });

  let bal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(bal.outstandingPrincipal.toNumber(), 45000);
  assert.equal(bal.totalPrincipalPaid.toNumber(), 5000);
  assert.equal(bal.totalInterestPaid.toNumber(), 500);

  // Month 2 EMI: ₹10,000 principal
  await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '10000.00',
    interestAmount: '450.00',
    date: '2026-02-01',
  });

  bal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(bal.outstandingPrincipal.toNumber(), 35000);
  assert.equal(bal.totalPrincipalPaid.toNumber(), 15000);
  assert.equal(bal.totalInterestPaid.toNumber(), 950);
});

test('5. Full payoff = ₹0.00: Paying off remaining principal marks loan settled with zero drift', async () => {
  const userId = 'user-1';
  const loanId = 'loan-payoff-001';
  const bankAccId = 'acc-bank-1';
  const supabase = createMockSupabase({ userId });

  await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '25450.75',
  });

  const res = await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '25450.75',
    interestAmount: '125.25',
    totalAmount: '25576.00',
  });

  assert.equal(res.isSettled, true);
  assert.equal(res.newRemainingPrincipal, 0);

  const bal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(bal.outstandingPrincipal.toNumber(), 0);
  assert.equal(bal.isSettled, true);
});

test('6. Overpayment rejection: Reject principal repayment exceeding outstanding loan balance', async () => {
  const userId = 'user-1';
  const loanId = 'loan-overpay-001';
  const bankAccId = 'acc-bank-1';
  const supabase = createMockSupabase({ userId });

  await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '10000.00',
  });

  await assert.rejects(
    async () => {
      await recordLoanEMI(supabase, {
        userId,
        loanId,
        accountId: bankAccId,
        principalAmount: '15000.00', // Exceeds 10,000
        interestAmount: '200.00',
        totalAmount: '15200.00',
      });
    },
    /Overpayment Error: Principal payment of ₹15000.00 exceeds current outstanding loan principal of ₹10000.00/
  );

  // Verify balance remained intact
  const bal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(bal.outstandingPrincipal.toNumber(), 10000);
});

test('7. Duplicate EMI idempotency: Repeating identical idempotency key produces exactly 1 entry', async () => {
  const userId = 'user-1';
  const loanId = 'loan-idemp-001';
  const bankAccId = 'acc-bank-1';
  const supabase = createMockSupabase({ userId });

  await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '50000.00',
  });

  const key = `LOAN:EMI:${loanId}:2026-03-01`;

  const emi1 = await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '5000.00',
    interestAmount: '500.00',
    idempotencyKey: key,
  });

  const emi2 = await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '5000.00',
    interestAmount: '500.00',
    idempotencyKey: key,
  });

  assert.equal(emi1.journalEntryId, emi2.journalEntryId);

  // Journal lines should not be duplicated
  const lines = supabase._state.journalLines.filter((l: any) => l.journal_entry_id === emi1.journalEntryId);
  assert.equal(lines.length, 3);
});

test('8. Concurrent duplicate EMI handling: Multiple simultaneous calls resolve safely', async () => {
  const userId = 'user-1';
  const loanId = 'loan-concurrent-001';
  const bankAccId = 'acc-bank-1';
  const supabase = createMockSupabase({ userId });

  await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '50000.00',
  });

  const key = `LOAN:EMI:${loanId}:2026-04-01`;

  const [res1, res2] = await Promise.all([
    recordLoanEMI(supabase, {
      userId,
      loanId,
      accountId: bankAccId,
      principalAmount: '5000.00',
      interestAmount: '400.00',
      idempotencyKey: key,
    }),
    recordLoanEMI(supabase, {
      userId,
      loanId,
      accountId: bankAccId,
      principalAmount: '5000.00',
      interestAmount: '400.00',
      idempotencyKey: key,
    }),
  ]);

  assert.equal(res1.journalEntryId, res2.journalEntryId);
  const bal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(bal.outstandingPrincipal.toNumber(), 45000);
});

test('9. EMI reversal restores principal: Reversing EMI journal restores previous balance', async () => {
  const userId = 'user-1';
  const loanId = 'loan-rev-001';
  const bankAccId = 'acc-bank-1';
  const supabase = createMockSupabase({ userId });

  await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '40000.00',
  });

  const emiRes = await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '10000.00',
    interestAmount: '800.00',
    date: '2026-05-01',
  });

  let bal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(bal.outstandingPrincipal.toNumber(), 30000);
  assert.equal(bal.totalInterestPaid.toNumber(), 800);

  // Reverse the EMI entry
  const rev = await reverseFinancialTransaction(supabase, {
    userId,
    journalEntryId: emiRes.journalEntryId!,
    reason: 'Incorrect EMI calculation',
  });
  assert.equal(rev.success, true);

  // Authoritative balance is immediately restored to ₹40,000
  bal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(bal.outstandingPrincipal.toNumber(), 40000);
  assert.equal(bal.totalInterestPaid.toNumber(), 0);
});

test('10. Cross-user loan/account rejection: User A cannot query or post against User B loan', async () => {
  const userA = 'user-a';
  const userB = 'user-b';
  const loanIdB = 'loan-b-001';
  const supabase = createMockSupabase({
    userId: userA,
    loans: [
      { id: loanIdB, user_id: userB, name: 'User B Secret Loan', principal_amount: 100000 },
    ],
  });

  await assert.rejects(
    async () => {
      await ensureLoanLedgerAccounts(supabase, userA, loanIdB);
    },
    /Security Violation/
  );

  await assert.rejects(
    async () => {
      await getLoanAuthoritativeBalance(supabase, userA, loanIdB);
    },
    /Security Violation/
  );
});

test('11. Ledger balance remains correct if legacy loan balance is stale/deleted', async () => {
  const userId = 'user-1';
  const loanId = 'loan-stale-001';
  const bankAccId = 'acc-bank-1';
  const supabase = createMockSupabase({
    userId,
    loans: [
      { id: loanId, user_id: userId, name: 'Stale Loan', principal_amount: 50000, remaining_principal: 999999 }, // Corrupted legacy field
    ],
  });

  await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '50000.00',
  });

  await recordLoanEMI(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    principalAmount: '12000.00',
    interestAmount: '1000.00',
  });

  // Corrupted legacy row has zero influence on authoritative calculation
  const bal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(bal.outstandingPrincipal.toNumber(), 38000);
  assert.equal(bal.totalPrincipalPaid.toNumber(), 12000);
});

test('12. Projection failure does not invalidate the committed ledger entry', async () => {
  const userId = 'user-1';
  const loanId = 'loan-proj-001';
  const bankAccId = 'acc-bank-1';
  const supabase = createMockSupabase({ userId });

  // Post disbursement
  const disburse = await recordLoanDisbursement(supabase, {
    userId,
    loanId,
    accountId: bankAccId,
    amount: '30000.00',
  });
  assert.equal(disburse.success, true);

  // Even if loans table update failed or row is missing, the double-entry lines remain committed
  const lines = supabase._state.journalLines.filter((l: any) => l.journal_entry_id === disburse.journalEntryId);
  assert.equal(lines.length, 2);

  const bal = await getLoanAuthoritativeBalance(supabase, userId, loanId);
  assert.equal(bal.outstandingPrincipal.toNumber(), 30000);
});
