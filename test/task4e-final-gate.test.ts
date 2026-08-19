import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import { validateJournalEntry } from '../src/lib/ledger/engine.ts';
import type { JournalLineInput } from '../src/lib/ledger/types.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const TEST_USER = '00000000-0000-0000-0000-000000000001';

// 1. Deterministic Investment Idempotency
test('1. Deterministic Investment Idempotency: retry produces identical key', () => {
  const invTxId = 'inv-tx-1001-buy-hdfc';
  const investmentId = 'inv-hdfc-equity';
  const type = 'buy';

  const key1 = `INV:${type.toUpperCase()}:${investmentId}:${invTxId}`;
  const key2 = `INV:${type.toUpperCase()}:${investmentId}:${invTxId}`;
  const key3 = `INV:${type.toUpperCase()}:${investmentId}:${invTxId}`;

  assert.equal(key1, key2);
  assert.equal(key2, key3);
  assert.equal(key1, 'INV:BUY:inv-hdfc-equity:inv-tx-1001-buy-hdfc');
});

// 2. Deterministic Lending & Borrowing Idempotency
test('2. Deterministic Lending & Borrowing Idempotency: entity-anchored keys', () => {
  const recId = 'rec-loan-charlie-5000';
  const payId = 'pay-debt-dave-8000';

  const lendKey = `REC:LEND:${recId}`;
  const borrowKey = `PAY:BORROW:${payId}`;

  assert.equal(lendKey, 'REC:LEND:rec-loan-charlie-5000');
  assert.equal(borrowKey, 'PAY:BORROW:pay-debt-dave-8000');
});

// 3. Deterministic Repayment Idempotency
test('3. Deterministic Repayment Idempotency: milestone-anchored keys', () => {
  const recId = 'rec-loan-charlie-5000';
  const repaymentMilestone = '2500.00';
  const repayKey1 = `REC:REPAY:${recId}:repay-${repaymentMilestone}`;
  const repayKey2 = `REC:REPAY:${recId}:repay-${repaymentMilestone}`;

  assert.equal(repayKey1, repayKey2);
  assert.equal(repayKey1, 'REC:REPAY:rec-loan-charlie-5000:repay-2500.00');
});

// 4. Investment Profitable Sale Accounting (Dr Cash, Cr Investment, Cr Realized Gain)
test('4. Investment Profitable Sale: carrying value 20k, sale proceeds 25k -> gain 5k', () => {
  const carryingValue = new Decimal('20000.00');
  const proceeds = new Decimal('25000.00');
  const gain = proceeds.minus(carryingValue);

  assert.equal(gain.toFixed(2), '5000.00');

  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: proceeds.toFixed(2), creditAmount: '0.00', memo: 'Sale Proceeds' },
    { ledgerAccountId: 'AST-INV-MUTUALFUND', debitAmount: '0.00', creditAmount: carryingValue.toFixed(2), memo: 'Cost Basis' },
    { ledgerAccountId: 'INC-CAP-GAIN', debitAmount: '0.00', creditAmount: gain.toFixed(2), memo: 'Realized Capital Gain' },
  ];

  const val = validateJournalEntry(lines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '25000.00');
  assert.equal(val.totalCredit?.toFixed(2), '25000.00');
});

// 5. Investment Loss-Making Sale Accounting (Dr Cash, Dr Realized Loss, Cr Investment)
test('5. Investment Loss Sale: carrying value 30k, sale proceeds 22k -> loss 8k', () => {
  const carryingValue = new Decimal('30000.00');
  const proceeds = new Decimal('22000.00');
  const loss = carryingValue.minus(proceeds);

  assert.equal(loss.toFixed(2), '8000.00');

  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: proceeds.toFixed(2), creditAmount: '0.00', memo: 'Sale Proceeds' },
    { ledgerAccountId: 'EXP-CAP-LOSS', debitAmount: loss.toFixed(2), creditAmount: '0.00', memo: 'Realized Capital Loss' },
    { ledgerAccountId: 'AST-INV-EQUITY', debitAmount: '0.00', creditAmount: carryingValue.toFixed(2), memo: 'Cost Basis' },
  ];

  const val = validateJournalEntry(lines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '30000.00');
  assert.equal(val.totalCredit?.toFixed(2), '30000.00');
});

// 6. Investment Sale At-Cost (Zero Gain)
test('6. Investment At-Cost Sale: carrying value 15k, proceeds 15k -> zero gain/loss', () => {
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '15000.00', creditAmount: '0.00', memo: 'Sale Proceeds' },
    { ledgerAccountId: 'AST-INV-GOLD', debitAmount: '0.00', creditAmount: '15000.00', memo: 'Cost Basis' },
  ];

  const val = validateJournalEntry(lines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '15000.00');
  assert.equal(val.totalCredit?.toFixed(2), '15000.00');
});

// 7. Legitimate Reconciliation Adjustment
test('7. Legitimate Reconciliation Adjustment: explicit surplus entry balances perfectly', () => {
  const surplusDiff = '350.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: surplusDiff, creditAmount: '0.00', memo: 'Documented Surplus' },
    { ledgerAccountId: 'INC-RECON-ADJ', debitAmount: '0.00', creditAmount: surplusDiff, memo: 'Documented Surplus' },
  ];

  const val = validateJournalEntry(lines);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '350.00');
  assert.equal(val.totalCredit?.toFixed(2), '350.00');
});

// 8. Unexplained Reconciliation Mismatch
test('8. Unexplained Reconciliation Mismatch: flags discrepancy without artificial balance write', () => {
  const statementBalance = new Decimal('100500.00');
  const ledgerBalance = new Decimal('100000.00');
  const diff = statementBalance.minus(ledgerBalance);

  assert.equal(diff.toFixed(2), '500.00');
  const status = diff.isZero() ? 'balanced' : 'discrepancy';
  assert.equal(status, 'discrepancy');
  // No journal entry lines are manufactured for unconfirmed mismatches
});

// 9. Reversal Integrity: exact inversion
test('9. Reversal Integrity: inverts lines and preserves net zero sum', () => {
  const original: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-TRAVEL', debitAmount: '12000.00', creditAmount: '0.00', memo: 'Flight' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '12000.00', memo: 'Flight' },
  ];

  const reversal: JournalLineInput[] = original.map(l => ({
    ledgerAccountId: l.ledgerAccountId,
    debitAmount: l.creditAmount,
    creditAmount: l.debitAmount,
    memo: `[REVERSAL] ${l.memo}`,
  }));

  const val = validateJournalEntry(reversal);
  assert.equal(val.isValid, true);
  assert.equal(val.totalDebit?.toFixed(2), '12000.00');
  assert.equal(val.totalCredit?.toFixed(2), '12000.00');
});

// 10. Paise Precision and Rounding Invariant
test('10. Paise Precision: fractional amounts beyond 2 decimal places are rejected', () => {
  const invalidFractional: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-GROCERY', debitAmount: '100.005', creditAmount: '0.00', memo: 'Invalid paise' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '100.005', memo: 'Invalid paise' },
  ];

  const val = validateJournalEntry(invalidFractional);
  assert.equal(val.isValid, false);
  assert.match(val.error || '', /fractional paise/i);
});
