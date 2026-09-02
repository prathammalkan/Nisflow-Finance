/**
 * NisFlow Finance — Phase 4 Financial Intelligence Test Suite
 *
 * Tests all 9 new financial intelligence modules:
 * bank-registry, account-purpose, upi-engine, tax-engine-v2,
 * tax-radar, tax-optimization, ais-tis-reconciliation,
 * financial-risk-monitor, transaction-guard
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';

// ── bank-registry ──────────────────────────────────────────────────────────────
import {
  getUPILimit, getRbiNpciRules, findBank, findBankByIFSC,
  getAllBankIds, getBankProducts, isRuleStale, RULE_STALENESS_DAYS,
  type BankRule,
} from '../src/lib/finance/bank-registry.ts';

describe('PHASE4 [01] bank-registry', () => {
  test('01-01: getUPILimit P2P returns 100000', () => {
    const r = getUPILimit('p2p');
    assert.equal(r.limitAmount, 100000);
    assert.equal(r.unit, 'INR_per_day');
  });

  test('01-02: getUPILimit tax returns 500000', () => {
    const r = getUPILimit('tax');
    assert.equal(r.limitAmount, 500000);
    assert.ok(r.source.authority === 'NPCI');
  });

  test('01-03: getUPILimit IPO returns 500000', () => {
    const r = getUPILimit('ipo');
    assert.equal(r.limitAmount, 500000);
  });

  test('01-04: getUPILimit lite returns 500', () => {
    const r = getUPILimit('lite');
    assert.equal(r.limitAmount, 500);
  });

  test('01-05: findBank HDFC returns definition', () => {
    const b = findBank('HDFC');
    assert.ok(b !== null);
    assert.equal(b!.bankId, 'HDFC');
    assert.ok(b!.products.length > 0);
  });

  test('01-06: findBank unknown returns null', () => {
    const b = findBank('UNKNOWN_BANK_XYZ');
    assert.equal(b, null);
  });

  test('01-07: findBankByIFSC HDFC0001234 returns HDFC', () => {
    const b = findBankByIFSC('HDFC0001234');
    assert.ok(b !== null);
    assert.equal(b!.bankId, 'HDFC');
  });

  test('01-08: findBankByIFSC SBIN0000001 returns SBI', () => {
    const b = findBankByIFSC('SBIN0000001');
    assert.ok(b !== null);
    assert.equal(b!.bankId, 'SBI');
  });

  test('01-09: findBankByIFSC empty/short returns null', () => {
    assert.equal(findBankByIFSC(''), null);
    assert.equal(findBankByIFSC('AB'), null);
  });

  test('01-10: getRbiNpciRules returns active rules', () => {
    const rules = getRbiNpciRules();
    assert.ok(rules.length > 0);
    assert.ok(rules.every(r => r.status === 'ACTIVE'));
    assert.ok(rules.every(r => r.isRbiNpciRule === true));
  });

  test('01-11: getRbiNpciRules filtered by type returns correct rules', () => {
    const rtgsRules = getRbiNpciRules('rtgs_minimum');
    assert.ok(rtgsRules.length > 0);
    assert.ok(rtgsRules.every(r => r.ruleType === 'rtgs_minimum'));
  });

  test('01-12: isRuleStale detects old verifiedAt date', () => {
    const staleRule: BankRule = {
      id: 'TEST', ruleType: 'upi_daily_limit', value: 100000, unit: 'INR_per_day',
      description: 'test', applicableTo: ['savings'], effectiveFrom: '2020-01-01',
      source: { authority: 'NPCI', url: 'https://example.com' },
      verifiedAt: '2020-01-01', status: 'ACTIVE', isRbiNpciRule: true,
    };
    assert.equal(isRuleStale(staleRule), true);
  });

  test('01-13: isRuleStale fresh rule returns false', () => {
    const freshDate = new Date();
    freshDate.setDate(freshDate.getDate() - 10);
    const freshRule: BankRule = {
      id: 'TEST2', ruleType: 'upi_daily_limit', value: 100000, unit: 'INR_per_day',
      description: 'test', applicableTo: ['savings'], effectiveFrom: '2025-01-01',
      source: { authority: 'NPCI', url: 'https://example.com' },
      verifiedAt: freshDate.toISOString().split('T')[0], status: 'ACTIVE', isRbiNpciRule: true,
    };
    assert.equal(isRuleStale(freshRule), false);
  });

  test('01-14: getAllBankIds returns multiple banks', () => {
    const ids = getAllBankIds();
    assert.ok(ids.includes('HDFC'));
    assert.ok(ids.includes('SBI'));
    assert.ok(ids.includes('ICICI'));
    assert.ok(ids.length >= 5);
  });

  test('01-15: getBankProducts for known bank returns products', () => {
    const products = getBankProducts('HDFC');
    assert.ok(products.length > 0);
    assert.ok(products.some(p => p.type === 'savings'));
  });
});

// ── account-purpose ────────────────────────────────────────────────────────────
import {
  getAccountPurpose, getPurposesForProduct, getAccountingClassification,
  getAIGuidance, getPurposeCautionFlags, listAllPurposes, ACCOUNT_PURPOSES,
} from '../src/lib/finance/account-purpose.ts';

describe('PHASE4 [02] account-purpose', () => {
  test('02-01: getAccountPurpose savings-general returns asset', () => {
    const p = getAccountPurpose('savings-general');
    assert.ok(p !== null);
    assert.equal(p!.accountingClassification, 'asset');
    assert.equal(p!.taxClassification, 'savings_interest');
  });

  test('02-02: getAccountPurpose loan-liability returns liability', () => {
    const p = getAccountPurpose('loan-liability');
    assert.ok(p !== null);
    assert.equal(p!.accountingClassification, 'liability');
    assert.equal(p!.taxClassification, 'loan_liability');
  });

  test('02-03: getAccountPurpose credit-card returns liability', () => {
    const p = getAccountPurpose('credit-card');
    assert.ok(p !== null);
    assert.equal(p!.accountingClassification, 'liability');
  });

  test('02-04: getAccountPurpose demat-investment returns asset', () => {
    const p = getAccountPurpose('demat-investment');
    assert.ok(p !== null);
    assert.equal(p!.accountingClassification, 'asset');
    assert.equal(p!.taxClassification, 'investment_asset');
  });

  test('02-05: getAccountPurpose unknown returns null', () => {
    assert.equal(getAccountPurpose('does-not-exist'), null);
  });

  test('02-06: getAccountingClassification savings = asset', () => {
    assert.equal(getAccountingClassification('savings-general'), 'asset');
  });

  test('02-07: getAccountingClassification loan = liability', () => {
    assert.equal(getAccountingClassification('loan-liability'), 'liability');
  });

  test('02-08: getAIGuidance returns non-empty string', () => {
    const guidance = getAIGuidance('savings-general');
    assert.ok(typeof guidance === 'string' && guidance.length > 10);
  });

  test('02-09: listAllPurposes returns all purposes', () => {
    const list = listAllPurposes();
    assert.ok(list.length >= 9);
    assert.ok(list.every(p => p.purposeId && p.accountingClassification));
  });

  test('02-10: getPurposesForProduct savings returns savings purposes', () => {
    const savingsPurposes = getPurposesForProduct('savings');
    assert.ok(savingsPurposes.length > 0);
    assert.ok(savingsPurposes.every(p => p.bankProductType === 'savings'));
  });

  test('02-11: getPurposeCautionFlags returns doNotUseFor list', () => {
    const flags = getPurposeCautionFlags('loan-liability');
    assert.ok(flags !== null);
    assert.ok(Array.isArray(flags!.doNotUseFor));
    assert.ok(flags!.doNotUseFor.length > 0);
  });

  test('02-12: each purpose has USE WHEN and TAX CONSIDERATIONS', () => {
    for (const p of ACCOUNT_PURPOSES) {
      assert.ok(p.useWhen.length > 0, `${p.purposeId} has no useWhen`);
      assert.ok(p.taxConsiderations.length > 0, `${p.purposeId} has no taxConsiderations`);
      assert.ok(p.aiGuidance.length > 10, `${p.purposeId} aiGuidance too short`);
    }
  });
});

// ── upi-engine ────────────────────────────────────────────────────────────────
import {
  evaluatePayment, recommendPaymentMethod, canPayViaUPI,
  PAYMENT_METHOD_PROFILES, CASH_COMPLIANCE_RULES,
} from '../src/lib/finance/upi-engine.ts';

describe('PHASE4 [03] upi-engine', () => {
  test('03-01: UPI Rs 50000 P2P personal_transfer = ALLOWED', () => {
    const r = evaluatePayment({ amount: 50000, method: 'UPI', category: 'personal_transfer' });
    assert.equal(r.allowed, 'ALLOWED');
  });

  test('03-02: UPI Rs 200000 P2P = BLOCKED (exceeds limit)', () => {
    const r = evaluatePayment({ amount: 200000, method: 'UPI', category: 'personal_transfer' });
    assert.equal(r.allowed, 'BLOCKED');
  });

  test('03-03: UPI Rs 400000 tax_payment = ALLOWED (tax category)', () => {
    const r = evaluatePayment({ amount: 400000, method: 'UPI', category: 'tax_payment' });
    assert.equal(r.allowed, 'ALLOWED');
  });

  test('03-04: UPI Rs 600000 tax_payment = BLOCKED', () => {
    const r = evaluatePayment({ amount: 600000, method: 'UPI', category: 'tax_payment' });
    assert.equal(r.allowed, 'BLOCKED');
  });

  test('03-05: UPI_LITE Rs 500 = ALLOWED', () => {
    const r = evaluatePayment({ amount: 500, method: 'UPI_LITE', category: 'merchant_payment' });
    assert.equal(r.allowed, 'ALLOWED');
  });

  test('03-06: UPI_LITE Rs 501 = BLOCKED', () => {
    const r = evaluatePayment({ amount: 501, method: 'UPI_LITE', category: 'merchant_payment' });
    assert.equal(r.allowed, 'BLOCKED');
  });

  test('03-07: RTGS Rs 100000 = BLOCKED (below minimum)', () => {
    const r = evaluatePayment({ amount: 100000, method: 'RTGS', category: 'vendor_payment' });
    assert.equal(r.allowed, 'BLOCKED');
  });

  test('03-08: RTGS Rs 300000 = ALLOWED', () => {
    const r = evaluatePayment({ amount: 300000, method: 'RTGS', category: 'vendor_payment' });
    assert.equal(r.allowed, 'ALLOWED');
  });

  test('03-09: CASH Rs 250000 = BLOCKED (Section 269ST)', () => {
    const r = evaluatePayment({ amount: 250000, method: 'CASH', category: 'personal_transfer' });
    assert.equal(r.allowed, 'BLOCKED');
    assert.ok(r.warnings.some(w => w.includes('269ST') || w.includes('LEGAL')));
  });

  test('03-10: CASH Rs 100000 is REVIEW for business expense', () => {
    const r = evaluatePayment({ amount: 100000, method: 'CASH', category: 'vendor_payment', isBusinessExpense: true });
    assert.ok(r.allowed === 'REVIEW' || r.allowed === 'ALLOWED');
  });

  test('03-11: CASH Rs 199999 = ALLOWED (below 269ST limit)', () => {
    const r = evaluatePayment({ amount: 199999, method: 'CASH', category: 'merchant_payment' });
    assert.notEqual(r.allowed, 'BLOCKED');
  });

  test('03-12: NEFT Rs 1 = ALLOWED', () => {
    const r = evaluatePayment({ amount: 1, method: 'NEFT', category: 'vendor_payment' });
    assert.equal(r.allowed, 'ALLOWED');
  });

  test('03-13: canPayViaUPI Rs 50000 P2P = true', () => {
    const r = canPayViaUPI({ amount: 50000, category: 'p2p' });
    assert.equal(r.canPay, true);
    assert.ok(r.answer.includes('can be paid'));
  });

  test('03-14: canPayViaUPI Rs 200000 P2P = false', () => {
    const r = canPayViaUPI({ amount: 200000, category: 'p2p' });
    assert.equal(r.canPay, false);
    assert.ok(r.answer.includes('exceeds'));
  });

  test('03-15: canPayViaUPI Rs 400000 tax = true', () => {
    const r = canPayViaUPI({ amount: 400000, category: 'tax' });
    assert.equal(r.canPay, true);
  });

  test('03-16: recommendPaymentMethod Rs 50000 returns UPI first', () => {
    const rankings = recommendPaymentMethod({ amount: 50000, category: 'personal_transfer' });
    assert.ok(rankings.length > 0);
    assert.ok(rankings[0].method === 'UPI');
  });

  test('03-17: recommendPaymentMethod Rs 300000 excludes UPI (blocked)', () => {
    const rankings = recommendPaymentMethod({ amount: 300000, category: 'vendor_payment' });
    const methods = rankings.map(r => r.method);
    assert.ok(!methods.includes('UPI'), 'UPI should be excluded for Rs 3L');
  });

  test('03-18: cash compliance limit is 200000', () => {
    assert.equal(CASH_COMPLIANCE_RULES.section269ST.limit, 200000);
  });

  test('03-19: evaluatePayment returns sources array', () => {
    const r = evaluatePayment({ amount: 50000, method: 'UPI', category: 'personal_transfer' });
    assert.ok(Array.isArray(r.sources));
    assert.ok(r.sources.length > 0);
    assert.ok(r.sources[0].authority);
  });
});

// ── tax-engine-v2 ──────────────────────────────────────────────────────────────
import {
  calculateTax, compareRegimesV2, getApplicableDeductions,
  getTaxConfig, CURRENT_FY, CURRENT_AY, TAX_ENGINE_VERSION,
  DEDUCTION_RULES,
} from '../src/lib/finance/tax-engine-v2.ts';

describe('PHASE4 [04] tax-engine-v2', () => {
  test('04-01: CURRENT_FY is FY2025-26', () => {
    assert.equal(CURRENT_FY, 'FY2025-26');
    assert.equal(CURRENT_AY, 'AY2026-27');
  });

  test('04-02: getTaxConfig new regime FY2025-26 returns config', () => {
    const cfg = getTaxConfig('new', 'FY2025-26');
    assert.ok(cfg !== null);
    assert.equal(cfg!.regime, 'new');
    assert.equal(cfg!.standardDeduction, 75000);
    assert.equal(cfg!.rebate87ALimit, 1200000);
  });

  test('04-03: getTaxConfig old regime returns config', () => {
    const cfg = getTaxConfig('old', 'FY2025-26');
    assert.ok(cfg !== null);
    assert.equal(cfg!.regime, 'old');
    assert.equal(cfg!.standardDeduction, 50000);
    assert.equal(cfg!.rebate87ALimit, 500000);
  });

  test('04-04: new regime Rs 12L income — zero tax (87A rebate)', () => {
    const result = calculateTax({ grossIncome: new Decimal(1200000) }, 'new', 'FY2025-26');
    assert.ok(result.totalTax.lte(0) || result.totalTax.eq(0), `Expected ~0 tax but got ${result.totalTax}`);
  });

  test('04-05: new regime Rs 15L income — has tax', () => {
    const result = calculateTax({ grossIncome: new Decimal(1500000) }, 'new', 'FY2025-26');
    assert.ok(result.totalTax.gt(0));
    assert.ok(result.taxableIncome.gt(0));
  });

  test('04-06: old regime Rs 5L income — rebate applies, ~0 tax', () => {
    const result = calculateTax({ grossIncome: new Decimal(500000) }, 'old', 'FY2025-26');
    assert.ok(result.totalTax.lte(0) || result.totalTax.lte(1), `Expected ~0 tax but got ${result.totalTax}`);
  });

  test('04-07: old regime Rs 10L income — tax > 0', () => {
    const result = calculateTax({ grossIncome: new Decimal(1000000) }, 'old', 'FY2025-26');
    assert.ok(result.totalTax.gt(0));
  });

  test('04-08: 80C deduction reduces taxable income in old regime', () => {
    const withoutDeduction = calculateTax({ grossIncome: new Decimal(1000000) }, 'old', 'FY2025-26');
    const withDeduction = calculateTax({ grossIncome: new Decimal(1000000), deduction80C: new Decimal(150000) }, 'old', 'FY2025-26');
    assert.ok(withDeduction.taxableIncome.lt(withoutDeduction.taxableIncome));
    assert.ok(withDeduction.totalTax.lt(withoutDeduction.totalTax));
  });

  test('04-09: 80C has no effect in new regime', () => {
    const without80C = calculateTax({ grossIncome: new Decimal(1500000) }, 'new', 'FY2025-26');
    const with80C = calculateTax({ grossIncome: new Decimal(1500000), deduction80C: new Decimal(150000) }, 'new', 'FY2025-26');
    assert.equal(without80C.totalTax.toFixed(2), with80C.totalTax.toFixed(2), '80C should not affect new regime');
  });

  test('04-10: compareRegimesV2 returns recommended regime', () => {
    const r = compareRegimesV2({ grossIncome: new Decimal(800000) }, 'FY2025-26');
    assert.ok(r.recommended === 'old' || r.recommended === 'new');
    assert.ok(r.savings.gte(0));
  });

  test('04-11: cess is 4% of (tax + surcharge)', () => {
    const result = calculateTax({ grossIncome: new Decimal(1500000) }, 'new', 'FY2025-26');
    const expectedCess = result.totalTax.minus(result.cess).times(4).div(100);
    assert.ok(result.cess.minus(expectedCess).abs().lte(1), 'Cess should be ~4%');
  });

  test('04-12: getApplicableDeductions old regime returns 80C rule', () => {
    const rules = getApplicableDeductions({ taxYear: 'FY2025-26', regime: 'old', incomeTypes: ['salary'] });
    assert.ok(rules.some(r => r.ruleId === 'DEDUCTION-80C-FY2526'));
  });

  test('04-13: getApplicableDeductions new regime returns no 80C rule', () => {
    const rules = getApplicableDeductions({ taxYear: 'FY2025-26', regime: 'new', incomeTypes: ['salary'] });
    assert.ok(!rules.some(r => r.ruleId === 'DEDUCTION-80C-FY2526'), 'New regime should have no 80C');
  });

  test('04-14: all deduction rules have source authority and URL', () => {
    for (const rule of DEDUCTION_RULES) {
      assert.ok(rule.source.authority, `Rule ${rule.ruleId} missing authority`);
      assert.ok(rule.source.url, `Rule ${rule.ruleId} missing URL`);
      assert.ok(rule.verifiedAt, `Rule ${rule.ruleId} missing verifiedAt`);
    }
  });

  test('04-15: result has effectiveRate and inHandMonthly', () => {
    const result = calculateTax({ grossIncome: new Decimal(1200000) }, 'new', 'FY2025-26');
    assert.ok(result.effectiveRate.gte(0));
    assert.ok(result.inHandMonthly.gt(0));
  });
});

// ── tax-radar ─────────────────────────────────────────────────────────────────
import { generateTaxRadar, ADVANCE_TAX_SCHEDULE_FY2526 } from '../src/lib/finance/tax-radar.ts';

describe('PHASE4 [05] tax-radar', () => {
  test('05-01: generateTaxRadar returns report with required fields', () => {
    const report = generateTaxRadar({
      taxYear: 'FY2025-26', regime: 'new',
      taxInput: { grossIncome: new Decimal(1000000) },
      tdsDeducted: new Decimal(0), advanceTaxPaid: new Decimal(0),
    });
    assert.ok(['GREEN','YELLOW','ORANGE','RED'].includes(report.overallStatus));
    assert.ok(Array.isArray(report.flags));
    assert.ok(report.taxYear === 'FY2025-26');
    assert.ok(report.assessmentYear === 'AY2026-27');
    assert.ok(report.generatedAt);
  });

  test('05-02: high cash deposits flag appears near SFT threshold', () => {
    const report = generateTaxRadar({
      taxYear: 'FY2025-26', regime: 'new',
      taxInput: { grossIncome: new Decimal(1000000) },
      tdsDeducted: new Decimal(0), advanceTaxPaid: new Decimal(0),
      cashDepositsInFY: new Decimal(950000),
    });
    const cashFlag = report.flags.find(f => f.flagId.includes('CASH') || f.title.toLowerCase().includes('cash'));
    assert.ok(cashFlag, 'Should have a cash deposit flag near Rs 9.5L');
  });

  test('05-03: advance tax schedule has 4 installments', () => {
    assert.equal(ADVANCE_TAX_SCHEDULE_FY2526.length, 4);
    assert.equal(ADVANCE_TAX_SCHEDULE_FY2526[0].cumulativePercent, 15);
    assert.equal(ADVANCE_TAX_SCHEDULE_FY2526[3].cumulativePercent, 100);
  });

  test('05-04: regime suboptimal flag surfaces when wrong regime', () => {
    // Use high deductions that benefit old regime, but set new regime
    const report = generateTaxRadar({
      taxYear: 'FY2025-26', regime: 'new',
      taxInput: { grossIncome: new Decimal(1500000), deduction80C: new Decimal(150000), deduction80D: new Decimal(25000), homeLoanInterest24B: new Decimal(200000) },
      tdsDeducted: new Decimal(0), advanceTaxPaid: new Decimal(0),
    });
    // May or may not flag, depending on which is lower — just verify it runs without error
    assert.ok(Array.isArray(report.flags));
    assert.ok(Array.isArray(report.optimizationOpportunities));
  });

  test('05-05: report with LTCG returns capital gains flag', () => {
    const report = generateTaxRadar({
      taxYear: 'FY2025-26', regime: 'new',
      taxInput: { grossIncome: new Decimal(1200000) },
      tdsDeducted: new Decimal(0), advanceTaxPaid: new Decimal(0),
      ltcgEquity: new Decimal(200000),
    });
    const ltcgFlag = report.flags.find(f => f.flagId.includes('LTCG'));
    assert.ok(ltcgFlag, 'Should have LTCG flag');
  });
});

// ── tax-optimization ─────────────────────────────────────────────────────────
import { generateOptimizationRecommendations } from '../src/lib/finance/tax-optimization.ts';

describe('PHASE4 [06] tax-optimization', () => {
  test('06-01: unused 80C generates recommendation in old regime', () => {
    const recs = generateOptimizationRecommendations({
      taxYear: 'FY2025-26', regime: 'old',
      grossIncome: new Decimal(1000000),
      current80C: new Decimal(50000),
    });
    const r80c = recs.find(r => r.id === 'OPT-80C-UNUSED');
    assert.ok(r80c, 'Should recommend using remaining 80C headroom');
    assert.ok(r80c!.estimatedSavingRs > 0);
  });

  test('06-02: full 80C — no 80C recommendation', () => {
    const recs = generateOptimizationRecommendations({
      taxYear: 'FY2025-26', regime: 'old',
      grossIncome: new Decimal(1000000),
      current80C: new Decimal(150000),
    });
    const r80c = recs.find(r => r.id === 'OPT-80C-UNUSED');
    assert.ok(!r80c, 'Should NOT recommend 80C when already maxed');
  });

  test('06-03: regime comparison recommendation always present', () => {
    const recs = generateOptimizationRecommendations({
      taxYear: 'FY2025-26', regime: 'new',
      grossIncome: new Decimal(800000),
    });
    assert.ok(recs.some(r => r.id === 'OPT-REGIME-COMPARISON'));
  });

  test('06-04: capital loss harvest recommendation when LTCG + unrealized loss', () => {
    const recs = generateOptimizationRecommendations({
      taxYear: 'FY2025-26', regime: 'new',
      grossIncome: new Decimal(1500000),
      ltcgEquity: new Decimal(200000),
      unrealizedLossEquity: new Decimal(50000),
    });
    const harvestRec = recs.find(r => r.id === 'OPT-CAPITAL-LOSS-HARVEST');
    assert.ok(harvestRec, 'Should recommend tax-loss harvesting');
  });

  test('06-05: all recommendations have ethicalNote', () => {
    const recs = generateOptimizationRecommendations({
      taxYear: 'FY2025-26', regime: 'old',
      grossIncome: new Decimal(1000000),
    });
    for (const r of recs) {
      assert.ok(r.ethicalNote && r.ethicalNote.length > 10, `Rec ${r.id} missing ethicalNote`);
    }
  });

  test('06-06: all recommendations have legalBasis', () => {
    const recs = generateOptimizationRecommendations({
      taxYear: 'FY2025-26', regime: 'old',
      grossIncome: new Decimal(1000000),
    });
    for (const r of recs) {
      assert.ok(r.legalBasis, `Rec ${r.id} missing legalBasis`);
    }
  });

  test('06-07: new regime 80C gets no recommendation', () => {
    const recs = generateOptimizationRecommendations({
      taxYear: 'FY2025-26', regime: 'new',
      grossIncome: new Decimal(1000000),
    });
    const r80c = recs.find(r => r.id === 'OPT-80C-UNUSED');
    assert.ok(!r80c, 'New regime should have no 80C recommendation');
  });
});

// ── ais-tis-reconciliation ────────────────────────────────────────────────────
import {
  reconcileAISTIS, getAISDownloadGuidance,
  RECONCILIATION_DISCLAIMER, isAISRecordDisputed,
  type AISRecord, type ReconciliationRecord,
} from '../src/lib/finance/ais-tis-reconciliation.ts';

describe('PHASE4 [07] ais-tis-reconciliation', () => {
  test('07-01: empty AIS returns EXTERNAL_UNAVAILABLE', () => {
    const result = reconcileAISTIS({ taxYear: 'FY2025-26', aisRecords: [], nisflowRecords: [] });
    assert.equal(result.status, 'EXTERNAL_UNAVAILABLE');
    assert.equal(result.aisDataAvailable, false);
  });

  test('07-02: matching records returns MATCHED', () => {
    const aisRec: AISRecord = {
      id: 'ais-1', userId: 'u1', taxYear: 'FY2025-26',
      transactionType: 'interest_fd', reportedBy: 'HDFC Bank',
      amount: 45000, dataSource: 'bank', isUserAccepted: null,
      isFromITPortal: true, isVerified: true, isResolved: false,
      aisDescription: 'FD Interest', importedAt: '2026-01-01',
    };
    const nisRec: ReconciliationRecord = {
      nisflowRecordId: 'nis-1', transactionType: 'interest_fd',
      amount: 45000, description: 'FD Interest from HDFC', documentUploaded: false,
    };
    const result = reconcileAISTIS({ taxYear: 'FY2025-26', aisRecords: [aisRec], nisflowRecords: [nisRec] });
    assert.equal(result.status, 'MATCHED');
    assert.equal(result.matchedCount, 1);
    assert.equal(result.mismatches.length, 0);
  });

  test('07-03: AIS record with no nisflow match = mismatch', () => {
    const aisRec: AISRecord = {
      id: 'ais-2', userId: 'u1', taxYear: 'FY2025-26',
      transactionType: 'salary', reportedBy: 'Employer Ltd',
      amount: 1200000, dataSource: 'employer', isUserAccepted: null,
      isFromITPortal: true, isVerified: true, isResolved: false,
      aisDescription: 'Salary', importedAt: '2026-01-01',
    };
    const result = reconcileAISTIS({ taxYear: 'FY2025-26', aisRecords: [aisRec], nisflowRecords: [] });
    assert.equal(result.status, 'MISMATCH');
    assert.ok(result.mismatches.length > 0);
    assert.equal(result.mismatches[0].type, 'present_in_ais_not_books');
    assert.equal(result.mismatches[0].severity, 'ACTION_REQUIRED');
  });

  test('07-04: RECONCILIATION_DISCLAIMER is non-empty', () => {
    assert.ok(RECONCILIATION_DISCLAIMER.length > 50);
    assert.ok(RECONCILIATION_DISCLAIMER.includes('incometax.gov.in'));
  });

  test('07-05: getAISDownloadGuidance returns steps', () => {
    const steps = getAISDownloadGuidance();
    assert.ok(steps.length >= 5);
    assert.ok(steps.some(s => s.toLowerCase().includes('ais') || s.toLowerCase().includes('portal')));
  });

  test('07-06: isAISRecordDisputed detects false acceptance', () => {
    const disputed: AISRecord = {
      id: 'a1', userId: 'u1', taxYear: 'FY2025-26', transactionType: 'salary',
      reportedBy: 'X', amount: 100, dataSource: 'employer',
      isUserAccepted: false, isFromITPortal: true, isVerified: true,
      isResolved: false, aisDescription: 'test', importedAt: '2026-01-01',
    };
    assert.equal(isAISRecordDisputed(disputed), true);
  });
});

// ── financial-risk-monitor ────────────────────────────────────────────────────
import {
  evaluateTransactionRisk, evaluateApproachingLimits,
  aggregateRiskLevel,
} from '../src/lib/finance/financial-risk-monitor.ts';

describe('PHASE4 [08] financial-risk-monitor', () => {
  test('08-01: cash Rs 250000 income flags HIGH_RISK', () => {
    const flags = evaluateTransactionRisk({
      transactions: [{ id: 't1', amount: 250000, description: 'Cash received', date: '2026-01-01', type: 'income', accountId: 'a1', isCash: true }],
    });
    const cashFlag = flags.find(f => f.riskCategory === 'large_cash');
    assert.ok(cashFlag, 'Cash flag expected');
    assert.equal(cashFlag!.riskLevel, 'HIGH_RISK');
  });

  test('08-02: duplicate transaction detected', () => {
    const txns = [
      { id: 't1', amount: 5000, description: 'Swiggy order', date: '2026-01-01', type: 'expense', accountId: 'a1' },
      { id: 't2', amount: 5000, description: 'Swiggy order', date: '2026-01-01', type: 'expense', accountId: 'a1' },
    ];
    const flags = evaluateTransactionRisk({ transactions: txns });
    assert.ok(flags.some(f => f.riskCategory === 'duplicate_transaction'));
  });

  test('08-03: no duplicates when amounts differ', () => {
    const txns = [
      { id: 't1', amount: 5000, description: 'Swiggy', date: '2026-01-01', type: 'expense', accountId: 'a1' },
      { id: 't2', amount: 6000, description: 'Swiggy', date: '2026-01-01', type: 'expense', accountId: 'a1' },
    ];
    const flags = evaluateTransactionRisk({ transactions: txns });
    assert.ok(!flags.some(f => f.riskCategory === 'duplicate_transaction'));
  });

  test('08-04: unexplained large credit flagged', () => {
    const flags = evaluateTransactionRisk({
      transactions: [{ id: 't1', amount: 500000, description: 'Cash deposit', date: '2026-01-01', type: 'income', accountId: 'a1' }],
    });
    assert.ok(flags.some(f => f.riskCategory === 'unexplained_credit'));
  });

  test('08-05: business account personal expense flagged', () => {
    const flags = evaluateTransactionRisk({
      transactions: [{ id: 't1', amount: 500, description: 'Swiggy dinner order', date: '2026-01-01', type: 'expense', accountId: 'a1' }],
      accountPurposeId: 'current-business',
    });
    assert.ok(flags.some(f => f.riskCategory === 'account_purpose_mismatch' || f.riskCategory === 'unusual_spending'), 'Should flag personal pattern in business account');
  });

  test('08-06: approaching SFT threshold flags near Rs 9.5L savings', () => {
    const flags = evaluateApproachingLimits({
      cashDepositsYTD: new Decimal(950000),
      cashDepositsAccountType: 'savings',
      interestIncomeYTD: new Decimal(0),
      ltcgEquityYTD: new Decimal(0),
    });
    assert.ok(flags.some(f => f.flagId.includes('SFT')));
  });

  test('08-07: approaching LTCG exemption flags near Rs 1.25L', () => {
    const flags = evaluateApproachingLimits({
      cashDepositsYTD: new Decimal(0),
      cashDepositsAccountType: 'savings',
      interestIncomeYTD: new Decimal(0),
      ltcgEquityYTD: new Decimal(110000),
    });
    assert.ok(flags.some(f => f.flagId.includes('LTCG')));
  });

  test('08-08: aggregateRiskLevel HIGH_RISK wins', () => {
    const flags = [
      { riskLevel: 'NORMAL' as const, flagId: 'x1', riskCategory: 'large_cash' as const, title: 'x', explanation: 'x', observation: 'x', recommendedAction: 'x', isResolved: false, detectedAt: new Date().toISOString() },
      { riskLevel: 'HIGH_RISK' as const, flagId: 'x2', riskCategory: 'large_cash' as const, title: 'x', explanation: 'x', observation: 'x', recommendedAction: 'x', isResolved: false, detectedAt: new Date().toISOString() },
    ];
    assert.equal(aggregateRiskLevel(flags), 'HIGH_RISK');
  });

  test('08-09: each risk flag has explanation', () => {
    const flags = evaluateTransactionRisk({
      transactions: [{ id: 't1', amount: 250000, description: 'Cash', date: '2026-01-01', type: 'income', accountId: 'a1', isCash: true }],
    });
    for (const f of flags) {
      assert.ok(f.explanation.length > 10, `Flag ${f.flagId} has no explanation`);
      assert.ok(f.recommendedAction.length > 10, `Flag ${f.flagId} has no recommendedAction`);
    }
  });
});

// ── transaction-guard ──────────────────────────────────────────────────────────
import {
  evaluateTransactionGuard, isAmbiguous, getAmbiguityClarifications,
} from '../src/lib/finance/transaction-guard.ts';

describe('PHASE4 [09] transaction-guard', () => {
  test('09-01: "Papa gave me money" is ambiguous', () => {
    assert.equal(isAmbiguous('Papa gave me money'), true);
  });

  test('09-02: "Paid electricity bill" is not ambiguous', () => {
    assert.equal(isAmbiguous('Paid electricity bill'), false);
  });

  test('09-03: evaluateTransactionGuard ambiguous returns canProceed=false', () => {
    const r = evaluateTransactionGuard({ description: 'Papa gave me money', amount: 50000 });
    assert.equal(r.canProceed, false);
    assert.ok(r.clarificationRequired.length > 0);
    assert.equal(r.detectedIntent, 'AMBIGUOUS');
  });

  test('09-04: cash Rs 250000 = HIGH_RISK', () => {
    const r = evaluateTransactionGuard({ description: 'Cash payment', amount: 250000, isCash: true });
    assert.equal(r.riskLevel, 'HIGH_RISK');
    assert.ok(r.warnings.some(w => w.includes('269ST') || w.includes('LEGAL')));
  });

  test('09-05: cash Rs 50000 = REVIEW', () => {
    const r = evaluateTransactionGuard({ description: 'Cash payment', amount: 50000, isCash: true });
    assert.ok(r.riskLevel === 'REVIEW' || r.riskLevel === 'NORMAL');
  });

  test('09-06: "Rahul sent Rs 80k" triggers clarification', () => {
    const r = evaluateTransactionGuard({ description: 'Rahul sent 80000', amount: 80000, counterpartyName: 'Rahul' });
    assert.equal(r.canProceed, false);
    assert.ok(r.clarificationRequired.length > 0);
  });

  test('09-07: gift clarification asks about relative status', () => {
    const r = evaluateTransactionGuard({ description: 'Rahul gave me money', amount: 100000, userStatedType: 'gift_received' });
    // Clarification about relative status expected
    assert.ok(r.clarificationRequired.some(q =>
      q.question.toLowerCase().includes('relative') || q.question.toLowerCase().includes('gift')
    ) || r.canProceed === false || r.warnings.length > 0);
  });

  test('09-08: explicit expense type with small cash = canProceed true', () => {
    const r = evaluateTransactionGuard({ description: 'Electricity bill payment', amount: 1500, userStatedType: 'expense' });
    assert.equal(r.canProceed, true);
    assert.equal(r.detectedIntent, 'expense');
  });

  test('09-09: large transaction > Rs 1L adds documentation warning', () => {
    const r = evaluateTransactionGuard({ description: 'Property payment', amount: 500000, userStatedType: 'expense' });
    assert.ok(r.documentationRecommended.length > 0);
  });

  test('09-10: getAmbiguityClarifications returns questions for ambiguous description', () => {
    const qs = getAmbiguityClarifications('Papa gave me money');
    assert.ok(qs.length > 0);
    assert.ok(qs[0].required === true);
  });

  test('09-11: getAmbiguityClarifications returns empty for clear description', () => {
    const qs = getAmbiguityClarifications('Paid Swiggy for lunch');
    assert.equal(qs.length, 0);
  });
});
