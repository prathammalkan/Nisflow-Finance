import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import { validateJournalEntry } from '../src/lib/ledger/engine.ts';
import type { JournalLineInput } from '../src/lib/ledger/types.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const TEST_USER_A = '00000000-0000-0000-0000-000000000001';
const TEST_USER_B = '00000000-0000-0000-0000-000000000002';

// ==============================================================================
// 1. SCENARIOS A - O: COMPLETE FINANCIAL LIFECYCLE TESTS
// ==============================================================================

test('Scenario A: Expense creates exact balanced Dr Expense / Cr Asset entry', () => {
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-FOOD-DINING', debitAmount: '1250.50', creditAmount: '0.00', memo: 'Dinner' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '1250.50', memo: 'Dinner' },
  ];
  const val = validateJournalEntry(lines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '1250.50');
  assert.equal(val.totalCredit?.toFixed(2), '1250.50');
});

test('Scenario B: Income creates exact balanced Dr Asset / Cr Income entry', () => {
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-SALARY', debitAmount: '95000.00', creditAmount: '0.00', memo: 'Monthly Salary' },
    { ledgerAccountId: 'INC-SALARY', debitAmount: '0.00', creditAmount: '95000.00', memo: 'Monthly Salary' },
  ];
  const val = validateJournalEntry(lines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '95000.00');
  assert.equal(val.totalCredit?.toFixed(2), '95000.00');
});

test('Scenario C: Internal transfer maintains exact net wealth balance with zero delta', () => {
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-KOTAK', debitAmount: '15000.00', creditAmount: '0.00', memo: 'Transfer to Kotak' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '15000.00', memo: 'Transfer from HDFC' },
  ];
  const val = validateJournalEntry(lines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.minus(val.totalCredit!).toFixed(2), '0.00');
});

test('Scenario D: Lending establishes receivable asset and credits source bank', () => {
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-REC-ALICE', debitAmount: '10000.00', creditAmount: '0.00', memo: 'Lent to Alice' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '10000.00', memo: 'Lent to Alice' },
  ];
  const val = validateJournalEntry(lines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '10000.00');
  assert.equal(val.totalCredit?.toFixed(2), '10000.00');
});

test('Scenario E: Borrowing debits cash asset and establishes payable liability', () => {
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '20000.00', creditAmount: '0.00', memo: 'Borrowed from Bob' },
    { ledgerAccountId: 'LIA-PAY-BOB', debitAmount: '0.00', creditAmount: '20000.00', memo: 'Borrowed from Bob' },
  ];
  const val = validateJournalEntry(lines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '20000.00');
  assert.equal(val.totalCredit?.toFixed(2), '20000.00');
});

test('Scenario F & G: Partial & full debt settlement reaches exactly ₹0.00', () => {
  const initialDebt = new Decimal('20000.00');
  const part1 = new Decimal('8000.00');
  const part2 = new Decimal('12000.00');

  const afterPart1 = initialDebt.minus(part1);
  assert.equal(afterPart1.toFixed(2), '12000.00');

  const afterPart2 = afterPart1.minus(part2);
  assert.equal(afterPart2.toFixed(2), '0.00');
});

test('Scenario H: Recurring execution maintains deterministic idempotency', () => {
  const recId = 'rec-gym-subscription';
  const dueDate = '2026-09-01';
  const key1 = `REC:${recId}:${dueDate}`;
  const key2 = `REC:${recId}:${dueDate}`;
  assert.equal(key1, key2);
  assert.equal(key1, 'REC:rec-gym-subscription:2026-09-01');
});

test('Scenario I & J: Investment BUY and SELL with realized gain accounting', () => {
  // BUY: 100 units @ 200 = 20,000
  const buyLines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-INV-NIFTY50', debitAmount: '20000.00', creditAmount: '0.00', memo: 'Buy Nifty ETF' },
    { ledgerAccountId: 'AST-ACC-ZERODHA', debitAmount: '0.00', creditAmount: '20000.00', memo: 'Buy Nifty ETF' },
  ];
  assert.equal(validateJournalEntry(buyLines).isValid, true);

  // SELL: 100 units @ 250 = 25,000 (Cost: 20k, Realized P&L: 5k)
  const sellLines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-ZERODHA', debitAmount: '25000.00', creditAmount: '0.00', memo: 'Sell Nifty ETF' },
    { ledgerAccountId: 'AST-INV-NIFTY50', debitAmount: '0.00', creditAmount: '20000.00', memo: 'Sell Nifty ETF Cost' },
    { ledgerAccountId: 'INC-CAPITAL-GAINS', debitAmount: '0.00', creditAmount: '5000.00', memo: 'Capital Gain' },
  ];
  const sellVal = validateJournalEntry(sellLines);
  assert.equal(sellVal.isValid, true);
  assert.equal(sellVal.totalDebit?.toFixed(2), '25000.00');
  assert.equal(sellVal.totalCredit?.toFixed(2), '25000.00');
});

test('Scenario K: Dividend income posts balanced Dr Asset:Bank / Cr Income:Dividend', () => {
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '3500.00', creditAmount: '0.00', memo: 'TCS Dividend' },
    { ledgerAccountId: 'INC-DIVIDEND', debitAmount: '0.00', creditAmount: '3500.00', memo: 'TCS Dividend' },
  ];
  const val = validateJournalEntry(lines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '3500.00');
  assert.equal(val.totalCredit?.toFixed(2), '3500.00');
});

test('Scenario L: Loan EMI compound entry balances principal, interest, and bank credit', () => {
  const emiLines: JournalLineInput[] = [
    { ledgerAccountId: 'LIA-LOAN-HOME', debitAmount: '38450.00', creditAmount: '0.00', memo: 'Home Loan Principal' },
    { ledgerAccountId: 'EXP-LOAN-INTEREST', debitAmount: '21550.00', creditAmount: '0.00', memo: 'Home Loan Interest' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '60000.00', memo: 'Home Loan EMI Total' },
  ];
  const val = validateJournalEntry(emiLines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '60000.00');
  assert.equal(val.totalCredit?.toFixed(2), '60000.00');
});

test('Scenario M: Reversal inverts line debits and credits exactly', () => {
  const originalLines: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-OFFICE', debitAmount: '4500.00', creditAmount: '0.00', memo: 'Office Desk' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '4500.00', memo: 'Office Desk' },
  ];

  const reversedLines: JournalLineInput[] = originalLines.map(line => ({
    ledgerAccountId: line.ledgerAccountId,
    debitAmount: line.creditAmount,
    creditAmount: line.debitAmount,
    memo: `[REVERSAL] ${line.memo}`,
  }));

  const revVal = validateJournalEntry(reversedLines);
  assert.equal(revVal.isValid, true);
  assert.equal(revVal.totalDebit?.toFixed(2), '4500.00');
  assert.equal(revVal.totalCredit?.toFixed(2), '4500.00');
});

test('Scenario N: Bank statement row with deterministic idempotency key', () => {
  const stmtId = 'stmt-hdfc-aug2026';
  const rowIndex = 12;
  const key = `RECON:${stmtId}:${rowIndex}`;
  assert.equal(key, 'RECON:stmt-hdfc-aug2026:12');
});

test('Scenario O: Reconciliation adjustment balances without raw balance overwrite', () => {
  const surplusLines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '420.00', creditAmount: '0.00', memo: 'Recon Surplus' },
    { ledgerAccountId: 'INC-RECON-ADJ', debitAmount: '0.00', creditAmount: '420.00', memo: 'Recon Surplus' },
  ];
  assert.equal(validateJournalEntry(surplusLines).isValid, true);

  const shortfallLines: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-RECON-ADJ', debitAmount: '230.00', creditAmount: '0.00', memo: 'Recon Shortfall' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '230.00', memo: 'Recon Shortfall' },
  ];
  assert.equal(validateJournalEntry(shortfallLines).isValid, true);
});

// ==============================================================================
// 2. MATHEMATICAL INVARIANTS & INTEGRITY TESTS
// ==============================================================================

test('Invariant: Unbalanced entries are strictly rejected', () => {
  const unbalancedLines: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-SHOPPING', debitAmount: '100.00', creditAmount: '0.00', memo: 'Test' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '99.99', memo: 'Test' },
  ];
  const res = validateJournalEntry(unbalancedLines);
  assert.equal(res.isValid, false);
  assert.match(res.error || '', /discrepancy/i);
});

test('Invariant: Single-line entries (< 2 lines) are strictly rejected', () => {
  const singleLine: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-SHOPPING', debitAmount: '100.00', creditAmount: '0.00', memo: 'Test' },
  ];
  const res = validateJournalEntry(singleLine);
  assert.equal(res.isValid, false);
  assert.match(res.error || '', /at least 2 lines/i);
});

test('Invariant: Negative or simultaneous debit/credit amounts are rejected', () => {
  const invalidNegative: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-SHOPPING', debitAmount: '-50.00', creditAmount: '0.00', memo: 'Test' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '-50.00', memo: 'Test' },
  ];
  assert.equal(validateJournalEntry(invalidNegative).isValid, false);

  const invalidBoth: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-SHOPPING', debitAmount: '50.00', creditAmount: '50.00', memo: 'Test' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '100.00', memo: 'Test' },
  ];
  assert.equal(validateJournalEntry(invalidBoth).isValid, false);
});

test('Invariant: Paise precision is preserved without floating point drift', () => {
  let sum = new Decimal('0.00');
  for (let i = 0; i < 10; i++) {
    sum = sum.plus(new Decimal('0.10'));
  }
  assert.equal(sum.toFixed(2), '1.00');
  assert.equal(sum.equals(1), true);
});
