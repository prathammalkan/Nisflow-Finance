/**
 * NISFLOW FINANCE â€” UPI / PAYMENT INTELLIGENCE ENGINE
 *
 * Provides contextual guidance for UPI and payment method selection.
 * Rules are sourced from RBI and NPCI official publications.
 *
 * IMPORTANT:
 *   - Universal UPI limits (NPCI) are NOT the same as bank-specific limits.
 *   - This engine evaluates based on NPCI defaults + known bank overrides.
 *   - If a bank-specific rule is unknown, it surfaces with UNVERIFIED status.
 *   - Never claims universal limits without source attribution.
 *
 * @module upi-engine
 */

import {
  getUPILimit,
  getRbiNpciRules,
  isRuleStale,
  type BankRule,
} from './bank-registry.ts';

// --- Types --------------------------------------------------------------------

export type PaymentMethod =
  | 'UPI'
  | 'UPI_LITE'
  | 'UPI_AUTOPAY'
  | 'NEFT'
  | 'RTGS'
  | 'IMPS'
  | 'BANK_TRANSFER'
  | 'CREDIT_CARD'
  | 'DEBIT_CARD'
  | 'CASH'
  | 'CHEQUE'
  | 'DEMAND_DRAFT';

export type PaymentCategory =
  | 'personal_transfer'
  | 'merchant_payment'
  | 'tax_payment'
  | 'ipo_application'
  | 'investment_purchase'
  | 'loan_emi'
  | 'rent'
  | 'salary'
  | 'utility'
  | 'insurance_premium'
  | 'sip_investment'
  | 'large_purchase'
  | 'emergency'
  | 'vendor_payment'
  | 'government_payment'
  | 'international';

export type ComplianceStatus = 'ALLOWED' | 'REVIEW' | 'BLOCKED' | 'DOCUMENTATION_REQUIRED';

export interface PaymentEvaluation {
  amount: number;
  method: PaymentMethod;
  category: PaymentCategory;
  bankId?: string;
  allowed: ComplianceStatus;
  reason: string;
  warnings: string[];
  recommendations: string[];
  documentationRequired: string[];
  taxImplications: string[];
  applicableRules: BankRule[];
  rulesStaleness: 'FRESH' | 'UNVERIFIED';
  sources: Array<{ authority: string; url: string }>;
}

export interface PaymentMethodRecommendation {
  method: PaymentMethod;
  suitabilityScore: number; // 1-10
  reason: string;
  pros: string[];
  cons: string[];
  recommendedFor: PaymentCategory[];
  documentationQuality: 'excellent' | 'good' | 'fair' | 'poor';
  taxEvidenceQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

// --- Payment Method Characteristics ------------------------------------------

export const PAYMENT_METHOD_PROFILES: Record<PaymentMethod, PaymentMethodRecommendation> = {
  UPI: {
    method: 'UPI',
    suitabilityScore: 9,
    reason: 'Instant, free, widely accepted, excellent digital trail',
    pros: [
      'Instant 24/7 settlement',
      'Zero fees for most transactions',
      'Good digital audit trail (transaction ID, timestamp)',
      'Works for P2P and P2M',
    ],
    cons: [
      'Rs 1,00,000 per transaction/day limit (NPCI default)',
      'Requires smartphone and internet',
      'Not suitable for international payments',
    ],
    recommendedFor: ['personal_transfer', 'merchant_payment', 'utility', 'loan_emi', 'rent'],
    documentationQuality: 'good',
    taxEvidenceQuality: 'good',
  },
  UPI_LITE: {
    method: 'UPI_LITE',
    suitabilityScore: 6,
    reason: 'Good for small offline payments but limited trail',
    pros: ['No PIN required', 'Works offline', 'Fast'],
    cons: [
      'Max Rs 500 per transaction',
      'Max Rs 2,000 wallet',
      'Not real-time on bank statement',
      'Limited evidence quality',
    ],
    recommendedFor: ['merchant_payment'],
    documentationQuality: 'fair',
    taxEvidenceQuality: 'fair',
  },
  UPI_AUTOPAY: {
    method: 'UPI_AUTOPAY',
    suitabilityScore: 8,
    reason: 'Excellent for recurring payments with mandate trail',
    pros: [
      'Automated recurring debit',
      'Mandate creates documented consent trail',
      'Good for SIPs, insurance premiums, subscriptions',
    ],
    cons: ['Requires mandate setup', 'Max limits apply per mandate type'],
    recommendedFor: ['sip_investment', 'insurance_premium', 'loan_emi', 'utility'],
    documentationQuality: 'excellent',
    taxEvidenceQuality: 'good',
  },
  NEFT: {
    method: 'NEFT',
    suitabilityScore: 8,
    reason: 'No minimum, no maximum, excellent for large non-urgent transfers',
    pros: [
      'No minimum or maximum limit',
      'Works for any amount',
      'Excellent bank statement trail',
      'Bank reference number for audit',
    ],
    cons: [
      'Not instant (batches every 30 min during banking hours)',
      'May not be available 24/7 for all banks',
    ],
    recommendedFor: ['large_purchase', 'vendor_payment', 'salary', 'government_payment'],
    documentationQuality: 'excellent',
    taxEvidenceQuality: 'excellent',
  },
  RTGS: {
    method: 'RTGS',
    suitabilityScore: 9,
    reason: 'Instant settlement for large amounts above Rs 2 lakh',
    pros: [
      'Real-time gross settlement â€” immediate finality',
      'Excellent audit trail',
      'Suitable for large high-value transactions',
    ],
    cons: [
      'Minimum Rs 2,00,000',
      'May have charges (check with bank)',
    ],
    recommendedFor: ['large_purchase', 'vendor_payment', 'government_payment'],
    documentationQuality: 'excellent',
    taxEvidenceQuality: 'excellent',
  },
  IMPS: {
    method: 'IMPS',
    suitabilityScore: 8,
    reason: 'Instant 24/7 interbank transfer with good trail',
    pros: [
      'Instant 24/7',
      'Works for amounts up to Rs 5,00,000 (varies by bank)',
      'Good bank statement trail',
    ],
    cons: [
      'May have charges for higher amounts',
      'Bank-specific limits vary',
    ],
    recommendedFor: ['personal_transfer', 'large_purchase', 'vendor_payment'],
    documentationQuality: 'excellent',
    taxEvidenceQuality: 'excellent',
  },
  BANK_TRANSFER: {
    method: 'BANK_TRANSFER',
    suitabilityScore: 7,
    reason: 'Generic bank transfer â€” good trail but mode-dependent',
    pros: ['Good documentation', 'Traceable'],
    cons: ['Mode-specific limits apply', 'Speed varies'],
    recommendedFor: ['vendor_payment', 'salary'],
    documentationQuality: 'good',
    taxEvidenceQuality: 'good',
  },
  CREDIT_CARD: {
    method: 'CREDIT_CARD',
    suitabilityScore: 7,
    reason: 'Good for purchases with purchase protection; not for fund transfers',
    pros: [
      'Purchase protection and dispute resolution',
      'Reward points / cashback',
      'Credit period of up to 45-50 days',
    ],
    cons: [
      'High interest if balance carried (36-42% pa)',
      'Not suitable for person-to-person transfers',
      'Adds liability',
    ],
    recommendedFor: ['merchant_payment', 'large_purchase'],
    documentationQuality: 'excellent',
    taxEvidenceQuality: 'good',
  },
  DEBIT_CARD: {
    method: 'DEBIT_CARD',
    suitabilityScore: 7,
    reason: 'Instant debit with good trail; limits apply at POS',
    pros: ['Widely accepted', 'Good trail via bank statement'],
    cons: ['Daily limits apply', 'Not accepted everywhere'],
    recommendedFor: ['merchant_payment'],
    documentationQuality: 'good',
    taxEvidenceQuality: 'good',
  },
  CASH: {
    method: 'CASH',
    suitabilityScore: 3,
    reason: 'Poor evidence quality, legal restrictions on large cash payments',
    pros: ['No technology required', 'Immediate'],
    cons: [
      'Section 269ST: Receiving cash > Rs 2,00,000 in single transaction prohibited',
      'Section 40A(3): Business cash payments > Rs 10,000 per day not deductible',
      'No digital trail â€” difficult to prove payment',
      'High audit risk for large amounts',
    ],
    recommendedFor: ['merchant_payment'],
    documentationQuality: 'poor',
    taxEvidenceQuality: 'poor',
  },
  CHEQUE: {
    method: 'CHEQUE',
    suitabilityScore: 6,
    reason: 'Decent trail but slow; risk of bounce',
    pros: ['Widely accepted', 'Legal instrument', 'Can post-date'],
    cons: ['Clearing takes 2-3 days', 'Bounce risk', 'Cheque book required'],
    recommendedFor: ['rent', 'vendor_payment'],
    documentationQuality: 'good',
    taxEvidenceQuality: 'good',
  },
  DEMAND_DRAFT: {
    method: 'DEMAND_DRAFT',
    suitabilityScore: 6,
    reason: 'Guaranteed payment instrument; bank-issued',
    pros: ['Cannot bounce', 'Accepted by government/educational institutions'],
    cons: ['Requires bank visit', 'Charges apply', 'Takes time'],
    recommendedFor: ['government_payment'],
    documentationQuality: 'excellent',
    taxEvidenceQuality: 'excellent',
  },
};

// --- Cash Compliance Rules ----------------------------------------------------

export const CASH_COMPLIANCE_RULES = {
  section269ST: {
    limit: 200000,
    description: 'No person shall receive Rs 2,00,000 or more in cash from a single person in a day, or in a single transaction, or in transactions relating to one event or occasion.',
    source: 'Section 269ST of Income Tax Act 1961',
    sourceUrl: 'https://www.incometax.gov.in',
    penalty: '100% of amount received as penalty under Section 271DA',
    effectiveFrom: '2017-04-01',
  },
  section40A3: {
    dailyLimit: 10000,
    description: 'Business cash payments exceeding Rs 10,000 in a day to a single person are not allowable as business deduction.',
    source: 'Section 40A(3) of Income Tax Act 1961',
    sourceUrl: 'https://www.incometax.gov.in',
    effectiveFrom: '2017-04-01',
  },
} as const;

// --- Core Evaluation Functions ------------------------------------------------

/**
 * Evaluate whether a payment can proceed given the amount, method, and category.
 * Returns a structured evaluation with allowed status, warnings, and documentation requirements.
 */
export function evaluatePayment(params: {
  amount: number;
  method: PaymentMethod;
  category: PaymentCategory;
  bankId?: string;
  isBusinessExpense?: boolean;
}): PaymentEvaluation {
  const { amount, method, category, bankId, isBusinessExpense = false } = params;

  const warnings: string[] = [];
  const recommendations: string[] = [];
  const documentationRequired: string[] = [];
  const taxImplications: string[] = [];
  const applicableRules: BankRule[] = [];
  const sources: Array<{ authority: string; url: string }> = [];
  let allowed: ComplianceStatus = 'ALLOWED';
  let reason = '';
  let rulesStaleness: 'FRESH' | 'UNVERIFIED' = 'FRESH';

  // -- UPI evaluation ----------------------------------------------------------
  if (method === 'UPI' || method === 'UPI_LITE' || method === 'UPI_AUTOPAY') {
    const upiCategory = method === 'UPI_LITE' ? 'lite'
      : category === 'tax_payment' ? 'tax'
      : category === 'ipo_application' ? 'ipo'
      : 'p2p';

    const limitResult = getUPILimit(upiCategory, bankId);

    if (isRuleStale({ verifiedAt: '2025-01-15' } as BankRule)) {
      rulesStaleness = 'UNVERIFIED';
      warnings.push('UPI limit rule verification is due. Please verify current limits with your bank before proceeding.');
    }

    sources.push(limitResult.source);

    if (method === 'UPI_LITE') {
      if (amount > 500) {
        allowed = 'BLOCKED';
        reason = `UPI Lite cannot be used for amounts over Rs 500. This amount (Rs ${amount.toLocaleString('en-IN')}) exceeds the UPI Lite per-transaction limit.`;
      } else {
        reason = `UPI Lite is suitable for Rs ${amount.toLocaleString('en-IN')}.`;
      }
    } else {
      if (amount > limitResult.limitAmount) {
        allowed = 'BLOCKED';
        reason = `Rs ${amount.toLocaleString('en-IN')} exceeds the ${upiCategory === 'tax' ? 'UPI tax payment' : upiCategory === 'ipo' ? 'UPI IPO' : 'UPI'} limit of Rs ${limitResult.limitAmount.toLocaleString('en-IN')}. Consider RTGS or NEFT.`;
        recommendations.push(`Use RTGS for amounts above Rs 2,00,000 or NEFT/IMPS for intermediate amounts.`);
      } else {
        reason = `Rs ${amount.toLocaleString('en-IN')} is within UPI ${upiCategory === 'tax' ? 'tax payment' : ''} limits.`;
        if (limitResult.bankSpecificNote) {
          warnings.push(`Bank-specific note: ${limitResult.bankSpecificNote}`);
        }
      }
    }

    if (upiCategory === 'tax') {
      documentationRequired.push('Payment reference number from tax portal (Challan BSR code + serial)');
      taxImplications.push('Tax payment via UPI generates challan â€” save for Form 26AS/AIS reconciliation');
    }
  }

  // -- RTGS evaluation ---------------------------------------------------------
  if (method === 'RTGS') {
    const rtgsRule = getRbiNpciRules('rtgs_minimum')[0];
    if (rtgsRule) {
      applicableRules.push(rtgsRule);
      sources.push(rtgsRule.source);
      if (isRuleStale(rtgsRule)) rulesStaleness = 'UNVERIFIED';
    }

    if (amount < 200000) {
      allowed = 'BLOCKED';
      reason = `RTGS requires a minimum of Rs 2,00,000. Amount Rs ${amount.toLocaleString('en-IN')} is below minimum. Use NEFT or IMPS instead.`;
      recommendations.push('Use NEFT for amounts below Rs 2,00,000');
    } else {
      reason = `Rs ${amount.toLocaleString('en-IN')} qualifies for RTGS.`;
      documentationRequired.push('Bank RTGS acknowledgment slip with UTR number');
    }
  }

  // -- NEFT evaluation ----------------------------------------------------------
  if (method === 'NEFT') {
    reason = `NEFT has no minimum limit. Rs ${amount.toLocaleString('en-IN')} can be transferred via NEFT.`;
    documentationRequired.push('Bank NEFT acknowledgment with reference number');
    const neftRule = getRbiNpciRules('neft_minimum')[0];
    if (neftRule) {
      applicableRules.push(neftRule);
      sources.push(neftRule.source);
    }
  }

  // -- Cash evaluation ---------------------------------------------------------
  if (method === 'CASH') {
    if (amount >= 200000) {
      allowed = 'BLOCKED';
      reason = `Cash transactions of Rs 2,00,000 or more are PROHIBITED under Section 269ST of the Income Tax Act. Penalty is 100% of the amount.`;
      warnings.push('Section 269ST violation. This payment CANNOT be made in cash.');
      taxImplications.push('Section 269ST: Cash receipts >= Rs 2,00,000 prohibited; 100% penalty on receiver');
      recommendations.push('Use NEFT, RTGS, UPI, or cheque instead.');
      sources.push({ authority: 'CBDT', url: 'https://www.incometax.gov.in' });
    } else if (amount > 10000 && isBusinessExpense) {
      allowed = 'REVIEW';
      reason = `Business cash payments > Rs 10,000 per day to a single vendor are not deductible as business expense under Section 40A(3). This Rs ${amount.toLocaleString('en-IN')} payment may not be allowable.`;
      warnings.push('Section 40A(3): Business cash payment may not be deductible.');
      taxImplications.push('Section 40A(3): Business cash expense > Rs 10,000/day per person not deductible');
      recommendations.push('Use digital payment for deductibility.');
    } else {
      reason = `Cash payment of Rs ${amount.toLocaleString('en-IN')} is within permissible limits. Retain receipt.`;
      documentationRequired.push('Physical receipt or cash memo');
      if (amount > 50000) {
        warnings.push('PAN required for cash transactions > Rs 50,000 at many institutions (Section 139A).');
      }
    }
  }

  // -- Large payment documentation --------------------------------------------
  if (amount >= 50000) {
    documentationRequired.push('Payment receipt/acknowledgment with payer and payee details');
  }
  if (amount >= 200000) {
    documentationRequired.push('Purpose/invoice documentation to explain large transfer');
    taxImplications.push('Large transfer may appear in AIS â€” ensure source is documented');
  }

  // -- Category-specific guidance ---------------------------------------------
  if (category === 'ipo_application') {
    documentationRequired.push('IPO application form', 'UPI mandate acceptance confirmation', 'Allotment advice or refund order');
    taxImplications.push('IPO application block: amount held, not spent â€” no tax implication until allotment');
  }

  if (category === 'tax_payment') {
    documentationRequired.push('Tax challan (ITNS 280/281)', 'BSR code and Challan Serial Number');
    taxImplications.push('Tax paid challan reconciles against Form 26AS and AIS');
  }

  return {
    amount,
    method,
    category,
    bankId,
    allowed,
    reason,
    warnings,
    recommendations,
    documentationRequired,
    taxImplications,
    applicableRules,
    rulesStaleness,
    sources,
  };
}

/**
 * Recommend the best payment method for a given amount and category.
 * Returns ranked recommendations with reasoning.
 */
export interface PaymentMethodRanking {
  method: PaymentMethod;
  rank: number;
  score: number;
  recommended: boolean;
  reason: string;
  profile: PaymentMethodRecommendation;
}

export function recommendPaymentMethod(params: {
  amount: number;
  category: PaymentCategory;
  isBusinessExpense?: boolean;
  bankId?: string;
}): PaymentMethodRanking[] {
  const { amount, category, isBusinessExpense = false } = params;

  const candidates: PaymentMethod[] = ['UPI', 'NEFT', 'RTGS', 'IMPS', 'CHEQUE', 'CASH'];
  const rankings: PaymentMethodRanking[] = [];

  for (const method of candidates) {
    const eval_ = evaluatePayment({ amount, method, category, bankId: params.bankId, isBusinessExpense });
    const profile = PAYMENT_METHOD_PROFILES[method];

    if (eval_.allowed === 'BLOCKED') continue;

    let score = profile.suitabilityScore;

    // Boost RTGS for very large amounts
    if (method === 'RTGS' && amount >= 500000) score += 2;
    // Penalize cash for large amounts
    if (method === 'CASH' && amount > 50000) score -= 4;
    // Boost UPI for small-medium amounts
    if (method === 'UPI' && amount <= 100000) score += 1;
    // Boost NEFT for amounts that UPI cannot handle
    if (method === 'NEFT' && amount > 100000) score += 2;

    rankings.push({
      method,
      rank: 0,
      score,
      recommended: eval_.allowed === 'ALLOWED',
      reason: eval_.reason,
      profile,
    });
  }

  rankings.sort((a, b) => b.score - a.score);
  rankings.forEach((r, i) => { r.rank = i + 1; });

  return rankings;
}

/**
 * Evaluate a UPI transaction "Can I pay Rs X via UPI?"
 * Returns a user-facing answer with all relevant context.
 */
export interface UPICapabilityAnswer {
  canPay: boolean;
  amount: number;
  applicableLimit: number;
  limitType: string;
  answer: string;
  caveats: string[];
  sourceAttribution: string;
}

export function canPayViaUPI(params: {
  amount: number;
  category: 'p2p' | 'p2m' | 'tax' | 'ipo' | 'lite';
  bankId?: string;
}): UPICapabilityAnswer {
  const { amount, category, bankId } = params;
  const limit = getUPILimit(category, bankId);
  const canPay = amount <= limit.limitAmount;

  const caveats: string[] = [];
  if (limit.isStale) {
    caveats.push('Note: This limit information may need re-verification. Please confirm with your bank or NPCI before a large transaction.');
  }
  if (limit.bankSpecificNote) {
    caveats.push(limit.bankSpecificNote);
  }
  if (category === 'tax' && canPay) {
    caveats.push('Ensure the UPI app supports the enhanced Tax Payment category limit.');
  }

  const limitLabel = category === 'tax' ? 'UPI Tax Payment limit'
    : category === 'ipo' ? 'UPI IPO/ASBA limit'
    : category === 'lite' ? 'UPI Lite per-transaction limit'
    : 'NPCI UPI daily limit';

  return {
    canPay,
    amount,
    applicableLimit: limit.limitAmount,
    limitType: limitLabel,
    answer: canPay
      ? `Yes, Rs ${amount.toLocaleString('en-IN')} can be paid via UPI. The ${limitLabel} is Rs ${limit.limitAmount.toLocaleString('en-IN')}.`
      : `No, Rs ${amount.toLocaleString('en-IN')} exceeds the ${limitLabel} of Rs ${limit.limitAmount.toLocaleString('en-IN')}. Consider RTGS or NEFT.`,
    caveats,
    sourceAttribution: `Source: ${limit.source.authority} â€” ${limit.source.url}`,
  };
}
