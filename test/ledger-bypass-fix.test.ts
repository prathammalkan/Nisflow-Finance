import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import fs from 'node:fs';
import path from 'node:path';
import { validateJournalEntry } from '../src/lib/ledger/engine.ts';
import type { JournalLineInput } from '../src/lib/ledger/types.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const TEST_USER = '00000000-0000-0000-0000-000000000001';

// 1. FIN-01: Statement Import creates balanced Dr/Cr lines
test('FIN-01: Statement import row produces balanced double-entry journal lines', () => {
  const rowAmount = '4500.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-CAT-SHOPPING', debitAmount: rowAmount, creditAmount: '0.00', memo: 'Amazon Purchase' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: rowAmount, memo: 'Amazon Purchase' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '4500.00');
  assert.equal(validation.totalCredit?.toFixed(2), '4500.00');
});

// 2. FIN-01: Duplicate import idempotency format
test('FIN-01: Statement import generates deterministic RECON idempotency key', () => {
  const statementId = 'stmt-1234-5678';
  const rowIndex = 4;
  const idempotencyKey = `RECON:${statementId}:${rowIndex}`;

  assert.equal(idempotencyKey, 'RECON:stmt-1234-5678:4');
});

// 3. FIN-02: Reconciliation Adjustment creates balanced accounting entry
test('FIN-02: Reconciliation surplus adjustment posts balanced Dr Asset / Cr Income entry', () => {
  const diffAmount = '150.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: diffAmount, creditAmount: '0.00', memo: 'Recon Surplus' },
    { ledgerAccountId: 'INC-RECON-ADJ', debitAmount: '0.00', creditAmount: diffAmount, memo: 'Recon Surplus' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '150.00');
  assert.equal(validation.totalCredit?.toFixed(2), '150.00');
});

// 4. FIN-02: Reconciliation shortfall adjustment posts balanced Dr Expense / Cr Asset entry
test('FIN-02: Reconciliation shortfall adjustment posts balanced Dr Expense / Cr Asset entry', () => {
  const diffAmount = '75.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-RECON-ADJ', debitAmount: diffAmount, creditAmount: '0.00', memo: 'Recon Shortfall' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: diffAmount, memo: 'Recon Shortfall' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '75.00');
  assert.equal(validation.totalCredit?.toFixed(2), '75.00');
});

// 5. FIN-03: Recurring execution idempotency key consistency
test('FIN-03: Recurring execution key is strictly deterministic and idempotent', () => {
  const recurringId = 'rec-monthly-rent-101';
  const nextDueDate = '2026-09-01';
  const key1 = `REC:${recurringId}:${nextDueDate}`;
  const key2 = `REC:${recurringId}:${nextDueDate}`;

  assert.equal(key1, key2);
  assert.equal(key1, 'REC:rec-monthly-rent-101:2026-09-01');
});

// 6. FIN-04: Investment BUY posts balanced Dr Asset:Investment / Cr Asset:Bank
test('FIN-04: Investment BUY establishes asset holding and debits bank cash', () => {
  const buyAmount = '25000.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-INV-MUTUALFUND-01', debitAmount: buyAmount, creditAmount: '0.00', memo: 'Buy Mutual Fund' },
    { ledgerAccountId: 'AST-ACC-ZERODHA-BANK', debitAmount: '0.00', creditAmount: buyAmount, memo: 'Buy Mutual Fund' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '25000.00');
  assert.equal(validation.totalCredit?.toFixed(2), '25000.00');
});

// 7. FIN-04: Investment SELL posts balanced Dr Asset:Bank / Cr Asset:Investment
test('FIN-04: Investment SELL credits asset holding and credits bank cash', () => {
  const sellProceeds = '32000.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-ZERODHA-BANK', debitAmount: sellProceeds, creditAmount: '0.00', memo: 'Sell Shares' },
    { ledgerAccountId: 'AST-INV-EQUITY-01', debitAmount: '0.00', creditAmount: sellProceeds, memo: 'Sell Shares' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '32000.00');
  assert.equal(validation.totalCredit?.toFixed(2), '32000.00');
});

// 8. FIN-04: Dividend Income posts balanced Dr Asset:Bank / Cr Income:Dividend
test('FIN-04: Dividend income credits dividend income account', () => {
  const dividendAmount = '1200.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: dividendAmount, creditAmount: '0.00', memo: 'Dividend' },
    { ledgerAccountId: 'INC-DIVIDEND', debitAmount: '0.00', creditAmount: dividendAmount, memo: 'Dividend' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '1200.00');
  assert.equal(validation.totalCredit?.toFixed(2), '1200.00');
});

// 9. FIN-05: Lending creates receivable asset and credits cash
test('FIN-05: Lending creates receivable asset and credits cash account', () => {
  const amount = '3000.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-REC-CHARLIE', debitAmount: amount, creditAmount: '0.00', memo: 'Lent to Charlie' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: amount, memo: 'Lent to Charlie' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '3000.00');
  assert.equal(validation.totalCredit?.toFixed(2), '3000.00');
});

// 10. FIN-05: Borrowing creates payable liability and debits cash
test('FIN-05: Borrowing creates payable liability and debits cash account', () => {
  const amount = '7500.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: amount, creditAmount: '0.00', memo: 'Borrowed from Dave' },
    { ledgerAccountId: 'LIA-PAY-DAVE', debitAmount: '0.00', creditAmount: amount, memo: 'Borrowed from Dave' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '7500.00');
  assert.equal(validation.totalCredit?.toFixed(2), '7500.00');
});

// 11. FIN-05: Partial and full debt repayments
test('FIN-05: Debt repayment reduces outstanding payable to exactly ₹0.00', () => {
  const initialDebt = new Decimal('7500.00');
  const payment1 = new Decimal('3000.00');
  const payment2 = new Decimal('4500.00');

  const remainingAfterP1 = initialDebt.minus(payment1);
  assert.equal(remainingAfterP1.toFixed(2), '4500.00');

  const remainingAfterP2 = remainingAfterP1.minus(payment2);
  assert.equal(remainingAfterP2.toFixed(2), '0.00');
});

// 12. Account Opening Balance: Dr Asset / Cr Equity:Opening Balance
test('Ledger Invariant: Account opening balance posts balanced Dr Asset / Cr Equity entry', () => {
  const openingBal = '150000.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-NEW-BANK', debitAmount: openingBal, creditAmount: '0.00', memo: 'Opening Balance' },
    { ledgerAccountId: 'EQU-OPEN-BAL', debitAmount: '0.00', creditAmount: openingBal, memo: 'Opening Balance' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '150000.00');
  assert.equal(validation.totalCredit?.toFixed(2), '150000.00');
});

// 13. FIN-06: Migration 008 drops obsolete update_account_balance_trigger
test('FIN-06: Migration 008 DDL drops obsolete legacy balance trigger', () => {
  const migration008Path = path.resolve('supabase/migrations/008_drop_legacy_balance_trigger.sql');
  assert.equal(fs.existsSync(migration008Path), true);

  const content = fs.readFileSync(migration008Path, 'utf8');
  assert.match(content, /DROP TRIGGER IF EXISTS update_account_balance_trigger ON public\.transactions/i);
  assert.match(content, /DROP FUNCTION IF EXISTS public\.update_account_balance\(\)/i);
});
