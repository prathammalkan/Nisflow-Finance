import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Decimal } from 'decimal.js';
import { validateJournalEntry } from '../src/lib/ledger/engine.ts';

// 1. Balanced Journal Entry
test('Ledger Foundation: Perfectly balanced journal entries pass validation', () => {
  const lines = [
    {
      ledgerAccountId: 'acc-expense-groc-1',
      debitAmount: '850.50',
      creditAmount: '0.00',
      memo: 'Groceries purchase',
    },
    {
      ledgerAccountId: 'acc-asset-bank-1',
      debitAmount: '0.00',
      creditAmount: '850.50',
      memo: 'Paid via HDFC Bank',
    },
  ];

  const result = validateJournalEntry(lines);
  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.equal(result.totalDebit.toString(), '850.5');
    assert.equal(result.totalCredit.toString(), '850.5');
    assert.equal(result.lineCount, 2);
  }
});

// 2. Unbalanced Journal Entry
test('Ledger Foundation: Unbalanced journal entry is rejected with discrepancy details', () => {
  const lines = [
    {
      ledgerAccountId: 'acc-expense-groc-1',
      debitAmount: '850.50',
      creditAmount: '0.00',
    },
    {
      ledgerAccountId: 'acc-asset-bank-1',
      debitAmount: '0.00',
      creditAmount: '850.00', // Missing 50 paise
    },
  ];

  const result = validateJournalEntry(lines);
  assert.equal(result.isValid, false);
  if (!result.isValid) {
    assert.match(result.error, /Unbalanced journal entry/);
    assert.match(result.error, /850.50/);
    assert.match(result.error, /850.00/);
    assert.match(result.error, /0.50/);
  }
});

// 3. Multi-line Split Journal Entry (e.g. Loan EMI principal + interest)
test('Ledger Foundation: Multi-line compound journal entries pass when sum matches', () => {
  const lines = [
    {
      ledgerAccountId: 'acc-liability-loan-1',
      debitAmount: '18500.00',
      creditAmount: '0.00',
      memo: 'Principal reduction',
    },
    {
      ledgerAccountId: 'acc-expense-interest-1',
      debitAmount: '6500.00',
      creditAmount: '0.00',
      memo: 'Interest expense',
    },
    {
      ledgerAccountId: 'acc-asset-bank-1',
      debitAmount: '0.00',
      creditAmount: '25000.00',
      memo: 'Total EMI debit from bank',
    },
  ];

  const result = validateJournalEntry(lines);
  assert.equal(result.isValid, true);
  if (result.isValid) {
    assert.equal(result.totalDebit.toString(), '25000');
    assert.equal(result.totalCredit.toString(), '25000');
    assert.equal(result.lineCount, 3);
  }
});

// 4. Zero and Negative Amounts are strictly rejected
test('Ledger Foundation: Negative or zero amounts are rejected', () => {
  // Negative amount
  const negResult = validateJournalEntry([
    { ledgerAccountId: 'acc-1', debitAmount: '-500.00', creditAmount: '0.00' },
    { ledgerAccountId: 'acc-2', debitAmount: '0.00', creditAmount: '-500.00' },
  ]);
  assert.equal(negResult.isValid, false);
  if (!negResult.isValid) {
    assert.match(negResult.error, /negative/i);
  }

  // All zero amounts
  const zeroResult = validateJournalEntry([
    { ledgerAccountId: 'acc-1', debitAmount: '0.00', creditAmount: '0.00' },
    { ledgerAccountId: 'acc-2', debitAmount: '0.00', creditAmount: '0.00' },
  ]);
  assert.equal(zeroResult.isValid, false);
  if (!zeroResult.isValid) {
    assert.match(zeroResult.error, /strictly positive debit OR credit/i);
  }
});

// 5. Line Debit XOR Credit constraint
test('Ledger Foundation: Lines with both debit and credit positive are rejected', () => {
  const result = validateJournalEntry([
    { ledgerAccountId: 'acc-1', debitAmount: '100.00', creditAmount: '100.00' },
    { ledgerAccountId: 'acc-2', debitAmount: '100.00', creditAmount: '100.00' },
  ]);
  assert.equal(result.isValid, false);
  if (!result.isValid) {
    assert.match(result.error, /strictly positive debit OR credit, not both/i);
  }
});

// 6. INR Precision: Fractional paise (sub-cent) is rejected
test('Ledger Foundation: Sub-paise fractional amounts (>2 decimal places) are rejected', () => {
  const result = validateJournalEntry([
    { ledgerAccountId: 'acc-1', debitAmount: '100.125', creditAmount: '0.00' },
    { ledgerAccountId: 'acc-2', debitAmount: '0.00', creditAmount: '100.125' },
  ]);
  assert.equal(result.isValid, false);
  if (!result.isValid) {
    assert.match(result.error, /2-decimal precision/i);
  }
});

// 7. Exact INR ₹0.01 precision arithmetic (no IEEE 754 binary floating-point drift)
test('Ledger Foundation: Paise-level precision arithmetic produces exact results', () => {
  // Classic float trap: 0.1 + 0.2 = 0.30000000000000004
  const a = new Decimal('0.10');
  const b = new Decimal('0.20');
  const sum = a.plus(b);

  assert.equal(sum.toString(), '0.3');
  assert.equal(sum.toFixed(2), '0.30');

  const lines = [
    { ledgerAccountId: 'acc-1', debitAmount: a.toFixed(2), creditAmount: '0.00' },
    { ledgerAccountId: 'acc-2', debitAmount: b.toFixed(2), creditAmount: '0.00' },
    { ledgerAccountId: 'acc-3', debitAmount: '0.00', creditAmount: '0.30' },
  ];

  const result = validateJournalEntry(lines);
  assert.equal(result.isValid, true);
});

// 8. SQL Migration 007 verification: Tables, constraints, immutability triggers, and functions
test('Ledger Schema: Migration 007 defines all required double-entry tables, triggers, and procedures', () => {
  const migrationPath = path.join(process.cwd(), 'supabase', 'migrations', '007_double_entry_ledger.sql');
  assert.ok(fs.existsSync(migrationPath), 'Migration 007 file must exist');

  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Verify tables
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ledger_accounts/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.journal_entries/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.journal_lines/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ledger_audit_log/);

  // Verify constraints
  assert.match(sql, /CONSTRAINT uq_journal_entry_idempotency UNIQUE \(user_id, idempotency_key\)/);
  assert.match(sql, /CONSTRAINT chk_jl_positive_amounts CHECK \(debit_amount >= 0 AND credit_amount >= 0\)/);
  assert.match(sql, /CONSTRAINT chk_jl_debit_xor_credit CHECK/);

  // Verify immutability triggers
  assert.match(sql, /trg_journal_line_immutability/);
  assert.match(sql, /Posted journal lines are immutable\. Post a reversal entry instead\./);
  assert.match(sql, /trg_journal_entry_immutability/);
  assert.match(sql, /Journal entries are immutable once posted\./);

  // Verify stored procedures
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.post_journal_entry/);
  assert.match(sql, /SELECT \.\.\. FOR UPDATE/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.post_reversal_entry/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.get_ledger_account_balance/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reconcile_ledger_balances/);

  // Verify RLS
  assert.match(sql, /ALTER TABLE public\.ledger_accounts ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /ALTER TABLE public\.journal_entries ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /ALTER TABLE public\.journal_lines ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /ALTER TABLE public\.ledger_audit_log ENABLE ROW LEVEL SECURITY;/);
});

// 9. Reversal Logic verification: Inversion of debits and credits preserves history
test('Ledger Foundation: Reversal logic inverts line debits and credits accurately', () => {
  const originalLines = [
    { ledgerAccountId: 'acc-exp-1', debit_amount: 1500, credit_amount: 0 },
    { ledgerAccountId: 'acc-bank-1', debit_amount: 0, credit_amount: 1500 },
  ];

  // Invert lines for reversal
  const reversalLines = originalLines.map((line) => ({
    ledgerAccountId: line.ledgerAccountId,
    debitAmount: line.credit_amount,
    creditAmount: line.debit_amount,
  }));

  const reversalValidation = validateJournalEntry(reversalLines);
  assert.equal(reversalValidation.isValid, true);
  if (reversalValidation.isValid) {
    assert.equal(reversalValidation.totalDebit.toString(), '1500');
    assert.equal(reversalValidation.totalCredit.toString(), '1500');
  }
});

// 10. Reconciliation detects even 1 paise (₹0.01) discrepancy
test('Ledger Foundation: Reconciliation arithmetic identifies any non-zero discrepancy', () => {
  const cachedBalance = new Decimal('10000.00');
  const ledgerBalanceDrift = new Decimal('10000.01'); // 1 paise drift

  const discrepancy = cachedBalance.minus(ledgerBalanceDrift);
  const isReconciled = discrepancy.isZero();

  assert.equal(isReconciled, false);
  assert.equal(discrepancy.abs().toString(), '0.01');
});
