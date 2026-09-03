/**
 * NISFLOW FINANCE â€” TAX ENGINE V2
 *
 * Versioned tax rule engine. Rules are versioned by:
 *   - tax year, effective date, expiry/replacement date
 *   - taxpayer type, residential status, income type, conditions, exceptions
 *   - authority and source
 *
 * Tax rules are NOT hard-coded into UI components.
 * Accounting treatment is SEPARATE from tax treatment.
 *
 * Sources: Income Tax Act 1961, Finance Act 2024, CBDT notifications.
 *
 * @module tax-engine-v2
 */

import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

// --- Version Constants ---------------------------------------------------------

export const CURRENT_FY = 'FY2025-26';
export const CURRENT_AY = 'AY2026-27';
export const TAX_ENGINE_VERSION = '2.0.0';

// --- Types --------------------------------------------------------------------

export type TaxYear = 'FY2023-24' | 'FY2024-25' | 'FY2025-26';
export type TaxpayerType =
  | 'individual'
  | 'huf'
  | 'firm'
  | 'company'
  | 'aop'
  | 'boi';

export type ResidentialStatus =
  | 'resident_ordinary'
  | 'resident_not_ordinary'
  | 'non_resident';

export type IncomeType =
  | 'salary'
  | 'house_property'
  | 'business_professional'
  | 'capital_gains_stcg_equity'
  | 'capital_gains_stcg_other'
  | 'capital_gains_ltcg_equity'
  | 'capital_gains_ltcg_other'
  | 'other_sources_interest'
  | 'other_sources_dividend'
  | 'other_sources_gift'
  | 'presumptive_44ad'
  | 'presumptive_44ada'
  | 'foreign_income';

export type TaxRegime = 'old' | 'new';

export type TaxRuleStatus = 'ACTIVE' | 'SUPERSEDED' | 'UNVERIFIED' | 'PROPOSED';

export interface TaxRuleSource {
  authority: string;           // 'CBDT', 'Finance Act 2024', 'Income Tax Act 1961'
  url: string;
  section?: string;            // 'Section 80C', 'Section 87A'
  notification?: string;       // CBDT notification number
  financeAct?: string;         // 'Finance Act 2024'
}

export interface TaxRule {
  ruleId: string;
  name: string;
  taxYear: TaxYear;
  regime: TaxRegime | 'both';
  taxpayerTypes: TaxpayerType[];
  residentialStatuses: ResidentialStatus[];
  incomeTypes: IncomeType[];
  effectiveFrom: string;        // ISO date
  effectiveTo?: string;         // ISO date; omit if currently active
  status: TaxRuleStatus;
  /** Verified or last-checked date */
  verifiedAt: string;
  source: TaxRuleSource;
  description: string;
  value?: number;               // e.g. deduction limit
  rate?: number;                // e.g. tax rate as percentage
  conditions: string[];
  exceptions: string[];
  auditTriggers: string[];
  accountingNote: string;       // How this affects accounting (separate from tax)
}

export interface TaxSlab {
  from: number;
  to: number;               // Infinity for top slab
  rate: number;             // percent
}

export interface RegimeTaxConfig {
  taxYear: TaxYear;
  regime: TaxRegime;
  slabs: TaxSlab[];
  standardDeduction: number;
  rebate87ALimit: number;       // max taxable income for 87A rebate eligibility
  rebate87AAmount: number;      // max rebate amount (usually full tax)
  surchargeTiers: Array<{ above: number; rate: number }>;
  cessRate: number;             // percent (usually 4)
  effectiveFrom: string;
  source: TaxRuleSource;
  status: TaxRuleStatus;
  verifiedAt: string;
}

// --- Tax Slab Configurations (Versioned) -------------------------------------

export const TAX_SLAB_CONFIGS: RegimeTaxConfig[] = [
  // FY 2025-26 â€” New Regime (Budget 2025-26 restructured slabs)
  {
    taxYear: 'FY2025-26',
    regime: 'new',
    standardDeduction: 75000,
    rebate87ALimit: 1200000,
    rebate87AAmount: Infinity, // full rebate
    slabs: [
      { from: 0, to: 400000, rate: 0 },
      { from: 400000, to: 800000, rate: 5 },
      { from: 800000, to: 1200000, rate: 10 },
      { from: 1200000, to: 1600000, rate: 15 },
      { from: 1600000, to: 2000000, rate: 20 },
      { from: 2000000, to: 2400000, rate: 25 },
      { from: 2400000, to: Infinity, rate: 30 },
    ],
    surchargeTiers: [
      { above: 5000000, rate: 10 },
      { above: 10000000, rate: 15 },
      { above: 20000000, rate: 25 },
      { above: 50000000, rate: 25 }, // capped at 25% for new regime
    ],
    cessRate: 4,
    effectiveFrom: '2025-04-01',
    source: {
      authority: 'Finance Act 2025',
      url: 'https://www.incometax.gov.in',
      financeAct: 'Finance Act 2025',
    },
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
  },
  // FY 2025-26 â€” Old Regime (unchanged from FY 2024-25)
  {
    taxYear: 'FY2025-26',
    regime: 'old',
    standardDeduction: 50000,
    rebate87ALimit: 500000,
    rebate87AAmount: 12500, // max Rs 12,500 rebate
    slabs: [
      { from: 0, to: 250000, rate: 0 },
      { from: 250000, to: 500000, rate: 5 },
      { from: 500000, to: 1000000, rate: 20 },
      { from: 1000000, to: Infinity, rate: 30 },
    ],
    surchargeTiers: [
      { above: 5000000, rate: 10 },
      { above: 10000000, rate: 15 },
      { above: 20000000, rate: 25 },
      { above: 50000000, rate: 37 }, // 37% for old regime
    ],
    cessRate: 4,
    effectiveFrom: '2025-04-01',
    source: {
      authority: 'Income Tax Act 1961 (as amended)',
      url: 'https://www.incometax.gov.in',
    },
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
  },
  // FY 2024-25 â€” New Regime
  {
    taxYear: 'FY2024-25',
    regime: 'new',
    standardDeduction: 75000,
    rebate87ALimit: 700000,
    rebate87AAmount: Infinity,
    slabs: [
      { from: 0, to: 300000, rate: 0 },
      { from: 300000, to: 700000, rate: 5 },
      { from: 700000, to: 1000000, rate: 10 },
      { from: 1000000, to: 1200000, rate: 15 },
      { from: 1200000, to: 1500000, rate: 20 },
      { from: 1500000, to: Infinity, rate: 30 },
    ],
    surchargeTiers: [
      { above: 5000000, rate: 10 },
      { above: 10000000, rate: 15 },
      { above: 20000000, rate: 25 },
      { above: 50000000, rate: 25 },
    ],
    cessRate: 4,
    effectiveFrom: '2024-04-01',
    source: {
      authority: 'Finance Act 2024',
      url: 'https://www.incometax.gov.in',
      financeAct: 'Finance Act 2024',
    },
    status: 'SUPERSEDED',
    verifiedAt: '2024-04-01',
  },
];

// --- Deduction / Exemption Rules (Versioned) ----------------------------------

export const DEDUCTION_RULES: TaxRule[] = [
  {
    ruleId: 'DEDUCTION-80C-FY2526',
    name: 'Section 80C Deductions',
    taxYear: 'FY2025-26',
    regime: 'old',
    taxpayerTypes: ['individual', 'huf'],
    residentialStatuses: ['resident_ordinary', 'resident_not_ordinary'],
    incomeTypes: ['salary', 'business_professional'],
    effectiveFrom: '2014-04-01',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Income Tax Act 1961',
      url: 'https://www.incometax.gov.in',
      section: 'Section 80C',
    },
    description: 'Deduction up to Rs 1,50,000 for investments in ELSS, PPF, EPF, NSC, LIC, SCSS, tax-saving FD, home loan principal, tuition fees.',
    value: 150000,
    conditions: [
      'Available only under Old Regime',
      'Maximum Rs 1,50,000 across all 80C instruments combined',
      'ELSS has 3-year lock-in; PPF 15-year; tax-saving FD 5-year',
    ],
    exceptions: [
      'Not available under New Regime',
    ],
    auditTriggers: [
      'Mismatch between claimed 80C and actual investment proof',
      'No investment proof submitted to employer before Form 16 generation',
    ],
    accountingNote: 'Investment in 80C instruments is an asset transfer (cash ? investment), not an expense. The deduction reduces taxable income but does not affect P&L.',
  },
  {
    ruleId: 'DEDUCTION-80D-FY2526',
    name: 'Section 80D Health Insurance Premium',
    taxYear: 'FY2025-26',
    regime: 'old',
    taxpayerTypes: ['individual', 'huf'],
    residentialStatuses: ['resident_ordinary', 'resident_not_ordinary'],
    incomeTypes: ['salary', 'business_professional'],
    effectiveFrom: '2018-04-01',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Income Tax Act 1961',
      url: 'https://www.incometax.gov.in',
      section: 'Section 80D',
    },
    description: 'Deduction for health insurance premiums. Self/family: Rs 25,000; senior citizen: Rs 50,000; preventive health checkup up to Rs 5,000 within limit.',
    value: 25000,
    conditions: [
      'Available only under Old Regime',
      'Self + family: Rs 25,000 (Rs 50,000 if self/spouse/children are senior citizens)',
      'Additional Rs 25,000 for parents premium (Rs 50,000 if parents are senior citizens)',
      'Maximum combined: Rs 1,00,000 (all senior citizens)',
    ],
    exceptions: ['Not available under New Regime'],
    auditTriggers: ['Insurance premium receipt must be in policyholder name'],
    accountingNote: 'Insurance premium is a household expense. The deduction reduces taxable income.',
  },
  {
    ruleId: 'DEDUCTION-80TTA-FY2526',
    name: 'Section 80TTA Savings Account Interest',
    taxYear: 'FY2025-26',
    regime: 'old',
    taxpayerTypes: ['individual', 'huf'],
    residentialStatuses: ['resident_ordinary', 'resident_not_ordinary'],
    incomeTypes: ['other_sources_interest'],
    effectiveFrom: '2012-04-01',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Income Tax Act 1961',
      url: 'https://www.incometax.gov.in',
      section: 'Section 80TTA',
    },
    description: 'Deduction up to Rs 10,000 on interest income from savings accounts (not FD/RD) for individuals below 60 years.',
    value: 10000,
    conditions: [
      'Available only under Old Regime',
      'Savings account interest only â€” not FD or RD interest',
      'Not available for senior citizens (Section 80TTB provides higher deduction)',
    ],
    exceptions: ['Senior citizens (60+) should use Section 80TTB (Rs 50,000 deduction on all bank interest)'],
    auditTriggers: ['Claimed interest must match Form 26AS/AIS'],
    accountingNote: 'Interest income is recorded as income. Deduction reduces taxable income but not accounting income.',
  },
  {
    ruleId: 'DEDUCTION-80CCD1B-FY2526',
    name: 'Section 80CCD(1B) NPS Additional Deduction',
    taxYear: 'FY2025-26',
    regime: 'old',
    taxpayerTypes: ['individual'],
    residentialStatuses: ['resident_ordinary', 'resident_not_ordinary'],
    incomeTypes: ['salary', 'business_professional'],
    effectiveFrom: '2015-04-01',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Income Tax Act 1961',
      url: 'https://www.incometax.gov.in',
      section: 'Section 80CCD(1B)',
    },
    description: 'Additional deduction up to Rs 50,000 for contributions to NPS Tier 1 account, over and above 80C limit.',
    value: 50000,
    conditions: [
      'Available only under Old Regime',
      'NPS Tier 1 (pension) contributions only',
      'PRAN (Permanent Retirement Account Number) required',
      'Separate from 80C limit of Rs 1,50,000',
    ],
    exceptions: ['Not available under New Regime'],
    auditTriggers: ['NPS statement and PRAN required as proof'],
    accountingNote: 'NPS contribution is an asset transfer to retirement corpus, not an expense.',
  },
  {
    ruleId: 'DEDUCTION-24B-FY2526',
    name: 'Section 24(b) Home Loan Interest',
    taxYear: 'FY2025-26',
    regime: 'old',
    taxpayerTypes: ['individual', 'huf'],
    residentialStatuses: ['resident_ordinary'],
    incomeTypes: ['house_property', 'salary'],
    effectiveFrom: '2014-04-01',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Income Tax Act 1961',
      url: 'https://www.incometax.gov.in',
      section: 'Section 24(b)',
    },
    description: 'Deduction on home loan interest. Self-occupied: Rs 2,00,000/year. Let-out property: no limit.',
    value: 200000,
    conditions: [
      'Available only under Old Regime',
      'Self-occupied: max Rs 2,00,000/year',
      'Let-out property: actual interest, no limit',
      'Loan must be for purchase, construction, repair, or renovation',
      'Construction must be completed within 5 years of loan',
    ],
    exceptions: ['Not available under New Regime for self-occupied property'],
    auditTriggers: ['Annual interest certificate from lender required', 'Possession date must be confirmed'],
    accountingNote: 'Home loan interest is an expense (separate from principal repayment, which is an asset/liability transaction).',
  },
  {
    ruleId: 'DEDUCTION-80E-FY2526',
    name: 'Section 80E Education Loan Interest',
    taxYear: 'FY2025-26',
    regime: 'old',
    taxpayerTypes: ['individual'],
    residentialStatuses: ['resident_ordinary'],
    incomeTypes: ['salary', 'business_professional'],
    effectiveFrom: '2006-04-01',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Income Tax Act 1961',
      url: 'https://www.incometax.gov.in',
      section: 'Section 80E',
    },
    description: 'Full deduction on interest paid on education loan (no upper limit) for 8 years from start of repayment.',
    conditions: [
      'Available only under Old Regime',
      'Loan must be from a financial institution or approved charitable institution',
      'For higher education (self, spouse, children)',
      'Deduction available for 8 years from year of repayment start',
      'No upper limit on interest amount',
    ],
    exceptions: [],
    auditTriggers: ['Interest certificate from lender', 'Proof of enrollment in educational institution'],
    accountingNote: 'Education loan interest is an expense. Principal repayment is a liability reduction.',
  },
  {
    ruleId: 'CAPITAL-GAINS-LTCG-EQUITY-FY2526',
    name: 'LTCG on Listed Equity / Equity MF',
    taxYear: 'FY2025-26',
    regime: 'both',
    taxpayerTypes: ['individual', 'huf'],
    residentialStatuses: ['resident_ordinary', 'resident_not_ordinary'],
    incomeTypes: ['capital_gains_ltcg_equity'],
    effectiveFrom: '2024-07-23',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Finance (No. 2) Act 2024',
      url: 'https://www.incometax.gov.in',
      section: 'Section 112A',
      financeAct: 'Finance Act 2024 (No. 2)',
    },
    description: 'Long-term capital gain on listed equity shares and equity-oriented MF units: 12.5% on gains exceeding Rs 1,25,000 per year.',
    rate: 12.5,
    value: 125000,       // exemption threshold
    conditions: [
      'Holding period > 12 months for equity',
      'STT must have been paid on both purchase and sale (exchange trades)',
      'Gains up to Rs 1,25,000/year exempt (increased from Rs 1,00,000 effective 23 July 2024)',
      'Tax at 12.5% (increased from 10% effective 23 July 2024)',
      'No indexation benefit',
    ],
    exceptions: [
      'Unlisted equity: different rules under Section 112',
      'Grandfathering: acquisitions before 31 Jan 2018 use 31 Jan 2018 as cost basis',
    ],
    auditTriggers: ['AIS reflects securities transactions', 'Capital gains statement from broker required'],
    accountingNote: 'Capital gain = Sale proceeds - Cost basis. Cost basis for accounting is original purchase price (not grandfathered price). Tax uses grandfathered price for pre-2018 purchases.',
  },
  {
    ruleId: 'CAPITAL-GAINS-STCG-EQUITY-FY2526',
    name: 'STCG on Listed Equity / Equity MF',
    taxYear: 'FY2025-26',
    regime: 'both',
    taxpayerTypes: ['individual', 'huf'],
    residentialStatuses: ['resident_ordinary', 'resident_not_ordinary'],
    incomeTypes: ['capital_gains_stcg_equity'],
    effectiveFrom: '2024-07-23',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Finance (No. 2) Act 2024',
      url: 'https://www.incometax.gov.in',
      section: 'Section 111A',
      financeAct: 'Finance Act 2024 (No. 2)',
    },
    description: 'Short-term capital gain on listed equity: 20% (increased from 15% effective 23 July 2024).',
    rate: 20,
    conditions: [
      'Holding period <= 12 months for equity',
      'STT paid on both sides',
      'Rate 20% effective 23 July 2024 (was 15%)',
    ],
    exceptions: ['Intraday/F&O treated as speculative/non-speculative business income'],
    auditTriggers: ['Broker contract notes', 'Capital gains statement'],
    accountingNote: 'STCG is a separate income head and cannot be set off against salary or business income losses.',
  },
  {
    ruleId: 'TDS-194A-FY2526',
    name: 'TDS Section 194A â€” Interest on FD/Savings',
    taxYear: 'FY2025-26',
    regime: 'both',
    taxpayerTypes: ['individual'],
    residentialStatuses: ['resident_ordinary'],
    incomeTypes: ['other_sources_interest'],
    effectiveFrom: '2019-04-01',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Income Tax Act 1961',
      url: 'https://www.incometax.gov.in',
      section: 'Section 194A',
    },
    description: 'TDS at 10% on interest income from banks > Rs 40,000/year per bank (Rs 50,000 for senior citizens).',
    rate: 10,
    value: 40000,
    conditions: [
      'Threshold per bank, not aggregate across banks',
      'TDS at 20% if PAN not furnished',
      'Form 15G/15H to avoid TDS if total income below taxable limit',
    ],
    exceptions: ['Senior citizens: threshold Rs 50,000'],
    auditTriggers: ['TDS in Form 26AS must be claimed as credit in ITR'],
    accountingNote: 'TDS is a prepayment of tax â€” an asset (TDS receivable/credit) for accounting purposes.',
  },
  {
    ruleId: 'GIFT-TAX-56-FY2526',
    name: 'Section 56(2)(x) â€” Gift Taxation',
    taxYear: 'FY2025-26',
    regime: 'both',
    taxpayerTypes: ['individual'],
    residentialStatuses: ['resident_ordinary', 'resident_not_ordinary'],
    incomeTypes: ['other_sources_gift'],
    effectiveFrom: '2017-04-01',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Income Tax Act 1961',
      url: 'https://www.incometax.gov.in',
      section: 'Section 56(2)(x)',
    },
    description: 'Cash or property gifts from non-relatives exceeding Rs 50,000 in a year are taxable as "Income from Other Sources".',
    value: 50000,
    conditions: [
      'Gifts from specified relatives are FULLY EXEMPT (no limit)',
      'Specified relatives: spouse, siblings, siblings of spouse, parents, children, spouse\'s parents',
      'Gifts from others: exempt up to Rs 50,000 per year in aggregate',
      'Gifts received on marriage are fully exempt regardless of amount or source',
    ],
    exceptions: [
      'Inheritance (from will or succession) is exempt',
      'Gifts received in contemplation of death of donor are exempt',
    ],
    auditTriggers: [
      'Large unrecorded cash credits may be treated as gifts and taxed',
      'Gift deed required for non-cash assets',
    ],
    accountingNote: 'A gift from a relative is equity (capital receipt), not income. A taxable gift is income from other sources. Classification MUST be determined before recording.',
  },
  {
    ruleId: 'ADVANCE-TAX-FY2526',
    name: 'Advance Tax Installments',
    taxYear: 'FY2025-26',
    regime: 'both',
    taxpayerTypes: ['individual'],
    residentialStatuses: ['resident_ordinary'],
    incomeTypes: ['salary', 'business_professional', 'capital_gains_ltcg_equity', 'other_sources_interest'],
    effectiveFrom: '2016-04-01',
    status: 'ACTIVE',
    verifiedAt: '2025-04-01',
    source: {
      authority: 'Income Tax Act 1961',
      url: 'https://www.incometax.gov.in',
      section: 'Section 208/209/234B/234C',
    },
    description: 'Advance tax due if total tax liability > Rs 10,000 per year. Due dates: 15 Jun (15%), 15 Sep (45%), 15 Dec (75%), 15 Mar (100%).',
    value: 10000,
    conditions: [
      'Mandatory if estimated tax liability > Rs 10,000',
      '15 June: 15% of advance tax',
      '15 September: 45% cumulative',
      '15 December: 75% cumulative',
      '15 March: 100% cumulative',
      'Interest 1% per month under 234B for shortfall',
      'Interest 1% per month under 234C for each installment shortfall',
    ],
    exceptions: ['Senior citizens (60+) with no business income are exempt from advance tax'],
    auditTriggers: ['Advance tax paid vs estimated income â€” check for shortfall'],
    accountingNote: 'Advance tax payment is a tax asset (prepaid tax/TDS receivable) until actual liability is settled.',
  },
];

// --- Core Calculation Functions ------------------------------------------------

function calcSlabV2(income: Decimal, slabs: TaxSlab[]): { total: Decimal; breakdown: Array<{ slab: string; rate: number; taxableInSlab: Decimal; tax: Decimal }> } {
  let total = new Decimal(0);
  const breakdown: Array<{ slab: string; rate: number; taxableInSlab: Decimal; tax: Decimal }> = [];

  for (const s of slabs) {
    if (income.lte(s.from)) break;
    const taxable = Decimal.min(income, new Decimal(s.to === Infinity ? Number.MAX_SAFE_INTEGER : s.to)).minus(s.from);
    const tax = taxable.times(s.rate).div(100);
    if (tax.gt(0) || s.rate > 0) {
      const toLabel = s.to === Infinity ? 'above' : `Rs ${(s.to / 100000).toFixed(0)}L`;
      breakdown.push({
        slab: `Rs ${(s.from / 100000).toFixed(0)}L - ${toLabel}`,
        rate: s.rate,
        taxableInSlab: taxable,
        tax,
      });
      total = total.plus(tax);
    }
  }

  return { total, breakdown };
}

function calcSurchargeV2(taxableIncome: Decimal, taxBeforeRebate: Decimal, surchargeTiers: RegimeTaxConfig['surchargeTiers']): Decimal {
  const inc = taxableIncome.toNumber();
  const sortedTiers = [...surchargeTiers].sort((a, b) => b.above - a.above);

  for (const tier of sortedTiers) {
    if (inc > tier.above) {
      return taxBeforeRebate.times(tier.rate).div(100);
    }
  }
  return new Decimal(0);
}

export interface TaxCalculationInput {
  grossIncome: Decimal;
  /** Old regime deductions */
  deduction80C?: Decimal;
  deduction80D?: Decimal;
  hra?: Decimal;
  lta?: Decimal;
  deduction80CCD1B?: Decimal;     // NPS additional
  homeLoanInterest24B?: Decimal;
  educationLoanInterest80E?: Decimal;
  otherDeductions?: Decimal;      // 80G, 80TTA, etc.
  /** Capital gains */
  ltcgEquity?: Decimal;           // after Rs 1.25L exemption applied
  stcgEquity?: Decimal;
  /** TDS already deducted */
  tdsAlreadyDeducted?: Decimal;
  taxpayerAge?: number;           // for senior citizen thresholds
}

export interface TaxSlabDetail {
  slab: string;
  rate: number;
  taxableInSlab: Decimal;
  tax: Decimal;
}

export interface TaxCalculationResult {
  regime: TaxRegime;
  taxYear: TaxYear;
  grossIncome: Decimal;
  standardDeduction: Decimal;
  totalDeductions: Decimal;
  taxableIncome: Decimal;
  taxOnSlabs: Decimal;
  specialRateTax: Decimal;       // LTCG/STCG separate tax
  totalTaxBeforeRebate: Decimal;
  rebate87A: Decimal;
  surcharge: Decimal;
  cess: Decimal;
  totalTax: Decimal;
  tdsAlreadyDeducted: Decimal;
  taxPayable: Decimal;           // totalTax - tdsAlreadyDeducted
  effectiveRate: Decimal;        // on gross income
  inHandMonthly: Decimal;
  slabBreakdown: TaxSlabDetail[];
  config: RegimeTaxConfig;
  rulesApplied: TaxRule[];
}

export function calculateTax(input: TaxCalculationInput, regime: TaxRegime, taxYear: TaxYear = CURRENT_FY): TaxCalculationResult {
  const config = TAX_SLAB_CONFIGS.find(c => c.taxYear === taxYear && c.regime === regime);
  if (!config) throw new Error(`No tax config found for ${taxYear} ${regime} regime`);

  const SD = new Decimal(config.standardDeduction);
  const rulesApplied: TaxRule[] = [];

  let totalDeductions = SD;

  if (regime === 'old') {
    // Cap 80C at 1.5L
    const c80C = input.deduction80C ? Decimal.min(input.deduction80C, new Decimal(150000)) : new Decimal(0);
    const c80D = input.deduction80D ?? new Decimal(0);
    const cHRA = input.hra ?? new Decimal(0);
    const cLTA = input.lta ?? new Decimal(0);
    const cNPS = input.deduction80CCD1B ? Decimal.min(input.deduction80CCD1B, new Decimal(50000)) : new Decimal(0);
    const cHomeLoan = input.homeLoanInterest24B ? Decimal.min(input.homeLoanInterest24B, new Decimal(200000)) : new Decimal(0);
    const cEduLoan = input.educationLoanInterest80E ?? new Decimal(0);
    const cOther = input.otherDeductions ?? new Decimal(0);

    totalDeductions = SD.plus(c80C).plus(c80D).plus(cHRA).plus(cLTA).plus(cNPS).plus(cHomeLoan).plus(cEduLoan).plus(cOther);

    // Track rules
    if (c80C.gt(0)) rulesApplied.push(DEDUCTION_RULES.find(r => r.ruleId === 'DEDUCTION-80C-FY2526')!);
    if (c80D.gt(0)) rulesApplied.push(DEDUCTION_RULES.find(r => r.ruleId === 'DEDUCTION-80D-FY2526')!);
    if (cNPS.gt(0)) rulesApplied.push(DEDUCTION_RULES.find(r => r.ruleId === 'DEDUCTION-80CCD1B-FY2526')!);
  }

  const taxableIncome = Decimal.max(input.grossIncome.minus(totalDeductions), new Decimal(0));

  // Slab tax
  const { total: taxOnSlabs, breakdown } = calcSlabV2(taxableIncome, config.slabs);

  // Special rate taxes (LTCG/STCG â€” not in regular slabs)
  const ltcgTax = input.ltcgEquity ? input.ltcgEquity.times(12.5).div(100) : new Decimal(0);
  const stcgTax = input.stcgEquity ? input.stcgEquity.times(20).div(100) : new Decimal(0);
  const specialRateTax = ltcgTax.plus(stcgTax);

  const totalTaxBeforeRebate = taxOnSlabs.plus(specialRateTax);

  // 87A Rebate
  let rebate87A = new Decimal(0);
  if (taxableIncome.lte(config.rebate87ALimit)) {
    if (config.rebate87AAmount === Infinity) {
      rebate87A = taxOnSlabs; // full rebate on slab tax only (not special rate)
    } else {
      rebate87A = Decimal.min(taxOnSlabs, new Decimal(config.rebate87AAmount));
    }
  }

  const taxAfterRebate = Decimal.max(totalTaxBeforeRebate.minus(rebate87A), new Decimal(0));
  const surcharge = calcSurchargeV2(taxableIncome, taxAfterRebate, config.surchargeTiers);
  const cess = taxAfterRebate.plus(surcharge).times(config.cessRate).div(100);
  const totalTax = taxAfterRebate.plus(surcharge).plus(cess);

  const tdsAlreadyDeducted = input.tdsAlreadyDeducted ?? new Decimal(0);
  const taxPayable = Decimal.max(totalTax.minus(tdsAlreadyDeducted), new Decimal(0));
  const effectiveRate = input.grossIncome.gt(0) ? totalTax.div(input.grossIncome).times(100) : new Decimal(0);
  const inHandMonthly = input.grossIncome.minus(totalTax).div(12);

  return {
    regime,
    taxYear,
    grossIncome: input.grossIncome,
    standardDeduction: SD,
    totalDeductions,
    taxableIncome,
    taxOnSlabs,
    specialRateTax,
    totalTaxBeforeRebate,
    rebate87A,
    surcharge,
    cess,
    totalTax,
    tdsAlreadyDeducted,
    taxPayable,
    effectiveRate,
    inHandMonthly,
    slabBreakdown: breakdown,
    config,
    rulesApplied: rulesApplied.filter(Boolean),
  };
}

export function compareRegimesV2(input: TaxCalculationInput, taxYear: TaxYear = CURRENT_FY): {
  old: TaxCalculationResult;
  new: TaxCalculationResult;
  recommended: TaxRegime;
  savings: Decimal;
  taxYear: TaxYear;
} {
  const oldResult = calculateTax(input, 'old', taxYear);
  const newResult = calculateTax(input, 'new', taxYear);
  const recommended = oldResult.totalTax.lte(newResult.totalTax) ? 'old' : 'new';
  const savings = oldResult.totalTax.minus(newResult.totalTax).abs();
  return { old: oldResult, new: newResult, recommended, savings, taxYear };
}

// --- Rule Staleness Check -----------------------------------------------------

export const TAX_RULE_STALENESS_DAYS = 365; // tax rules: re-verify annually

export function isTaxRuleStale(rule: TaxRule): boolean {
  const verifiedDate = new Date(rule.verifiedAt);
  const daysSince = (Date.now() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > TAX_RULE_STALENESS_DAYS;
}

/**
 * Get all active deduction rules for a given year, regime, and income type.
 */
export function getApplicableDeductions(params: {
  taxYear: TaxYear;
  regime: TaxRegime;
  incomeTypes: IncomeType[];
  taxpayerType?: TaxpayerType;
}): TaxRule[] {
  return DEDUCTION_RULES.filter(r =>
    r.taxYear === params.taxYear &&
    (r.regime === params.regime || r.regime === 'both') &&
    r.incomeTypes.some(t => params.incomeTypes.includes(t)) &&
    (params.taxpayerType ? r.taxpayerTypes.includes(params.taxpayerType) : true) &&
    r.status === 'ACTIVE'
  );
}

/**
 * Get a specific deduction rule by ID.
 */
export function getDeductionRule(ruleId: string): TaxRule | null {
  return DEDUCTION_RULES.find(r => r.ruleId === ruleId) ?? null;
}

/**
 * Get current tax config for a regime and year.
 */
export function getTaxConfig(regime: TaxRegime, taxYear: TaxYear = CURRENT_FY): RegimeTaxConfig | null {
  return TAX_SLAB_CONFIGS.find(c => c.taxYear === taxYear && c.regime === regime) ?? null;
}
