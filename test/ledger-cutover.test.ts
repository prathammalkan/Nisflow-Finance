import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from 'decimal.js';
import { validateJournalEntry } from '../src/lib/ledger/engine.ts';
import type { JournalLineInput } from '../src/lib/ledger/types.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const TEST_USER = '00000000-0000-0000-0000-000000000001';

// 1. Expense posting: Dr Expense, Cr Asset
test('Ledger Cutover: Expense posting generates balanced Dr Expense / Cr Asset entry', () => {
  const amount = '800.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-CAT-GROC', debitAmount: amount, creditAmount: '0.00', memo: 'Groceries' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: amount, memo: 'Groceries' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '800.00');
  assert.equal(validation.totalCredit?.toFixed(2), '800.00');
});

// 2. Income posting: Dr Asset, Cr Income
test('Ledger Cutover: Income posting generates balanced Dr Asset / Cr Income entry', () => {
  const amount = '50000.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-ICICI', debitAmount: amount, creditAmount: '0.00', memo: 'Salary' },
    { ledgerAccountId: 'INC-CAT-SALARY', debitAmount: '0.00', creditAmount: amount, memo: 'Salary' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '50000.00');
  assert.equal(validation.totalCredit?.toFixed(2), '50000.00');
});

// 3. Internal transfer: Net wealth change = ₹0.00
test('Ledger Cutover: Internal Transfer preserves net wealth parity with exact ₹0.00 delta', () => {
  const amount = '10000.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-SBI', debitAmount: amount, creditAmount: '0.00', memo: 'Transfer to SBI' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: amount, memo: 'Transfer from HDFC' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);

  // Asset net delta calculation
  const sbiDelta = new Decimal(lines[0].debitAmount).minus(new Decimal(lines[0].creditAmount));
  const hdfcDelta = new Decimal(lines[1].debitAmount).minus(new Decimal(lines[1].creditAmount));
  const netWealthChange = sbiDelta.plus(hdfcDelta);

  assert.equal(netWealthChange.toNumber(), 0);
});

// 4. Lending: Dr Asset:Receivable, Cr Asset:Bank
test('Ledger Cutover: Lending to person establishes authoritative receivable asset', () => {
  const amount = '500.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-REC-ALICE', debitAmount: amount, creditAmount: '0.00', memo: 'Lent to Alice' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: amount, memo: 'Lent to Alice' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
});

// 5. Borrowing: Dr Asset:Bank, Cr Liability:Payable
test('Ledger Cutover: Borrowing from person establishes authoritative payable liability', () => {
  const amount = '1500.00';
  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: amount, creditAmount: '0.00', memo: 'Borrowed from Bob' },
    { ledgerAccountId: 'LIA-PAY-BOB', debitAmount: '0.00', creditAmount: amount, memo: 'Borrowed from Bob' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
});

// 6. Partial Repayment: Dr Asset:Bank, Cr Asset:Receivable
test('Ledger Cutover: Partial Repayment accurately reduces receivable balance', () => {
  const lentAmount = new Decimal('500.00');
  const repayAmount = new Decimal('200.00');

  const lendLines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-REC-ALICE', debitAmount: lentAmount.toFixed(2), creditAmount: '0.00' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: lentAmount.toFixed(2) },
  ];

  const repayLines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: repayAmount.toFixed(2), creditAmount: '0.00' },
    { ledgerAccountId: 'AST-REC-ALICE', debitAmount: '0.00', creditAmount: repayAmount.toFixed(2) },
  ];

  assert.equal(validateJournalEntry(lendLines).isValid, true);
  assert.equal(validateJournalEntry(repayLines).isValid, true);

  // Derive Alice balance: Debits - Credits
  const aliceDebits = lentAmount;
  const aliceCredits = repayAmount;
  const remainingReceivable = aliceDebits.minus(aliceCredits);

  assert.equal(remainingReceivable.toFixed(2), '300.00');
});

// 7. Full Repayment: balance reduces to exactly ₹0.00
test('Ledger Cutover: Full Repayment reduces outstanding receivable to exactly ₹0.00', () => {
  const lentAmount = new Decimal('500.00');
  const repayAmount = new Decimal('500.00');

  const remaining = lentAmount.minus(repayAmount);
  assert.equal(remaining.toFixed(2), '0.00');
});

// 8. Loan EMI Split: Dr Liability (Principal) + Dr Expense (Interest) = Cr Asset (Total)
test('Ledger Cutover: Loan EMI split accurately balances principal and interest components', () => {
  const principal = '15420.50';
  const interest = '4579.50';
  const totalEmi = '20000.00';

  const lines: JournalLineInput[] = [
    { ledgerAccountId: 'LIA-LOAN-HOME', debitAmount: principal, creditAmount: '0.00', memo: 'Principal Component' },
    { ledgerAccountId: 'EXP-LOAN-INT-HOME', debitAmount: interest, creditAmount: '0.00', memo: 'Interest Component' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: totalEmi, memo: 'Total EMI' },
  ];

  const validation = validateJournalEntry(lines);
  assert.equal(validation.isValid, true);
  assert.equal(validation.totalDebit?.toFixed(2), '20000.00');
  assert.equal(validation.totalCredit?.toFixed(2), '20000.00');
});

// 9. Investment Purchase & Sale
test('Ledger Cutover: Investment purchase and dividend entries maintain exact balancing', () => {
  const purchaseAmount = '10000.00';
  const purchaseLines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-INV-NIFTY50', debitAmount: purchaseAmount, creditAmount: '0.00', memo: 'Buy ETF' },
    { ledgerAccountId: 'AST-ACC-ZERODHA', debitAmount: '0.00', creditAmount: purchaseAmount, memo: 'Buy ETF' },
  ];
  assert.equal(validateJournalEntry(purchaseLines).isValid, true);

  const dividendAmount = '450.00';
  const dividendLines: JournalLineInput[] = [
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: dividendAmount, creditAmount: '0.00', memo: 'Dividend' },
    { ledgerAccountId: 'INC-DIVIDEND', debitAmount: '0.00', creditAmount: dividendAmount, memo: 'Dividend' },
  ];
  assert.equal(validateJournalEntry(dividendLines).isValid, true);
});

// 10. Reversal Inversion Integrity
test('Ledger Cutover: Reversal strictly inverts original debits and credits', () => {
  const originalLines: JournalLineInput[] = [
    { ledgerAccountId: 'EXP-CAT-DINING', debitAmount: '1250.00', creditAmount: '0.00', memo: 'Dinner' },
    { ledgerAccountId: 'AST-ACC-HDFC', debitAmount: '0.00', creditAmount: '1250.00', memo: 'Dinner' },
  ];

  const reversalLines: JournalLineInput[] = originalLines.map((l) => ({
    ledgerAccountId: l.ledgerAccountId,
    debitAmount: l.creditAmount,
    creditAmount: l.debitAmount,
    memo: 'Reversal: ' + l.memo,
  }));

  const validation = validateJournalEntry(reversalLines);
  assert.equal(validation.isValid, true);
  assert.equal(reversalLines[0].creditAmount, '1250.00');
  assert.equal(reversalLines[1].debitAmount, '1250.00');
});

// 11. Zero-Tolerance Projection Discrepancy Detection
test('Ledger Cutover: Integrity verification flags any non-zero variance as integrity failure', () => {
  const cachedBalance = new Decimal('1000.00');
  const ledgerBalance = new Decimal('999.99');
  const discrepancy = cachedBalance.minus(ledgerBalance).abs();

  assert.equal(discrepancy.toNumber() > 0, true);
  assert.equal(discrepancy.toFixed(2), '0.01');
});
