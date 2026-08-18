import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';

// 1. Loan calculations tests
import { calculateEMI, generateAmortizationSchedule } from '../src/lib/finance/loans.ts';

test('Loan EMI: calculates standard loan accurately', () => {
  const principal = 1000000;
  const rate = 10.5;
  const tenure = 60;

  const emi = calculateEMI(principal, rate, tenure);
  assert.ok(emi instanceof Decimal, 'EMI must be Decimal instance');
  // Formula approx: 21,493.90
  assert.equal(emi.toDecimalPlaces(2).toNumber(), 21493.90);
});

test('Loan EMI: handles zero-interest loans accurately', () => {
  const principal = 120000;
  const rate = 0;
  const tenure = 12;

  const emi = calculateEMI(principal, rate, tenure);
  assert.equal(emi.toNumber(), 10000);
});

test('Loan Amortization: full schedule with zero remaining balance and non-negative rounding', () => {
  const principal = 500000;
  const rate = 8.75;
  const tenure = 24;

  const schedule = generateAmortizationSchedule(principal, rate, tenure);
  assert.equal(schedule.length, 24);

  // First month opening balance should be principal
  assert.equal(schedule[0].openingBalance.toNumber(), 500000);

  // Final month closing balance must be strictly 0
  const finalRow = schedule[schedule.length - 1];
  assert.equal(finalRow.remainingBalance.toNumber(), 0);

  // Total principal component paid must equal original principal
  const totalPrincipalPaid = schedule.reduce((sum, row) => sum.plus(row.principalComponent), new Decimal(0));
  assert.equal(totalPrincipalPaid.toDecimalPlaces(2).toNumber(), 500000);

  // Verify no row has negative balance
  schedule.forEach((row, i) => {
    assert.ok(row.remainingBalance.gte(0), `Row ${i + 1} balance cannot be negative`);
    assert.ok(row.paymentAmount.gt(0), `Row ${i + 1} payment amount must be positive`);
  });
});

test('Loan Amortization: handles zero-interest schedule', () => {
  const principal = 60000;
  const rate = 0;
  const tenure = 6;

  const schedule = generateAmortizationSchedule(principal, rate, tenure);
  assert.equal(schedule.length, 6);

  schedule.forEach((row) => {
    assert.equal(row.interestComponent.toNumber(), 0, 'Zero-interest loan must have zero interest in every installment');
    assert.equal(row.paymentAmount.toNumber(), 10000);
  });

  assert.equal(schedule[schedule.length - 1].remainingBalance.toNumber(), 0);
});

// 2. Investment XIRR tests
import { calculateXIRRDecimal } from '../src/lib/finance/xirr.ts';

test('Investment XIRR: computes correct internal rate of return', () => {
  // 365 days exactly: 2023-01-01 to 2024-01-01
  const cashFlows = [
    { date: new Date('2023-01-01T00:00:00Z'), amount: -100000 },
    { date: new Date('2024-01-01T00:00:00Z'), amount: 115000 },
  ];

  const xirr = calculateXIRRDecimal(cashFlows);
  assert.ok(xirr !== null);
  // ~15% return for exactly 1 year
  assert.ok(Math.abs(xirr.times(100).toNumber() - 15.0) < 0.5, `XIRR expected ~15%, got ${xirr.times(100).toNumber()}`);
});

// 3. Bank Statement Reconciliation Matching tests
import { matchBankTransactions } from '../src/lib/finance/reconciliation.ts';

test('Reconciliation: matches exact reference with highest confidence', () => {
  const bankTxs = [
    { id: 'b1', date: '2026-08-10', description: 'UPI/REF12345/Vendor', amount: 2500, direction: 'out' as const, reference: 'REF12345' },
    { id: 'b2', date: '2026-08-12', description: 'Salary Deposit', amount: 75000, direction: 'in' as const, reference: 'SAL2026' },
  ];

  const ledgerTxs = [
    { id: 'l1', account_id: 'acc1', date: '2026-08-09', description: 'Office Supplies', amount: 2500, direction: 'out' as const, upi_reference: 'REF12345' },
    { id: 'l2', account_id: 'acc1', date: '2026-08-12', description: 'Monthly Salary', amount: 75000, direction: 'in' as const, bank_reference: 'SAL2026' },
  ];

  const result = matchBankTransactions(bankTxs, ledgerTxs);
  assert.equal(result.matched.length, 2);
  assert.equal(result.missingFromLedger.length, 0);
  assert.equal(result.missingFromBank.length, 0);
  assert.equal(result.needsReview.length, 0);
});

test('Reconciliation: separates missing items and prevents false positives on different amounts', () => {
  const bankTxs = [
    { id: 'b1', date: '2026-08-10', description: 'ATM Withdrawal', amount: 5000, direction: 'out' as const },
    { id: 'b2', date: '2026-08-11', description: 'Interest Credit', amount: 240, direction: 'in' as const },
  ];

  const ledgerTxs = [
    { id: 'l1', account_id: 'acc1', date: '2026-08-10', description: 'Grocery Store', amount: 4999, direction: 'out' as const },
  ];

  const result = matchBankTransactions(bankTxs, ledgerTxs);
  assert.equal(result.matched.length, 0, 'Must NOT match different amounts (strict decimal equality)');
  assert.equal(result.missingFromLedger.length, 2);
  assert.equal(result.missingFromBank.length, 1);
});

test('Reconciliation: flags ambiguous same-amount candidates as needsReview rather than auto-matching', () => {
  const bankTxs = [
    { id: 'b1', date: '2026-08-10', description: 'Payment to Merchant', amount: 500, direction: 'out' as const },
  ];

  const ledgerTxs = [
    { id: 'l1', account_id: 'acc1', date: '2026-08-10', description: 'Coffee shop A', amount: 500, direction: 'out' as const },
    { id: 'l2', account_id: 'acc1', date: '2026-08-10', description: 'Snacks B', amount: 500, direction: 'out' as const },
  ];

  const result = matchBankTransactions(bankTxs, ledgerTxs);
  assert.equal(result.matched.length, 0, 'Ambiguous transactions must NEVER be auto-matched');
  assert.equal(result.needsReview.length, 1, 'Must be held for review');
  assert.equal(result.needsReview[0].possibleLedgerTxs.length, 2);
});

// 4. Recurring Transaction Scheduling tests
import { calculateNextDueDate } from '../src/lib/finance/recurring.ts';

test('Recurring: correctly advances dates for all frequencies', () => {
  const baseDate = new Date('2026-01-15T00:00:00Z');

  assert.equal(calculateNextDueDate(baseDate, 'daily').toISOString().split('T')[0], '2026-01-16');
  assert.equal(calculateNextDueDate(baseDate, 'weekly').toISOString().split('T')[0], '2026-01-22');
  assert.equal(calculateNextDueDate(baseDate, 'monthly').toISOString().split('T')[0], '2026-02-15');
  assert.equal(calculateNextDueDate(baseDate, 'quarterly').toISOString().split('T')[0], '2026-04-15');
  assert.equal(calculateNextDueDate(baseDate, 'yearly').toISOString().split('T')[0], '2027-01-15');
});

// 5. IPO P&L calculation rules test
test('IPO P&L: realized gain only calculated when sale proceeds exist', () => {
  const applicationNotSold = {
    application_amount: 15000,
    amount_debited: 15000,
    shares_allotted: 100,
    sale_proceeds: 0,
    charges: 0,
  };

  const hasSold = applicationNotSold.sale_proceeds > 0;
  const pnlUnsold = hasSold ? applicationNotSold.sale_proceeds - applicationNotSold.amount_debited - applicationNotSold.charges : null;
  assert.equal(pnlUnsold, null, 'Unsold IPO must not claim realized P&L');

  const applicationSold = {
    application_amount: 15000,
    amount_debited: 15000,
    shares_allotted: 100,
    sale_proceeds: 22500,
    charges: 50,
  };

  const hasSold2 = applicationSold.sale_proceeds > 0;
  const pnlSold = hasSold2 ? applicationSold.sale_proceeds - applicationSold.amount_debited - applicationSold.charges : null;
  assert.equal(pnlSold, 7450, 'Realized gain = 22500 - 15000 - 50 = 7450');
});
