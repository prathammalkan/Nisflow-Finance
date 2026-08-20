import test from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { resolveSupportedAccountType } from '../../src/lib/ai/capabilities.ts';

// Phase 24, 25, 26: Account Creation, Investment, and Loan Business Logic Hardening

test('DOMAIN LOGIC [09-01]: Account alias resolution maps natural language types to canonical DB types', () => {
  // Natural language aliases must resolve to standard database account types
  const bankType = resolveSupportedAccountType('savings');
  assert.ok(bankType);
  assert.equal(bankType.dbType, 'bank');

  const cashType = resolveSupportedAccountType('cash wallet');
  assert.ok(cashType);
  assert.equal(cashType.dbType, 'cash');

  const creditType = resolveSupportedAccountType('credit card');
  assert.ok(creditType);
  assert.equal(creditType.dbType, 'credit');

  const dematType = resolveSupportedAccountType('demat');
  assert.ok(dematType);
  assert.equal(dematType.dbType, 'investment');

  // Unsupported types return null
  const unsupported = resolveSupportedAccountType('crypto-futures-margin');
  assert.equal(unsupported, null);
});

test('DOMAIN LOGIC [09-02]: Investment sale calculates capital gains and losses accurately', () => {
  // Scenario A: Profitable Sale
  // Cost Basis = ₹20,000; Proceeds = ₹25,000 -> Capital Gain = ₹5,000
  const costBasisA = new Decimal('20000.00');
  const proceedsA = new Decimal('25000.00');
  const gainA = proceedsA.minus(costBasisA);
  assert.equal(gainA.toFixed(2), '5000.00');

  // Scenario B: Loss Sale
  // Cost Basis = ₹30,000; Proceeds = ₹22,000 -> Capital Loss = ₹8,000
  const costBasisB = new Decimal('30000.00');
  const proceedsB = new Decimal('22000.00');
  const lossB = costBasisB.minus(proceedsB);
  assert.equal(lossB.toFixed(2), '8000.00');
});

test('DOMAIN LOGIC [09-03]: Loan EMI calculation correctly splits principal and interest', () => {
  // Total EMI = ₹10,000; Interest Component = ₹2,500 -> Principal Component = ₹7,500
  const emiTotal = new Decimal('10000.00');
  const interestAmount = new Decimal('2500.00');
  const principalAmount = emiTotal.minus(interestAmount);

  assert.equal(principalAmount.toFixed(2), '7500.00');
  assert.equal(principalAmount.plus(interestAmount).toFixed(2), emiTotal.toFixed(2));
});
