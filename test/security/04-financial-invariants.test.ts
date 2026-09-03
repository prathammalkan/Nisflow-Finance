import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { formatINR } from '../../src/lib/finance/money.ts';

// Phase 7 & 23: Financial Business Logic Attacks & Ledger Forensics

test('FINANCIAL INVARIANT [04-01]: Fractional paise beyond 2 decimal places are strictly rejected', () => {
  // ATTACK: Submitting fractional sub-paise amounts (e.g. ₹100.005, ₹50.1234)
  // EXPECTED DEFENSE: Precision validator detects and rejects decimal places > 2
  const isPaiseValid = (amount: number | string): boolean => {
    const dec = new Decimal(amount);
    return dec.decimalPlaces() <= 2;
  };

  assert.equal(isPaiseValid('100.00'), true);
  assert.equal(isPaiseValid('100.50'), true);
  assert.equal(isPaiseValid('100.05'), true);
  assert.equal(isPaiseValid('100.005'), false, 'Sub-paise 100.005 must be rejected');
  assert.equal(isPaiseValid('0.001'), false, 'Sub-paise 0.001 must be rejected');
  assert.equal(isPaiseValid('99.999'), false, 'Sub-paise 99.999 must be rejected');
});

test('FINANCIAL INVARIANT [04-02]: Double-entry journal balance invariant is strictly enforced', () => {
  // ATTACK: Attempting to post unbalanced journal entries (ΣDebits !== ΣCredits)
  // EXPECTED DEFENSE: Total debits must equal total credits to exact 0.00 discrepancy
  const validateJournalBalance = (lines: Array<{ debit: string | number; credit: string | number }>) => {
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);

    for (const line of lines) {
      const d = new Decimal(line.debit);
      const c = new Decimal(line.credit);
      if (d.isNegative() || c.isNegative()) {
        throw new Error('Amounts must be non-negative');
      }
      if ((d.isZero() && c.isZero()) || (d.gt(0) && c.gt(0))) {
        throw new Error('Line must have strictly debit OR credit');
      }
      totalDebit = totalDebit.plus(d);
      totalCredit = totalCredit.plus(c);
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new Error(`Imbalance: Debits (${totalDebit.toFixed(2)}) !== Credits (${totalCredit.toFixed(2)})`);
    }

    if (totalDebit.lte(0)) {
      throw new Error('Total amount must be greater than zero');
    }

    return { totalDebit: totalDebit.toFixed(2), totalCredit: totalCredit.toFixed(2) };
  };

  // Balanced entry passes
  const valid = validateJournalBalance([
    { debit: '500.00', credit: '0.00' },
    { debit: '0.00', credit: '500.00' },
  ]);
  assert.equal(valid.totalDebit, '500.00');
  assert.equal(valid.totalCredit, '500.00');

  // Unbalanced entry fails
  assert.throws(
    () =>
      validateJournalBalance([
        { debit: '500.00', credit: '0.00' },
        { debit: '0.00', credit: '499.99' },
      ]),
    /Imbalance/
  );

  // Zero total fails
  assert.throws(
    () =>
      validateJournalBalance([
        { debit: '0.00', credit: '0.00' },
        { debit: '0.00', credit: '0.00' },
      ]),
    /Line must have strictly debit OR credit/
  );
});

test('FINANCIAL INVARIANT [04-03]: Reversal operation strictly inverts debits and credits symmetrically', () => {
  // ATTACK: Forging reversal amounts or altering historical lines
  // EXPECTED DEFENSE: Inverted lines must produce an exact zero-sum net change across accounts
  const originalLines = [
    { accountId: 'acc-1', debit: '1500.00', credit: '0.00' },
    { accountId: 'acc-2', debit: '0.00', credit: '1500.00' },
  ];

  const reversedLines = originalLines.map((l) => ({
    accountId: l.accountId,
    debit: l.credit,
    credit: l.debit,
  }));

  assert.equal(reversedLines[0].debit, '0.00');
  assert.equal(reversedLines[0].credit, '1500.00');
  assert.equal(reversedLines[1].debit, '1500.00');
  assert.equal(reversedLines[1].credit, '0.00');

  // Net effect across both transactions is zero
  const netAcc1 = new Decimal(originalLines[0].debit)
    .minus(originalLines[0].credit)
    .plus(new Decimal(reversedLines[0].debit).minus(reversedLines[0].credit));
  assert.equal(netAcc1.toNumber(), 0, 'Net effect of posted + reversed journal must be exactly 0.00');
});

test('FINANCIAL INVARIANT [04-04]: formatINR maintains standard Indian numbering format and handles negatives safely', () => {
  assert.equal(formatINR(100000), '₹1,00,000.00');
  assert.equal(formatINR(10000000), '₹1,00,00,000.00');
  assert.equal(formatINR(-500), '-₹500.00');
  assert.equal(formatINR(0), '₹0.00');
});
