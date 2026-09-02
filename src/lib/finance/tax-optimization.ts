/**
 * NISFLOW FINANCE â€” LAWFUL TAX OPTIMIZATION ENGINE
 *
 * Identifies lawful tax planning opportunities with full transparency.
 * Every recommendation includes:
 *   WHY, LEGAL BASIS, APPLICABILITY, ASSUMPTIONS, CALCULATION,
 *   DOCUMENTATION, DEADLINE, SOURCE, CONFIDENCE
 *
 * ABSOLUTE PROHIBITION:
 *   This module NEVER recommends:
 *   - Tax evasion or concealment
 *   - False expenses
 *   - Artificial transactions
 *   - Threshold splitting
 *   - Misleading records
 *   - Under-reporting income
 *   - Over-claiming deductions without supporting documents
 *
 * @module tax-optimization
 */

import Decimal from 'decimal.js';
import type { TaxYear } from './tax-engine-v2.ts';

// --- Types --------------------------------------------------------------------

export type OptimizationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type OptimizationType =
  | 'deduction_unused'
  | 'regime_switch'
  | 'timing_strategy'
  | 'tds_mismatch'
  | 'capital_loss_harvest'
  | 'documentation_gap'
  | 'investment_planning';

export interface TaxOptimizationRecommendation {
  id: string;
  type: OptimizationType;
  title: string;
  /** Why this opportunity exists */
  why: string;
  /** Legal basis (section, act, notification) */
  legalBasis: string;
  /** Who it applies to */
  applicability: string;
  /** Assumptions made */
  assumptions: string[];
  /** How the savings are calculated */
  calculation: string;
  /** Estimated annual saving in Rs */
  estimatedSavingRs: number;
  /** Documentation required to claim */
  documentation: string[];
  /** Deadline to act */
  deadline: string;
  /** Source authority */
  source: { authority: string; url: string; section?: string };
  /** Confidence in the recommendation */
  confidence: OptimizationConfidence;
  /** Action steps for the user */
  actionSteps: string[];
  /** Is this applicable under Old Regime, New Regime, or both */
  applicableRegimes: ('old' | 'new' | 'both')[];
  /** Ethical note: confirm this is lawful planning, not evasion */
  ethicalNote: string;
}

export interface OptimizationInput {
  taxYear: TaxYear;
  regime: 'old' | 'new';
  grossIncome: Decimal;
  // Current deductions
  current80C?: Decimal;
  current80D?: Decimal;
  currentNPS80CCD1B?: Decimal;
  currentHRA?: Decimal;
  currentHomeLoanInterest?: Decimal;
  currentEduLoanInterest?: Decimal;
  currentOtherDeductions?: Decimal;
  // Capital gains
  ltcgEquity?: Decimal;
  stcgEquity?: Decimal;
  unrealizedLossEquity?: Decimal;
  // TDS
  tdsDeducted?: Decimal;
  tdsVisible26AS?: Decimal;
  // Tax paid
  advanceTaxPaid?: Decimal;
  // Profile
  hasHomeLoan?: boolean;
  hasEduLoan?: boolean;
  age?: number;
  isEmployed?: boolean;
  isBusinessOwner?: boolean;
}

// --- Optimization Engine ------------------------------------------------------

export function generateOptimizationRecommendations(input: OptimizationInput): TaxOptimizationRecommendation[] {
  const recommendations: TaxOptimizationRecommendation[] = [];
  const { regime, grossIncome } = input;

  // -- 1. Unused 80C headroom (Old Regime only) --------------------------------
  if (regime === 'old') {
    const current80C = input.current80C ?? new Decimal(0);
    const maxLimit80C = new Decimal(150000);
    const unused80C = Decimal.max(maxLimit80C.minus(current80C), new Decimal(0));

    if (unused80C.gt(10000)) {
      const marginalRate = grossIncome.gt(1000000) ? 30 : grossIncome.gt(500000) ? 20 : 5;
      const saving = unused80C.times(marginalRate + 4).div(100); // approx with cess

      recommendations.push({
        id: 'OPT-80C-UNUSED',
        type: 'deduction_unused',
        title: `Unused Section 80C Headroom â€” Rs ${unused80C.toFixed(0)} Available`,
        why: `You have not fully utilized your Section 80C deduction limit of Rs 1,50,000. Investing the remaining Rs ${unused80C.toFixed(0)} in eligible instruments can reduce your taxable income.`,
        legalBasis: 'Section 80C of the Income Tax Act 1961',
        applicability: 'Individuals and HUFs under Old Tax Regime',
        assumptions: [
          `Current 80C investments: Rs ${current80C.toFixed(0)}`,
          `Effective marginal tax rate: ${marginalRate}% + 4% cess`,
        ],
        calculation: `Unused 80C = Rs 1,50,000 - Rs ${current80C.toFixed(0)} = Rs ${unused80C.toFixed(0)} | Tax saving Ëœ Rs ${saving.toFixed(0)} at ${marginalRate}% + cess`,
        estimatedSavingRs: saving.toNumber(),
        documentation: ['Investment receipts', 'ELSS mutual fund statement', 'PPF passbook', 'LIC premium receipt'],
        deadline: '2026-03-31',
        source: {
          authority: 'Income Tax Act 1961',
          url: 'https://www.incometax.gov.in',
          section: 'Section 80C',
        },
        confidence: 'HIGH',
        actionSteps: [
          `Invest Rs ${unused80C.toFixed(0)} in ELSS mutual fund (lowest 3-year lock-in), PPF, NSC, or tax-saving FD before 31 March.`,
          'Submit proof of investment to employer for Form 16 adjustment, or claim in ITR directly.',
        ],
        applicableRegimes: ['old'],
        ethicalNote: 'This is a lawful deduction for actual investments made. All investments must be genuine and verifiable.',
      });
    }
  }

  // -- 2. Unused NPS 80CCD(1B) headroom (Old Regime) ---------------------------
  if (regime === 'old') {
    const currentNPS = input.currentNPS80CCD1B ?? new Decimal(0);
    const maxNPS = new Decimal(50000);
    const unusedNPS = Decimal.max(maxNPS.minus(currentNPS), new Decimal(0));

    if (unusedNPS.gt(5000)) {
      const marginalRate = grossIncome.gt(1000000) ? 30 : 20;
      const saving = unusedNPS.times(marginalRate + 4).div(100);

      recommendations.push({
        id: 'OPT-NPS-80CCD1B',
        type: 'deduction_unused',
        title: `NPS Section 80CCD(1B) â€” Additional Rs ${unusedNPS.toFixed(0)} Deduction Available`,
        why: `Section 80CCD(1B) allows an additional Rs 50,000 deduction for NPS Tier 1 contributions, separate from the Rs 1,50,000 80C limit. This Rs ${unusedNPS.toFixed(0)} can be invested in NPS for tax savings.`,
        legalBasis: 'Section 80CCD(1B) of the Income Tax Act 1961',
        applicability: 'Individuals with NPS Tier 1 account under Old Regime',
        assumptions: [
          `Current NPS 80CCD(1B): Rs ${currentNPS.toFixed(0)}`,
          `Effective marginal rate: ${marginalRate}%`,
        ],
        calculation: `Unused NPS = Rs 50,000 - Rs ${currentNPS.toFixed(0)} = Rs ${unusedNPS.toFixed(0)} | Saving Ëœ Rs ${saving.toFixed(0)}`,
        estimatedSavingRs: saving.toNumber(),
        documentation: ['NPS contribution receipt', 'PRAN statement', 'NPS Form S1'],
        deadline: '2026-03-31',
        source: {
          authority: 'Income Tax Act 1961',
          url: 'https://www.incometax.gov.in',
          section: 'Section 80CCD(1B)',
        },
        confidence: 'HIGH',
        actionSteps: [
          `Open an NPS Tier 1 account (if not already done) at any PoP bank or eNPS portal.`,
          `Contribute Rs ${unusedNPS.toFixed(0)} before 31 March.`,
          'Keep NPS transaction statement as proof.',
        ],
        applicableRegimes: ['old'],
        ethicalNote: 'NPS contributions are genuine retirement savings. No artificial transactions.',
      });
    }
  }

  // -- 3. Regime switch opportunity --------------------------------------------
  // (Computed in Tax Radar; here we provide implementation guidance)
  recommendations.push({
    id: 'OPT-REGIME-COMPARISON',
    type: 'regime_switch',
    title: 'Review Tax Regime Annually Before April',
    why: 'Salaried employees can switch between Old and New Regime every financial year. The optimal regime depends on deductions available. Incorrect regime choice can result in higher taxes.',
    legalBasis: 'Section 115BAC of the Income Tax Act 1961 (New Tax Regime)',
    applicability: 'All individual taxpayers',
    assumptions: ['Salaried employees can switch regime annually', 'Business/professional income: regime switch has restrictions'],
    calculation: 'Compare tax under both regimes using Tax Engine V2 with your actual income and deductions.',
    estimatedSavingRs: 0, // Varies; use Tax Radar for specific calculation
    documentation: ['No additional documentation for regime selection itself'],
    deadline: '2026-04-01',
    source: {
      authority: 'Income Tax Act 1961',
      url: 'https://www.incometax.gov.in',
      section: 'Section 115BAC',
    },
    confidence: 'HIGH',
    actionSteps: [
      'Use NisFlow Tax Calculator to compare regimes with your exact income.',
      'If New Regime is better, inform employer via Form 10-IEA or declaration at start of year.',
      'If Old Regime is better, ensure all deduction investments are made before 31 March.',
    ],
    applicableRegimes: ['both'],
    ethicalNote: 'Choosing the regime that results in lower tax is a fully legitimate right under the Income Tax Act.',
  });

  // -- 4. Capital loss harvesting ---------------------------------------------
  const ltcgEquity = input.ltcgEquity ?? new Decimal(0);
  const unrealizedLoss = input.unrealizedLossEquity ?? new Decimal(0);

  if (ltcgEquity.gt(125000) && unrealizedLoss.gt(0)) {
    const taxableLTCG = Decimal.max(ltcgEquity.minus(125000), new Decimal(0));
    const maxHarvestBenefit = Decimal.min(unrealizedLoss, taxableLTCG).times(12.5).div(100);

    recommendations.push({
      id: 'OPT-CAPITAL-LOSS-HARVEST',
      type: 'capital_loss_harvest',
      title: `Tax-Loss Harvesting â€” Potential Saving Rs ${maxHarvestBenefit.toFixed(0)}`,
      why: `You have unrealized losses of Rs ${unrealizedLoss.toFixed(0)} in your portfolio and taxable LTCG of Rs ${taxableLTCG.toFixed(0)}. Selling loss positions can offset gains and reduce LTCG tax.`,
      legalBasis: 'Section 70/74 of Income Tax Act 1961 â€” Capital loss set-off provisions',
      applicability: 'Investors with both realized gains and unrealized losses in equity portfolio',
      assumptions: [
        `Realized LTCG = Rs ${ltcgEquity.toFixed(0)}`,
        `LTCG exemption = Rs 1,25,000`,
        `Taxable LTCG = Rs ${taxableLTCG.toFixed(0)}`,
        `Unrealized losses = Rs ${unrealizedLoss.toFixed(0)}`,
        'LTCG rate: 12.5%',
      ],
      calculation: `Offset = min(Rs ${unrealizedLoss.toFixed(0)}, Rs ${taxableLTCG.toFixed(0)}) | Tax saving = Rs ${maxHarvestBenefit.toFixed(0)} at 12.5%`,
      estimatedSavingRs: maxHarvestBenefit.toNumber(),
      documentation: ['Broker contract notes for loss-making sales', 'Capital gains statement'],
      deadline: '2026-03-31',
      source: {
        authority: 'Income Tax Act 1961',
        url: 'https://www.incometax.gov.in',
        section: 'Section 70/74',
      },
      confidence: 'MEDIUM',
      actionSteps: [
        'Identify equity holdings with unrealized losses.',
        'Sell loss positions before 31 March to book the loss in FY 2025-26.',
        'You may repurchase the same securities after 30+ days (to avoid wash-sale-style scrutiny).',
        'Consult a SEBI-registered advisor for portfolio-specific decisions.',
      ],
      applicableRegimes: ['both'],
      ethicalNote: 'Tax-loss harvesting is a standard, legal investment strategy. Do not create artificial losses through related-party transactions.',
    });
  }

  // -- 5. TDS credit mismatch -------------------------------------------------
  const tdsDeducted = input.tdsDeducted ?? new Decimal(0);
  const tdsVisible = input.tdsVisible26AS ?? new Decimal(0);

  if (tdsDeducted.gt(0) && tdsVisible.gt(0) && !tdsDeducted.eq(tdsVisible)) {
    const mismatch = tdsDeducted.minus(tdsVisible).abs();
    recommendations.push({
      id: 'OPT-TDS-MISMATCH',
      type: 'tds_mismatch',
      title: `TDS Mismatch Detected â€” Rs ${mismatch.toFixed(0)} Discrepancy`,
      why: `There is a Rs ${mismatch.toFixed(0)} difference between your records and Form 26AS TDS. This could mean: (a) unclaimed TDS credit, or (b) error in filing. Either way, it must be resolved before ITR filing.`,
      legalBasis: 'Section 199 of Income Tax Act 1961 â€” TDS Credit; Form 26AS reconciliation',
      applicability: 'All taxpayers with TDS deducted',
      assumptions: [
        `Your records: TDS = Rs ${tdsDeducted.toFixed(0)}`,
        `Form 26AS: TDS = Rs ${tdsVisible.toFixed(0)}`,
      ],
      calculation: `Mismatch = Rs ${mismatch.toFixed(0)}`,
      estimatedSavingRs: mismatch.toNumber(),
      documentation: ['Form 16 / Form 16A from employer/bank', 'AIS/Form 26AS download from IT portal'],
      deadline: '2026-07-31',
      source: {
        authority: 'Income Tax Act 1961',
        url: 'https://incometax.gov.in/iec/foportal/',
        section: 'Section 199 & Form 26AS',
      },
      confidence: 'HIGH',
      actionSteps: [
        'Download Form 26AS and AIS from the Income Tax portal.',
        'Cross-check all Form 16 / Form 16A TDS amounts.',
        'If TDS is deducted but not reflected in 26AS, contact the deductor to file TDS returns.',
        'Claim only TDS that appears in 26AS in your ITR to avoid discrepancy notice.',
      ],
      applicableRegimes: ['both'],
      ethicalNote: 'Claim only legitimate TDS credits that are verifiable in Form 26AS.',
    });
  }

  // -- 6. Documentation gap advisory -----------------------------------------
  const deductionClaimedWithoutDocs: string[] = [];
  if ((input.current80C ?? new Decimal(0)).gt(0)) deductionClaimedWithoutDocs.push('80C investment proofs');
  if ((input.current80D ?? new Decimal(0)).gt(0)) deductionClaimedWithoutDocs.push('Health insurance premium receipts');
  if ((input.currentHomeLoanInterest ?? new Decimal(0)).gt(0)) deductionClaimedWithoutDocs.push('Home loan interest certificate (annual)');

  if (deductionClaimedWithoutDocs.length > 0) {
    recommendations.push({
      id: 'OPT-DOCUMENTATION-GAP',
      type: 'documentation_gap',
      title: 'Collect Documentation for Claimed Deductions',
      why: 'Tax deductions can be disallowed in scrutiny assessments if supporting documentation is not available. Proactively collecting documents now prevents issues during filing or assessment.',
      legalBasis: 'Section 69C, 80C, 80D, 24(b) of Income Tax Act â€” proof of eligible expenditure/investment',
      applicability: 'All taxpayers claiming deductions',
      assumptions: ['Documents must be retained for at least 6 years from the assessment year'],
      calculation: 'N/A â€” risk mitigation measure',
      estimatedSavingRs: 0,
      documentation: deductionClaimedWithoutDocs,
      deadline: '2026-07-31',
      source: {
        authority: 'Income Tax Act 1961',
        url: 'https://www.incometax.gov.in',
      },
      confidence: 'HIGH',
      actionSteps: deductionClaimedWithoutDocs.map(d => `Obtain and store: ${d}`),
      applicableRegimes: ['old'],
      ethicalNote: 'Only claim deductions you have actual proof for. Do not inflate investments without documentation.',
    });
  }

  return recommendations;
}
