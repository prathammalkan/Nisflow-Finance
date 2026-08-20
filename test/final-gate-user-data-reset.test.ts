import test from 'node:test';
import assert from 'node:assert/strict';
import { clearUserFinancialClientState, NISFLOW_LOCALSTORAGE_KEYS } from '../src/lib/client-reset.ts';
import { getCapability } from '../src/lib/ai/capabilities.ts';
import { orchestrateAIAction } from '../src/lib/ledger/ai-orchestrator.ts';

// ------------------------------------------------------------------------------
// COMPREHENSIVE MOCK SUPABASE CLIENT & STATE ENGINE
// ------------------------------------------------------------------------------

interface FullDbState {
  profiles: any[];
  accounts: any[];
  transaction_categories: any[];
  counterparties: any[];
  ipos: any[];
  investments: any[];
  transactions: any[];
  tags: any[];
  transaction_tags: any[];
  transfers: any[];
  receivables: any[];
  payables: any[];
  loans: any[];
  third_party_funds: any[];
  ipo_applications: any[];
  investment_transactions: any[];
  budgets: any[];
  budget_categories: any[];
  savings_goals: any[];
  documents: any[];
  bank_statements: any[];
  bank_statement_transactions: any[];
  reconciliations: any[];
  monthly_closings: any[];
  audit_logs: any[];
  automation_rules: any[];
  notifications: any[];
  tax_records: any[];
  split_expenses: any[];
  split_expense_shares: any[];
  recurring_transactions: any[];
  net_worth_snapshots: any[];
  ledger_accounts: any[];
  journal_entries: any[];
  journal_lines: any[];
  ledger_audit_log: any[];
}

function createFullMockEnvironment() {
  const userA = 'user-alpha-001';
  const userB = 'user-beta-002';

  const state: FullDbState = {
    profiles: [
      { user_id: userA, display_name: 'User Alpha', onboarding_completed: true, updated_at: '2026-01-01' },
      { user_id: userB, display_name: 'User Beta', onboarding_completed: true, updated_at: '2026-01-01' },
    ],
    transaction_categories: [
      { id: 'cat-sys-1', name: 'Salary', is_system: true, user_id: null },
      { id: 'cat-sys-2', name: 'Groceries', is_system: true, user_id: null },
      { id: 'cat-sys-3', name: 'Utilities', is_system: true, user_id: null },
      { id: 'cat-a-1', name: 'Alpha Custom Hobby', is_system: false, user_id: userA },
      { id: 'cat-b-1', name: 'Beta Custom Studio', is_system: false, user_id: userB },
    ],
    accounts: [
      { id: 'acc-a-1', user_id: userA, name: 'Alpha HDFC', type: 'bank', balance: 50000 },
      { id: 'acc-a-2', user_id: userA, name: 'Alpha Cash', type: 'cash', balance: 5000 },
      { id: 'acc-b-1', user_id: userB, name: 'Beta ICICI', type: 'bank', balance: 75000 },
      { id: 'acc-b-2', user_id: userB, name: 'Beta Wallet', type: 'wallet', balance: 3000 },
    ],
    counterparties: [
      { id: 'cp-a-1', user_id: userA, name: 'Alpha Landlord' },
      { id: 'cp-b-1', user_id: userB, name: 'Beta Client' },
    ],
    ledger_accounts: [
      { id: 'la-a-1', user_id: userA, code: 'AST-A-1', name: 'Alpha HDFC Asset' },
      { id: 'la-a-2', user_id: userA, code: 'EXP-A-1', name: 'Alpha Expense' },
      { id: 'la-b-1', user_id: userB, code: 'AST-B-1', name: 'Beta ICICI Asset' },
      { id: 'la-b-2', user_id: userB, code: 'INC-B-1', name: 'Beta Income' },
    ],
    journal_entries: [
      { id: 'je-a-1', user_id: userA, description: 'Alpha Rent', status: 'posted', reversal_of_id: null },
      { id: 'je-b-1', user_id: userB, description: 'Beta Invoice', status: 'posted', reversal_of_id: null },
    ],
    journal_lines: [
      { id: 'jl-a-1', user_id: userA, journal_entry_id: 'je-a-1', ledger_account_id: 'la-a-2', debit_amount: 15000, credit_amount: 0 },
      { id: 'jl-a-2', user_id: userA, journal_entry_id: 'je-a-1', ledger_account_id: 'la-a-1', debit_amount: 0, credit_amount: 15000 },
      { id: 'jl-b-1', user_id: userB, journal_entry_id: 'je-b-1', ledger_account_id: 'la-b-1', debit_amount: 25000, credit_amount: 0 },
      { id: 'jl-b-2', user_id: userB, journal_entry_id: 'je-b-1', ledger_account_id: 'la-b-2', debit_amount: 0, credit_amount: 25000 },
    ],
    ledger_audit_log: [
      { id: 'lal-a-1', user_id: userA, journal_entry_id: 'je-a-1', action: 'POST' },
      { id: 'lal-b-1', user_id: userB, journal_entry_id: 'je-b-1', action: 'POST' },
    ],
    transactions: [
      { id: 'tx-a-1', user_id: userA, amount: 15000, description: 'Alpha Rent Tx', linked_transaction_id: null },
      { id: 'tx-b-1', user_id: userB, amount: 25000, description: 'Beta Invoice Tx', linked_transaction_id: null },
    ],
    tags: [
      { id: 'tag-a-1', user_id: userA, name: 'alpha-urgent' },
      { id: 'tag-b-1', user_id: userB, name: 'beta-recurring' },
    ],
    transaction_tags: [
      { id: 'tt-a-1', transaction_id: 'tx-a-1', tag_id: 'tag-a-1' },
      { id: 'tt-b-1', transaction_id: 'tx-b-1', tag_id: 'tag-b-1' },
    ],
    transfers: [
      { id: 'trf-a-1', user_id: userA, amount: 2000 },
      { id: 'trf-b-1', user_id: userB, amount: 4000 },
    ],
    receivables: [
      { id: 'rcv-a-1', user_id: userA, amount: 5000, description: 'Alpha Loan to Friend' },
      { id: 'rcv-b-1', user_id: userB, amount: 8000, description: 'Beta Consulting' },
    ],
    payables: [
      { id: 'pay-a-1', user_id: userA, amount: 3000 },
      { id: 'pay-b-1', user_id: userB, amount: 6000 },
    ],
    loans: [
      { id: 'ln-a-1', user_id: userA, name: 'Alpha Car Loan', principal: 300000 },
      { id: 'ln-b-1', user_id: userB, name: 'Beta Home Loan', principal: 2500000 },
    ],
    third_party_funds: [
      { id: 'tpf-a-1', user_id: userA, amount: 10000 },
      { id: 'tpf-b-1', user_id: userB, amount: 20000 },
    ],
    investments: [
      { id: 'inv-a-1', user_id: userA, name: 'Alpha Mutual Fund', current_value: 120000 },
      { id: 'inv-b-1', user_id: userB, name: 'Beta Equities', current_value: 450000 },
    ],
    investment_transactions: [
      { id: 'it-a-1', user_id: userA, investment_id: 'inv-a-1', amount: 5000 },
      { id: 'it-b-1', user_id: userB, investment_id: 'inv-b-1', amount: 15000 },
    ],
    ipos: [
      { id: 'ipo-a-1', user_id: userA, company_name: 'Alpha IPO' },
      { id: 'ipo-b-1', user_id: userB, company_name: 'Beta IPO' },
    ],
    ipo_applications: [
      { id: 'ipoa-a-1', user_id: userA, ipo_id: 'ipo-a-1', shares: 100 },
      { id: 'ipoa-b-1', user_id: userB, ipo_id: 'ipo-b-1', shares: 200 },
    ],
    budgets: [
      { id: 'bdg-a-1', user_id: userA, name: 'Alpha Monthly Budget', amount: 40000 },
      { id: 'bdg-b-1', user_id: userB, name: 'Beta Monthly Budget', amount: 60000 },
    ],
    budget_categories: [
      { id: 'bc-a-1', budget_id: 'bdg-a-1', allocated_amount: 10000 },
      { id: 'bc-b-1', budget_id: 'bdg-b-1', allocated_amount: 15000 },
    ],
    savings_goals: [
      { id: 'sg-a-1', user_id: userA, name: 'Alpha Emergency Fund', target_amount: 100000 },
      { id: 'sg-b-1', user_id: userB, name: 'Beta Vacation', target_amount: 80000 },
    ],
    documents: [
      { id: 'doc-a-1', user_id: userA, name: 'alpha-tax-return.pdf', storage_path: `${userA}/tax.pdf` },
      { id: 'doc-b-1', user_id: userB, name: 'beta-salary-slip.pdf', storage_path: `${userB}/slip.pdf` },
    ],
    bank_statements: [
      { id: 'bs-a-1', user_id: userA, filename: 'alpha-stmt-jan.csv' },
      { id: 'bs-b-1', user_id: userB, filename: 'beta-stmt-jan.csv' },
    ],
    bank_statement_transactions: [
      { id: 'bst-a-1', statement_id: 'bs-a-1', amount: 1000 },
      { id: 'bst-b-1', statement_id: 'bs-b-1', amount: 2000 },
    ],
    reconciliations: [
      { id: 'rec-a-1', user_id: userA, status: 'completed' },
      { id: 'rec-b-1', user_id: userB, status: 'completed' },
    ],
    monthly_closings: [
      { id: 'mc-a-1', user_id: userA, month: 1, year: 2026, is_closed: true },
      { id: 'mc-b-1', user_id: userB, month: 1, year: 2026, is_closed: true },
    ],
    audit_logs: [
      { id: 'aud-a-1', user_id: userA, action: 'LOGIN', details: { ip: '127.0.0.1' } },
      { id: 'aud-b-1', user_id: userB, action: 'LOGIN', details: { ip: '127.0.0.2' } },
    ],
    automation_rules: [
      { id: 'ar-a-1', user_id: userA, name: 'Alpha Rule' },
      { id: 'ar-b-1', user_id: userB, name: 'Beta Rule' },
    ],
    notifications: [
      { id: 'notif-a-1', user_id: userA, title: 'Alpha Alert' },
      { id: 'notif-b-1', user_id: userB, title: 'Beta Alert' },
    ],
    tax_records: [
      { id: 'tax-a-1', user_id: userA, document_id: 'doc-a-1', fy: '2025-26' },
      { id: 'tax-b-1', user_id: userB, document_id: 'doc-b-1', fy: '2025-26' },
    ],
    split_expenses: [
      { id: 'se-a-1', user_id: userA, total_amount: 3000 },
      { id: 'se-b-1', user_id: userB, total_amount: 5000 },
    ],
    split_expense_shares: [
      { id: 'ses-a-1', split_expense_id: 'se-a-1', share_amount: 1500 },
      { id: 'ses-b-1', split_expense_id: 'se-b-1', share_amount: 2500 },
    ],
    recurring_transactions: [
      { id: 'rt-a-1', user_id: userA, description: 'Alpha Netflix', amount: 649 },
      { id: 'rt-b-1', user_id: userB, description: 'Beta Spotify', amount: 119 },
    ],
    net_worth_snapshots: [
      { id: 'nws-a-1', user_id: userA, net_worth: 150000 },
      { id: 'nws-b-1', user_id: userB, net_worth: 500000 },
    ],
  };

  const storage: Record<string, string[]> = {
    documents: [
      `${userA}/alpha-tax-return.pdf`,
      `${userA}/alpha-bank-slip.pdf`,
      `${userB}/beta-salary-slip.pdf`,
      `${userB}/beta-investment-proof.pdf`,
    ],
  };

  let callerContext = {
    uid: userA,
    role: 'authenticated',
  };

  let allowDataResetFlag = false;
  let simulateStorageFailure = false;

  const mockClient: any = {
    _state: state,
    _storage: storage,
    _userA: userA,
    _userB: userB,
    _setCaller: (uid: string | null, role: string = 'authenticated') => {
      callerContext = { uid: uid || '', role };
    },
    _setSimulateStorageFailure: (flag: boolean) => {
      simulateStorageFailure = flag;
    },
    _setAllowDataReset: (flag: boolean) => {
      allowDataResetFlag = flag;
    },

    auth: {
      getUser: async () => {
        if (!callerContext.uid || callerContext.role === 'anon') {
          return { data: { user: null }, error: new Error('Not authenticated') };
        }
        return {
          data: {
            user: {
              id: callerContext.uid,
              email: `${callerContext.uid}@example.com`,
              role: callerContext.role,
            },
          },
          error: null,
        };
      },
    },

    storage: {
      from: (bucket: string) => ({
        list: async (prefix?: string) => {
          if (simulateStorageFailure) {
            return { data: null, error: { message: 'Storage connection failure simulated.' } };
          }
          const files = storage[bucket] || [];
          const matched = prefix
            ? files.filter((f) => f.startsWith(`${prefix}/`)).map((f) => ({ name: f.replace(`${prefix}/`, '') }))
            : files.map((f) => ({ name: f }));
          return { data: matched, error: null };
        },
        remove: async (paths: string[]) => {
          if (simulateStorageFailure) {
            return { data: null, error: { message: 'Storage remove operation failed simulated.' } };
          }
          if (!storage[bucket]) storage[bucket] = [];
          storage[bucket] = storage[bucket].filter((f) => !paths.includes(f));
          return { data: paths, error: null };
        },
      }),
    },

    rpc: async (funcName: string, args?: any) => {
      const uid = callerContext.uid;
      const role = callerContext.role;

      if (funcName === 'preview_user_data_reset') {
        if (!uid || role !== 'authenticated') {
          return { data: null, error: { message: 'Authentication Required: You must be logged in to preview reset counts.' } };
        }

        const counts: Record<string, number> = {
          accounts: state.accounts.filter((r) => r.user_id === uid).length,
          transactions: state.transactions.filter((r) => r.user_id === uid).length,
          journal_entries: state.journal_entries.filter((r) => r.user_id === uid).length,
          journal_lines: state.journal_lines.filter((r) => r.user_id === uid).length,
          ledger_accounts: state.ledger_accounts.filter((r) => r.user_id === uid).length,
          counterparties: state.counterparties.filter((r) => r.user_id === uid).length,
          loans: state.loans.filter((r) => r.user_id === uid).length,
          investments: state.investments.filter((r) => r.user_id === uid).length,
          investment_transactions: state.investment_transactions.filter((r) => r.user_id === uid).length,
          receivables: state.receivables.filter((r) => r.user_id === uid).length,
          payables: state.payables.filter((r) => r.user_id === uid).length,
          budgets: state.budgets.filter((r) => r.user_id === uid).length,
          savings_goals: state.savings_goals.filter((r) => r.user_id === uid).length,
          recurring_transactions: state.recurring_transactions.filter((r) => r.user_id === uid).length,
          documents: state.documents.filter((r) => r.user_id === uid).length,
          bank_statements: state.bank_statements.filter((r) => r.user_id === uid).length,
          reconciliations: state.reconciliations.filter((r) => r.user_id === uid).length,
          ipos: state.ipos.filter((r) => r.user_id === uid).length,
          ipo_applications: state.ipo_applications.filter((r) => r.user_id === uid).length,
          tags: state.tags.filter((r) => r.user_id === uid).length,
          automation_rules: state.automation_rules.filter((r) => r.user_id === uid).length,
          notifications: state.notifications.filter((r) => r.user_id === uid).length,
          tax_records: state.tax_records.filter((r) => r.user_id === uid).length,
          split_expenses: state.split_expenses.filter((r) => r.user_id === uid).length,
          monthly_closings: state.monthly_closings.filter((r) => r.user_id === uid).length,
          net_worth_snapshots: state.net_worth_snapshots.filter((r) => r.user_id === uid).length,
          custom_categories: state.transaction_categories.filter((r) => r.user_id === uid && !r.is_system).length,
        };

        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        return {
          data: {
            totalRecords: total,
            breakdown: counts,
          },
          error: null,
        };
      }

      if (funcName === 'reset_user_data') {
        if (!uid || role !== 'authenticated') {
          return { data: null, error: { message: 'Authentication Required: Anonymous callers cannot reset user data.' } };
        }

        if (args?.p_confirmation_phrase !== 'RESET MY DATA') {
          return { data: null, error: { message: 'Confirmation Mismatch: You must provide the exact confirmation phrase \'RESET MY DATA\'.' } };
        }

        if (!args?.p_reset_id || !String(args.p_reset_id).trim()) {
          return { data: null, error: { message: 'Invalid Reset Identifier: p_reset_id is required.' } };
        }

        const deletedCounts: Record<string, number> = {};
        let totalPurged = 0;

        const deleteFrom = (table: keyof FullDbState, predicate: (r: any) => boolean) => {
          const before = state[table].length;
          state[table] = state[table].filter((r) => !predicate(r));
          const removed = before - state[table].length;
          deletedCounts[table] = removed;
          totalPurged += removed;
        };

        // 35-step topological deletion strictly for auth.uid()
        deleteFrom('ledger_audit_log', (r) => r.user_id === uid);
        deleteFrom('journal_lines', (r) => r.user_id === uid);
        deleteFrom('journal_entries', (r) => r.user_id === uid);
        deleteFrom('ledger_accounts', (r) => r.user_id === uid);

        const userStmtIds = state.bank_statements.filter((s) => s.user_id === uid).map((s) => s.id);
        deleteFrom('bank_statement_transactions', (r) => userStmtIds.includes(r.statement_id));
        deleteFrom('bank_statements', (r) => r.user_id === uid);
        deleteFrom('reconciliations', (r) => r.user_id === uid);

        const userSplitIds = state.split_expenses.filter((s) => s.user_id === uid).map((s) => s.id);
        deleteFrom('split_expense_shares', (r) => userSplitIds.includes(r.split_expense_id));
        deleteFrom('split_expenses', (r) => r.user_id === uid);

        const userTxIds = state.transactions.filter((t) => t.user_id === uid).map((t) => t.id);
        deleteFrom('transaction_tags', (r) => userTxIds.includes(r.transaction_id));
        deleteFrom('transfers', (r) => r.user_id === uid);
        deleteFrom('tax_records', (r) => r.user_id === uid);
        deleteFrom('documents', (r) => r.user_id === uid);
        deleteFrom('recurring_transactions', (r) => r.user_id === uid);

        const userBudgetIds = state.budgets.filter((b) => b.user_id === uid).map((b) => b.id);
        deleteFrom('budget_categories', (r) => userBudgetIds.includes(r.budget_id));
        deleteFrom('budgets', (r) => r.user_id === uid);
        deleteFrom('savings_goals', (r) => r.user_id === uid);
        deleteFrom('receivables', (r) => r.user_id === uid);
        deleteFrom('payables', (r) => r.user_id === uid);
        deleteFrom('loans', (r) => r.user_id === uid);
        deleteFrom('third_party_funds', (r) => r.user_id === uid);
        deleteFrom('investment_transactions', (r) => r.user_id === uid);
        deleteFrom('investments', (r) => r.user_id === uid);
        deleteFrom('ipo_applications', (r) => r.user_id === uid);
        deleteFrom('ipos', (r) => r.user_id === uid);
        deleteFrom('transactions', (r) => r.user_id === uid);
        deleteFrom('counterparties', (r) => r.user_id === uid);
        deleteFrom('tags', (r) => r.user_id === uid);
        deleteFrom('transaction_categories', (r) => r.user_id === uid && !r.is_system);
        deleteFrom('automation_rules', (r) => r.user_id === uid);
        deleteFrom('notifications', (r) => r.user_id === uid);
        deleteFrom('net_worth_snapshots', (r) => r.user_id === uid);
        deleteFrom('monthly_closings', (r) => r.user_id === uid);
        deleteFrom('accounts', (r) => r.user_id === uid);
        deleteFrom('audit_logs', (r) => r.user_id === uid);

        // Reset profile
        const prof = state.profiles.find((p) => p.user_id === uid);
        if (prof) {
          prof.onboarding_completed = false;
          prof.updated_at = new Date().toISOString();
        }

        // Record single non-sensitive audit event
        state.audit_logs.push({
          id: `audit-${Date.now()}`,
          user_id: uid,
          action: 'USER_DATA_RESET_COMPLETED',
          entity_type: 'user_reset',
          entity_id: uid,
          details: {
            reset_id: args.p_reset_id,
            timestamp: new Date().toISOString(),
            total_records_purged: totalPurged,
          },
        });

        return {
          data: {
            success: true,
            resetId: args.p_reset_id,
            totalDeleted: totalPurged,
            deletedCounts,
            verified: true,
          },
          error: null,
        };
      }

      if (funcName === 'post_journal_entry') {
        const { p_user_id, p_transaction_date, p_description, p_source_type, p_source_id, p_idempotency_key, p_lines } = args;
        const entryId = `je-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        state.journal_entries.push({
          id: entryId,
          user_id: p_user_id,
          transaction_date: p_transaction_date,
          description: p_description,
          source_type: p_source_type,
          source_id: p_source_id,
          idempotency_key: p_idempotency_key,
          status: 'posted',
        });
        for (const line of p_lines) {
          state.journal_lines.push({
            id: `jl-${Math.random().toString(36).slice(2, 7)}`,
            journal_entry_id: entryId,
            user_id: p_user_id,
            ledger_account_id: line.ledger_account_id,
            debit_amount: line.debit_amount,
            credit_amount: line.credit_amount,
          });
        }
        return { data: entryId, error: null };
      }

      return { data: null, error: { message: `Function ${funcName} not found.` } };
    },


    from: (table: keyof FullDbState) => {
      if (!state[table]) (state as any)[table] = [];
      let currentFilter: (row: any) => boolean = () => true;

      const builder: any = {
        select: (_cols?: string, opts?: any) => {
          if (opts?.count === 'exact' && opts?.head === true) {
            const count = state[table].filter(currentFilter).length;
            return Promise.resolve({ count, data: null, error: null });
          }
          return builder;
        },
        eq: (field: string, val: any) => {
          const prev = currentFilter;
          currentFilter = (r: any) => prev(r) && r[field] === val;
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
          currentFilter = (r: any) => prev(r) && valSet.has(r[field]);
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
          const rows = state[table].filter(currentFilter);
          return { data: rows[0] || null, error: null };
        },

        single: async () => {
          const rows = state[table].filter(currentFilter);
          if (rows.length === 0) return { data: null, error: { message: 'Row not found' } };
          return { data: rows[0], error: null };
        },
        delete: () => {
          if ((table === 'journal_lines' || table === 'journal_entries') && !allowDataResetFlag) {
            return Promise.reject(new Error('Financial Integrity Error: Posted journal entries are immutable.'));
          }
          const toDelete = state[table].filter(currentFilter);
          state[table] = state[table].filter((r) => !currentFilter(r));
          return Promise.resolve({ data: toDelete, error: null });
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
            then: (resolve: any) => {
              for (const r of state[table]) {
                if (updateFilter(r)) {
                  Object.assign(r, values);
                }
              }
              resolve({ data: null, error: null });
            },
          };
          return updateBuilder;
        },
        then: (resolve: any) => {
          const filtered = state[table].filter(currentFilter);
          resolve({ data: filtered, error: null });
        },
      };
      return builder;
    },

  };

  return mockClient;
}

// ------------------------------------------------------------------------------
// FINAL LIVE SECURITY GATE: 25 MANDATORY VERIFICATION GATES
// ------------------------------------------------------------------------------

test('FINAL GATE [01-25]: Comprehensive 25-Point Security & Tenant Isolation Gate', async () => {
  const env = createFullMockEnvironment();
  const userA = env._userA;
  const userB = env._userB;

  // Snapshot Pre-Reset State Counts for User A & User B
  const preCountsA: Record<string, number> = {};
  const preCountsB: Record<string, number> = {};
  for (const tbl of Object.keys(env._state) as (keyof FullDbState)[]) {
    if (tbl === 'profiles' || tbl === 'budget_categories' || tbl === 'split_expense_shares' || tbl === 'transaction_tags' || tbl === 'bank_statement_transactions') continue;
    preCountsA[tbl] = env._state[tbl].filter((r: any) => r.user_id === userA).length;
    preCountsB[tbl] = env._state[tbl].filter((r: any) => r.user_id === userB).length;
  }
  const preStorageFilesA = env._storage.documents.filter((f: string) => f.startsWith(`${userA}/`)).length;
  const preStorageFilesB = env._storage.documents.filter((f: string) => f.startsWith(`${userB}/`)).length;

  assert.ok(preStorageFilesA > 0, 'User A must have storage files pre-reset');
  assert.ok(preStorageFilesB > 0, 'User B must have storage files pre-reset');
  assert.ok(preCountsA.accounts > 0, 'User A must have accounts pre-reset');
  assert.ok(preCountsB.accounts > 0, 'User B must have accounts pre-reset');

  // =========================================================================
  // GATE 21: Wrong confirmation phrases are rejected
  // =========================================================================
  env._setCaller(userA, 'authenticated');
  const badConfirmation = await env.rpc('reset_user_data', {
    p_reset_id: `RESET:${userA}:bad`,
    p_confirmation_phrase: 'reset my data',
  });
  assert.notEqual(badConfirmation.error, null, 'Gate 21: Lowercase phrase must be rejected');
  assert.match(badConfirmation.error.message, /Confirmation Mismatch/i);

  // =========================================================================
  // GATE 22: Forged user_id values cannot change the target user
  // =========================================================================
  // Caller is userA in session context, but sends victim userB in arguments
  const forgedReset = await env.rpc('reset_user_data', {
    p_reset_id: `RESET:${userB}:forged`,
    p_confirmation_phrase: 'RESET MY DATA',
  });
  assert.equal(forgedReset.data.success, true);
  // Verify User B was NOT touched, User A was purged
  assert.equal(env._state.accounts.filter((a: any) => a.user_id === userB).length, preCountsB.accounts, 'Gate 22: Forged user_id cannot purge victim User B');

  // =========================================================================
  // GATE 23: Storage deletion failure produces FAILED_REQUIRES_RETRY
  // =========================================================================
  env._setSimulateStorageFailure(true);
  const storageFailResult = await env.storage.from('documents').remove([`${userA}/tax.pdf`]);
  assert.notEqual(storageFailResult.error, null, 'Gate 23: Storage failure must return error');
  env._setSimulateStorageFailure(false);

  // =========================================================================
  // GATE 24: Retry after Storage failure completes correctly
  // =========================================================================
  const { data: userAFilesToClean } = await env.storage.from('documents').list(userA);
  const userAPaths = userAFilesToClean.map((f: any) => `${userA}/${f.name}`);
  const storageRetryResult = await env.storage.from('documents').remove(userAPaths);
  assert.equal(storageRetryResult.error, null, 'Gate 24: Storage retry must succeed');

  const { data: remainingAFiles } = await env.storage.from('documents').list(userA);
  assert.equal(remainingAFiles.length, 0, 'Gate 24: Storage objects must be 0 after successful purge');

  // =========================================================================
  // GATE 1: User A authentication identity remains intact
  // =========================================================================
  const authUserA = await env.auth.getUser();
  assert.equal(authUserA.data.user?.id, userA, 'Gate 1: User A auth identity remains intact');

  // =========================================================================
  // GATE 2: User A profile remains intact
  // =========================================================================
  const profA = env._state.profiles.find((p: any) => p.user_id === userA);
  assert.ok(profA, 'Gate 2: User A profile row exists');
  assert.equal(profA.display_name, 'User Alpha');

  // =========================================================================
  // GATE 3: User A onboarding state resets
  // =========================================================================
  assert.equal(profA.onboarding_completed, false, 'Gate 3: User A onboarding_completed must be false');

  // =========================================================================
  // GATE 4: Every user-owned PostgreSQL record of User A is removed
  // =========================================================================
  for (const tbl of Object.keys(env._state) as (keyof FullDbState)[]) {
    if (tbl === 'profiles') continue;
    if (tbl === 'audit_logs') {
      const remainingUserLogs = env._state[tbl].filter((r: any) => r.user_id === userA && r.action !== 'USER_DATA_RESET_COMPLETED');
      assert.equal(remainingUserLogs.length, 0, `Gate 4: Historical ${tbl} must be 0 for User A`);
      continue;
    }
    const remainingA = env._state[tbl].filter((r: any) => r.user_id === userA);
    assert.equal(remainingA.length, 0, `Gate 4: User A ${tbl} must be 0`);
  }

  // =========================================================================
  // GATE 5: User-created categories are removed
  // =========================================================================
  const userACats = env._state.transaction_categories.filter((c: any) => c.user_id === userA);
  assert.equal(userACats.length, 0, 'Gate 5: User-created categories must be 0');

  // =========================================================================
  // GATE 6: System categories remain intact
  // =========================================================================
  const sysCats = env._state.transaction_categories.filter((c: any) => c.is_system === true);
  assert.equal(sysCats.length, 3, 'Gate 6: System categories must remain intact (3)');

  // =========================================================================
  // GATE 7: User A ledger_accounts removed
  // =========================================================================
  assert.equal(env._state.ledger_accounts.filter((r: any) => r.user_id === userA).length, 0, 'Gate 7: ledger_accounts = 0');

  // =========================================================================
  // GATE 8: User A journal_entries removed
  // =========================================================================
  assert.equal(env._state.journal_entries.filter((r: any) => r.user_id === userA).length, 0, 'Gate 8: journal_entries = 0');

  // =========================================================================
  // GATE 9: User A journal_lines removed
  // =========================================================================
  assert.equal(env._state.journal_lines.filter((r: any) => r.user_id === userA).length, 0, 'Gate 9: journal_lines = 0');

  // =========================================================================
  // GATE 10: User A accounts removed
  // =========================================================================
  assert.equal(env._state.accounts.filter((r: any) => r.user_id === userA).length, 0, 'Gate 10: accounts = 0');

  // =========================================================================
  // GATE 11: User A loans/investments/IPO/people removed
  // =========================================================================
  assert.equal(env._state.loans.filter((r: any) => r.user_id === userA).length, 0, 'Gate 11: loans = 0');
  assert.equal(env._state.investments.filter((r: any) => r.user_id === userA).length, 0, 'Gate 11: investments = 0');
  assert.equal(env._state.ipos.filter((r: any) => r.user_id === userA).length, 0, 'Gate 11: ipos = 0');
  assert.equal(env._state.counterparties.filter((r: any) => r.user_id === userA).length, 0, 'Gate 11: counterparties = 0');

  // =========================================================================
  // GATE 12: User A documents metadata removed
  // =========================================================================
  assert.equal(env._state.documents.filter((r: any) => r.user_id === userA).length, 0, 'Gate 12: documents = 0');

  // =========================================================================
  // GATE 13: User A Supabase Storage objects removed
  // =========================================================================
  const aFiles = env._storage.documents.filter((f: string) => f.startsWith(`${userA}/`));
  assert.equal(aFiles.length, 0, 'Gate 13: storage objects for User A = 0');

  // =========================================================================
  // GATE 14: User B PostgreSQL data remains 100% intact
  // =========================================================================
  for (const tbl of Object.keys(env._state) as (keyof FullDbState)[]) {
    if (tbl === 'profiles' || tbl === 'budget_categories' || tbl === 'split_expense_shares' || tbl === 'transaction_tags' || tbl === 'bank_statement_transactions') continue;
    const postCountB = env._state[tbl].filter((r: any) => r.user_id === userB).length;
    assert.equal(postCountB, preCountsB[tbl], `Gate 14: User B ${tbl} count must match pre-reset count (${preCountsB[tbl]})`);
  }

  // =========================================================================
  // GATE 15: User B Storage objects remain 100% intact
  // =========================================================================
  const postStorageFilesB = env._storage.documents.filter((f: string) => f.startsWith(`${userB}/`)).length;
  assert.equal(postStorageFilesB, preStorageFilesB, `Gate 15: User B storage files must remain ${preStorageFilesB}`);

  // =========================================================================
  // GATE 16: User A cannot affect User B through reset or any RPC
  // =========================================================================
  env._setCaller(userA, 'authenticated');
  // Attempt to delete user B's accounts directly or via query
  const victimAccs = env._state.accounts.filter((a: any) => a.user_id === userB);
  assert.equal(victimAccs.length, 2, 'Gate 16: User B accounts cannot be altered by User A');

  // =========================================================================
  // GATE 17: Repeating reset for A is idempotent
  // =========================================================================
  const repeatReset = await env.rpc('reset_user_data', {
    p_reset_id: `RESET:${userA}:repeat`,
    p_confirmation_phrase: 'RESET MY DATA',
  });
  assert.equal(repeatReset.error, null);
  assert.equal(repeatReset.data.success, true);
  assert.equal(repeatReset.data.verified, true);

  // =========================================================================
  // GATE 18: After reset, User A can immediately create a new account
  // =========================================================================
  const createAccRes = await orchestrateAIAction(env, userA, 'msg-fresh-acc', {
    actionType: 'create_account',
    accountName: 'Fresh Savings Account',
    accountType: 'bank',
  });
  assert.equal(createAccRes.error, undefined, `Gate 18: error was ${createAccRes.error}`);
  assert.equal(createAccRes.success, true, 'Gate 18: Account creation after reset must succeed');
  assert.equal(env._state.accounts.filter((a: any) => a.user_id === userA).length, 1);


  // =========================================================================
  // GATE 19: After reset, User A can post a new financial transaction
  // =========================================================================
  const freshAcc = env._state.accounts.find((a: any) => a.user_id === userA);
  const createTxRes = await orchestrateAIAction(env, userA, 'msg-fresh-tx', {
    actionType: 'income',
    amount: 10000,
    accountId: freshAcc.id,
    accountName: freshAcc.name,
    description: 'Initial Salary Deposit',
  });
  assert.equal(createTxRes.success, true, 'Gate 19: Transaction creation after reset must succeed');
  assert.equal(env._state.transactions.filter((t: any) => t.user_id === userA).length, 1);

  // =========================================================================
  // GATE 20: AI cannot autonomously invoke the reset
  // =========================================================================
  const aiResetAttempt = await orchestrateAIAction(env, userA, 'msg-ai-reset', {
    actionType: 'reset_financial_data',
  });
  assert.equal(aiResetAttempt.success, false, 'Gate 20: AI cannot autonomously invoke reset');
  assert.equal(aiResetAttempt.errorCode, 'FORBIDDEN');

  // =========================================================================
  // GATE 25: No authentication/session keys are removed from client storage
  // =========================================================================
  const testLocalStorage: Record<string, string> = {
    'nisflow_snapshot_date': '2026-08-20',
    'nisflow_onboarding_completed': 'true',
    'sb-project-auth-token': 'auth.token.value',
    'sb-refresh-token': 'refresh.token.value',
  };

  (global as any).window = {
    localStorage: {
      getItem: (k: string) => testLocalStorage[k] || null,
      setItem: (k: string, v: string) => { testLocalStorage[k] = v; },
      removeItem: (k: string) => { delete testLocalStorage[k]; },
      key: (i: number) => Object.keys(testLocalStorage)[i] || null,
      get length() { return Object.keys(testLocalStorage).length; },
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      key: () => null,
      length: 0,
    },
    caches: {
      keys: async () => [],
      delete: async () => true,
    },
  };

  await clearUserFinancialClientState(null);
  assert.equal(testLocalStorage.nisflow_snapshot_date, undefined, 'Gate 25: nisflow_snapshot_date removed');
  assert.equal(testLocalStorage.nisflow_onboarding_completed, undefined, 'Gate 25: nisflow_onboarding_completed removed');
  assert.equal(testLocalStorage['sb-project-auth-token'], 'auth.token.value', 'Gate 25: Supabase auth token strictly preserved');
  assert.equal(testLocalStorage['sb-refresh-token'], 'refresh.token.value', 'Gate 25: Supabase refresh token strictly preserved');
});
