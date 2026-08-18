import test from 'node:test';
import assert from 'node:assert/strict';
import { planLegacyMigration } from '../src/lib/ledger/migration.ts';
import type { LegacyDataset } from '../src/lib/ledger/migration.ts';

const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

// 1. Empty Dataset Test
test('Migration Engine: Empty legacy dataset results in zero entries and exact ₹0.00 parity', () => {
  const dataset: LegacyDataset = {
    accounts: [],
    transactions: [],
    categories: [],
    counterparties: [],
    receivables: [],
    payables: [],
    loans: [],
    investments: [],
  };

  const plan = planLegacyMigration(dataset, TEST_USER_ID);
  assert.equal(plan.plannedEntries.length, 0);
  assert.equal(plan.quarantineList.length, 0);
  assert.equal(plan.recordsAnalyzed, 0);
  assert.equal(plan.parity.isParityVerified, true);
  assert.equal(plan.parity.assets.difference, 0);
  assert.equal(plan.parity.expenses.difference, 0);
});

// 2. Single Income & Expense Migration Test
test('Migration Engine: Single income and expense map to balanced journal entries with exact parity', () => {
  const dataset: LegacyDataset = {
    accounts: [
      {
        id: 'acc-hdfc-1',
        user_id: TEST_USER_ID,
        name: 'HDFC Bank',
        account_type: 'bank',
        opening_balance: 0,
        current_balance: 49150, // 50,000 - 850
      },
    ],
    transactions: [
      {
        id: 'txn-inc-1',
        user_id: TEST_USER_ID,
        account_id: 'acc-hdfc-1',
        category_id: 'cat-sal-1',
        type: 'income',
        direction: 'in',
        amount: 50000,
        date: '2026-08-01',
        description: 'Monthly Salary',
        status: 'confirmed',
      },
      {
        id: 'txn-exp-1',
        user_id: TEST_USER_ID,
        account_id: 'acc-hdfc-1',
        category_id: 'cat-groc-1',
        type: 'expense',
        direction: 'out',
        amount: 850,
        date: '2026-08-05',
        description: 'Groceries Store',
        status: 'confirmed',
      },
    ],
    categories: [
      { id: 'cat-sal-1', name: 'Salary', type: 'income' },
      { id: 'cat-groc-1', name: 'Groceries', type: 'expense' },
    ],
    counterparties: [],
    receivables: [],
    payables: [],
    loans: [],
    investments: [],
  };

  const plan = planLegacyMigration(dataset, TEST_USER_ID);

  assert.equal(plan.plannedEntries.length, 2);
  assert.equal(plan.quarantineList.length, 0);
  assert.equal(plan.parity.isParityVerified, true);

  // Income entry checks
  const incomeEntry = plan.plannedEntries.find((e) => e.sourceId === 'txn-inc-1');
  assert.ok(incomeEntry);
  assert.equal(incomeEntry?.idempotencyKey, 'MIGRATE:transactions:txn-inc-1');
  assert.equal(incomeEntry?.lines[0].debitAmount, '50000.00');
  assert.equal(incomeEntry?.lines[1].creditAmount, '50000.00');

  // Expense entry checks
  const expenseEntry = plan.plannedEntries.find((e) => e.sourceId === 'txn-exp-1');
  assert.ok(expenseEntry);
  assert.equal(expenseEntry?.idempotencyKey, 'MIGRATE:transactions:txn-exp-1');
  assert.equal(expenseEntry?.lines[0].debitAmount, '850.00');
  assert.equal(expenseEntry?.lines[1].creditAmount, '850.00');

  // Financial Parity
  assert.equal(plan.parity.assets.legacy, 49150);
  assert.equal(plan.parity.assets.ledger, 49150);
  assert.equal(plan.parity.income.legacy, 50000);
  assert.equal(plan.parity.expenses.legacy, 850);
  assert.equal(plan.parity.assets.difference, 0);
});

// 3. Internal Transfer (Net Wealth Delta = ₹0.00)
test('Migration Engine: Transfers between owned accounts preserve net wealth parity with zero discrepancy', () => {
  const dataset: LegacyDataset = {
    accounts: [
      { id: 'acc-hdfc-1', user_id: TEST_USER_ID, name: 'HDFC', account_type: 'bank', opening_balance: 0, current_balance: 0 },
      { id: 'acc-sbi-1', user_id: TEST_USER_ID, name: 'SBI', account_type: 'bank', opening_balance: 0, current_balance: 0 },
    ],
    transactions: [
      {
        id: 'txn-trf-from',
        user_id: TEST_USER_ID,
        account_id: 'acc-hdfc-1',
        type: 'transfer',
        direction: 'out',
        amount: 10000,
        date: '2026-08-10',
        description: 'Transfer HDFC -> SBI',
        status: 'confirmed',
        linked_transaction_id: 'txn-trf-to',
      },
      {
        id: 'txn-trf-to',
        user_id: TEST_USER_ID,
        account_id: 'acc-sbi-1',
        type: 'transfer',
        direction: 'in',
        amount: 10000,
        date: '2026-08-10',
        description: 'Transfer from HDFC',
        status: 'confirmed',
        linked_transaction_id: 'txn-trf-from',
      },
    ],
    categories: [],
    counterparties: [],
    receivables: [],
    payables: [],
    loans: [],
    investments: [],
  };

  const plan = planLegacyMigration(dataset, TEST_USER_ID);
  assert.equal(plan.quarantineList.length, 0);
  assert.equal(plan.parity.income.difference, 0);
  assert.equal(plan.parity.expenses.difference, 0);
  assert.equal(plan.parity.assets.difference, 0);
});

// 4. Account Opening Balance Migration
test('Migration Engine: Account opening balances map to Equity:Opening Balance', () => {
  const dataset: LegacyDataset = {
    accounts: [
      {
        id: 'acc-hdfc-opening',
        user_id: TEST_USER_ID,
        name: 'HDFC Bank',
        account_type: 'bank',
        opening_balance: 25000,
        current_balance: 25000,
      },
    ],
    transactions: [],
    categories: [],
    counterparties: [],
    receivables: [],
    payables: [],
    loans: [],
    investments: [],
  };

  const plan = planLegacyMigration(dataset, TEST_USER_ID);
  assert.equal(plan.plannedEntries.length, 1);
  const entry = plan.plannedEntries[0];
  assert.equal(entry.idempotencyKey, 'MIGRATE:accounts:opening:acc-hdfc-opening');
  assert.equal(entry.lines[0].ledgerAccountId, 'AST-ACC-acc-hdfc-opening');
  assert.equal(entry.lines[0].debitAmount, '25000.00');
  assert.equal(entry.lines[1].ledgerAccountId, 'EQU-OPEN-BAL');
  assert.equal(entry.lines[1].creditAmount, '25000.00');
  assert.equal(plan.parity.assets.difference, 0);
});

// 5. Ambiguous / Invalid Record Quarantine
test('Migration Engine: Invalid or unlinked records are quarantined without guessing or altering data', () => {
  const dataset: LegacyDataset = {
    accounts: [
      { id: 'acc-hdfc-1', user_id: TEST_USER_ID, name: 'HDFC', account_type: 'bank', opening_balance: 0, current_balance: 100 },
    ],
    transactions: [
      {
        id: 'txn-broken-1',
        user_id: TEST_USER_ID,
        account_id: 'acc-non-existent-999', // Missing account
        type: 'expense',
        direction: 'out',
        amount: 500,
        date: '2026-08-01',
        description: 'Orphan Transaction',
        status: 'confirmed',
      },
      {
        id: 'txn-broken-2',
        user_id: TEST_USER_ID,
        account_id: 'acc-hdfc-1',
        type: 'expense',
        direction: 'out',
        amount: 0, // Zero amount
        date: '2026-08-01',
        description: 'Zero Amount Transaction',
        status: 'confirmed',
      },
    ],
    categories: [],
    counterparties: [],
    receivables: [],
    payables: [],
    loans: [],
    investments: [],
  };

  const plan = planLegacyMigration(dataset, TEST_USER_ID);
  assert.equal(plan.quarantineList.length, 2);
  assert.equal(plan.parity.isParityVerified, false); // Parity must fail if items are quarantined
  assert.match(plan.quarantineList[0].reason, /not found in user accounts/i);
  assert.match(plan.quarantineList[1].reason, /strictly greater than/i);
});

// 6. Deterministic Idempotency Key Format
test('Migration Engine: Generates deterministic idempotency keys for all entity types', () => {
  const dataset: LegacyDataset = {
    accounts: [
      { id: 'acc-1', user_id: TEST_USER_ID, name: 'Bank A', account_type: 'bank', opening_balance: 1000, current_balance: 1000 },
    ],
    transactions: [
      { id: 'txn-1', user_id: TEST_USER_ID, account_id: 'acc-1', type: 'income', direction: 'in', amount: 500, date: '2026-08-01', description: 'Inc', status: 'confirmed' },
    ],
    categories: [],
    counterparties: [],
    receivables: [],
    payables: [],
    loans: [],
    investments: [],
  };

  const plan1 = planLegacyMigration(dataset, TEST_USER_ID);
  const plan2 = planLegacyMigration(dataset, TEST_USER_ID);

  assert.equal(plan1.plannedEntries.length, plan2.plannedEntries.length);
  for (let i = 0; i < plan1.plannedEntries.length; i++) {
    assert.equal(plan1.plannedEntries[i].idempotencyKey, plan2.plannedEntries[i].idempotencyKey);
  }
});
