/**
 * NISFLOW FINANCE — FINANCIAL RISK MONITOR
 *
 * Explainable anomaly and risk detection.
 * Every risk flag explains WHY it was flagged.
 *
 * Risk Levels: NORMAL | REVIEW | HIGH_RISK
 *
 * IMPORTANT: Do NOT call something illegal merely because it is unusual.
 * An unusual transaction may have a perfectly valid explanation.
 * This module generates REVIEW items, not accusations.
 *
 * @module financial-risk-monitor
 */

import Decimal from 'decimal.js';

// --- Types --------------------------------------------------------------------

export type RiskLevel = 'NORMAL' | 'REVIEW' | 'HIGH_RISK';

export type RiskCategory =
  | 'duplicate_transaction'
  | 'unusual_spending'
  | 'account_purpose_mismatch'
  | 'business_personal_mixing'
  | 'missing_evidence'
  | 'reconciliation_mismatch'
  | 'unexpected_recurring'
  | 'unusual_loan_activity'
  | 'investment_anomaly'
  | 'tax_risk'
  | 'approaching_limit'
  | 'large_cash'
  | 'unexplained_credit';

export interface RiskFlag {
  flagId: string;
  riskCategory: RiskCategory;
  riskLevel: RiskLevel;
  title: string;
  /** Why this was flagged — deterministic explanation */
  explanation: string;
  /** What the system observed */
  observation: string;
  /** What the user should do */
  recommendedAction: string;
  /** Regulatory/accounting context if applicable */
  regulatoryContext?: string;
  /** Entity references */
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Amount in Rs if applicable */
  amountInRs?: number;
  /** Timestamp of the risky event */
  detectedAt: string;
}

export interface TransactionForRisk {
  id: string;
  amount: number;
  description: string;
  date: string;
  type: string;
  accountId: string;
  accountType?: string;
  counterpartyId?: string;
  categoryId?: string;
  isCash?: boolean;
  notes?: string;
}

// --- Risk Evaluation ----------------------------------------------------------

/**
 * Evaluate a set of transactions for risk flags.
 * Returns structured risk flags with explanations.
 */
export function evaluateTransactionRisk(params: {
  transactions: TransactionForRisk[];
  averageMonthlySpend?: number;
  accountType?: string;
  accountPurposeId?: string;
}): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const now = new Date().toISOString();
  const { transactions, averageMonthlySpend, accountType, accountPurposeId } = params;

  // -- 1. Duplicate detection -------------------------------------------------
  const seen = new Map<string, TransactionForRisk>();
  for (const txn of transactions) {
    const key = `${txn.amount}|${txn.date}|${txn.description?.toLowerCase().trim()}`;
    if (seen.has(key)) {
      const existing = seen.get(key)!;
      flags.push({
        flagId: `DUPLICATE-${txn.id}`,
        riskCategory: 'duplicate_transaction',
        riskLevel: 'REVIEW',
        title: 'Possible Duplicate Transaction',
        explanation: `Two transactions with identical amount (Rs ${txn.amount}), date (${txn.date}), and description were found. This may be a genuine duplicate posting or a valid recurring payment.`,
        observation: `Transaction "${txn.description}" for Rs ${txn.amount} on ${txn.date} appears more than once.`,
        recommendedAction: 'Review both transactions. If one is a duplicate, use the Reversal function to correct it. Do not delete — use compensating entry.',
        relatedEntityType: 'transaction',
        relatedEntityId: txn.id,
        amountInRs: txn.amount,
        detectedAt: now,
      });
    } else {
      seen.set(key, txn);
    }
  }

  // -- 2. Unusual large transaction -------------------------------------------
  if (averageMonthlySpend && averageMonthlySpend > 0) {
    const threshold = averageMonthlySpend * 3; // 3x monthly average
    for (const txn of transactions) {
      if (txn.amount > threshold && txn.type === 'expense') {
        flags.push({
          flagId: `UNUSUAL-LARGE-${txn.id}`,
          riskCategory: 'unusual_spending',
          riskLevel: txn.amount > threshold * 3 ? 'HIGH_RISK' : 'REVIEW',
          title: 'Unusual Large Expense',
          explanation: `This expense of Rs ${txn.amount} is ${(txn.amount / averageMonthlySpend).toFixed(1)}x your average monthly spending. Unusual expenses may indicate a one-time event, an error, or require documentation.`,
          observation: `Rs ${txn.amount} on "${txn.description}" (${txn.date}). Average monthly spend: Rs ${averageMonthlySpend}.`,
          recommendedAction: 'Verify this expense is correctly recorded. If it is a large one-time expense, attach supporting documentation (invoice, receipt).',
          relatedEntityType: 'transaction',
          relatedEntityId: txn.id,
          amountInRs: txn.amount,
          detectedAt: now,
        });
      }
    }
  }

  // -- 3. Large cash transaction ----------------------------------------------
  for (const txn of transactions) {
    if (txn.isCash && txn.amount >= 200000) {
      flags.push({
        flagId: `CASH-269ST-${txn.id}`,
        riskCategory: 'large_cash',
        riskLevel: 'HIGH_RISK',
        title: 'Cash Transaction Exceeds Section 269ST Limit',
        explanation: `A cash receipt or payment of Rs ${txn.amount} was recorded. Section 269ST prohibits cash receipts of Rs 2,00,000 or more. This is a potential legal violation.`,
        observation: `Cash transaction of Rs ${txn.amount} on ${txn.date}: "${txn.description}"`,
        recommendedAction: 'If this was a genuine cash receipt of Rs 2,00,000+, consult a tax advisor immediately. If this is a recording error (the actual payment was digital), correct the transaction payment mode.',
        regulatoryContext: 'Section 269ST of Income Tax Act 1961: penalty is 100% of the amount received in violation.',
        relatedEntityType: 'transaction',
        relatedEntityId: txn.id,
        amountInRs: txn.amount,
        detectedAt: now,
      });
    } else if (txn.isCash && txn.amount >= 50000) {
      flags.push({
        flagId: `CASH-LARGE-${txn.id}`,
        riskCategory: 'large_cash',
        riskLevel: 'REVIEW',
        title: 'Large Cash Transaction — Documentation Required',
        explanation: `A cash transaction of Rs ${txn.amount} was recorded. PAN may be required for cash transactions above Rs 50,000 at financial institutions.`,
        observation: `Cash transaction of Rs ${txn.amount} on ${txn.date}`,
        recommendedAction: 'Ensure PAN was provided if required. Retain receipt for audit trail.',
        regulatoryContext: 'Section 139A of Income Tax Act — PAN required for specified cash transactions.',
        relatedEntityType: 'transaction',
        relatedEntityId: txn.id,
        amountInRs: txn.amount,
        detectedAt: now,
      });
    }
  }

  // -- 4. Account purpose mismatch --------------------------------------------
  if (accountPurposeId === 'current-business') {
    const personalPatterns = ['amazon', 'swiggy', 'zomato', 'netflix', 'hot star', 'ott', 'cinema', 'restaurant', 'dinner'];
    for (const txn of transactions) {
      const descLower = txn.description?.toLowerCase() ?? '';
      if (personalPatterns.some(p => descLower.includes(p)) && txn.type === 'expense') {
        flags.push({
          flagId: `PURPOSE-MISMATCH-${txn.id}`,
          riskCategory: 'account_purpose_mismatch',
          riskLevel: 'REVIEW',
          title: 'Possible Personal Expense in Business Account',
          explanation: `Transaction "${txn.description}" for Rs ${txn.amount} appears to be a personal expense in a business current account. Mixing personal and business expenses can cause tax and audit complications.`,
          observation: `"${txn.description}" on ${txn.date} in a business account.`,
          recommendedAction: 'If this is a personal expense, record it as a drawing (owner withdrawal) or reclassify to a personal account. Do not claim personal expenses as business expenses.',
          regulatoryContext: 'Section 37(1): Only expenses incurred wholly and exclusively for business are deductible.',
          relatedEntityType: 'transaction',
          relatedEntityId: txn.id,
          amountInRs: txn.amount,
          detectedAt: now,
        });
      }
    }
  }

  // -- 5. Unexplained large credit --------------------------------------------
  for (const txn of transactions) {
    if (txn.type === 'income' && txn.amount >= 100000 && !txn.notes && !txn.counterpartyId) {
      flags.push({
        flagId: `UNEXPLAINED-CREDIT-${txn.id}`,
        riskCategory: 'unexplained_credit',
        riskLevel: 'REVIEW',
        title: 'Large Credit Without Documentation',
        explanation: `A credit of Rs ${txn.amount} was recorded without a counterparty or notes. Large unexplained credits can be treated as income under Section 68 if the source cannot be explained.`,
        observation: `Income of Rs ${txn.amount} on ${txn.date}: "${txn.description}" — no counterparty or notes.`,
        recommendedAction: 'Add notes explaining the source (salary, business income, gift, loan, asset sale, transfer from own account, etc.). Attach documentation.',
        regulatoryContext: 'Section 68 of Income Tax Act: Unexplained credits are taxable as income.',
        relatedEntityType: 'transaction',
        relatedEntityId: txn.id,
        amountInRs: txn.amount,
        detectedAt: now,
      });
    }
  }

  return flags;
}

/**
 * Evaluate approaching financial limits.
 */
export function evaluateApproachingLimits(params: {
  cashDepositsYTD: Decimal;
  cashDepositsAccountType: 'savings' | 'current';
  interestIncomeYTD: Decimal;
  ltcgEquityYTD: Decimal;
}): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const now = new Date().toISOString();

  // Cash deposit SFT threshold
  const sftThreshold = params.cashDepositsAccountType === 'current' ? 5000000 : 1000000;
  const cashRatio = params.cashDepositsYTD.div(sftThreshold).toNumber();

  if (cashRatio >= 0.75) {
    flags.push({
      flagId: 'APPROACHING-SFT-CASH',
      riskCategory: 'approaching_limit',
      riskLevel: cashRatio >= 0.9 ? 'HIGH_RISK' : 'REVIEW',
      title: `Approaching SFT Cash Deposit Threshold (${(cashRatio * 100).toFixed(0)}%)`,
      explanation: `Cash deposits of Rs ${params.cashDepositsYTD.toFixed(0)} are at ${(cashRatio * 100).toFixed(0)}% of the Rs ${(sftThreshold / 100000).toFixed(0)}L SFT reporting threshold. Once crossed, the bank must report to the Income Tax Department.`,
      observation: `Year-to-date cash deposits: Rs ${params.cashDepositsYTD.toFixed(0)} / Rs ${(sftThreshold / 100000).toFixed(0)}L`,
      recommendedAction: 'Ensure all cash deposit sources are documented (salary withdrawal, business receipts, savings, gifts with deed). SFT reporting is not a problem if income is properly declared.',
      regulatoryContext: 'Rule 114E of Income Tax Rules — SFT-005 reporting by banks.',
      amountInRs: params.cashDepositsYTD.toNumber(),
      detectedAt: now,
    });
  }

  // Interest income TDS threshold
  if (params.interestIncomeYTD.gte(30000)) {
    const tdsThreshold = new Decimal(40000);
    const ratio = params.interestIncomeYTD.div(tdsThreshold).toNumber();
    if (ratio >= 0.75) {
      flags.push({
        flagId: 'APPROACHING-INTEREST-TDS',
        riskCategory: 'approaching_limit',
        riskLevel: ratio >= 1 ? 'REVIEW' : 'NORMAL',
        title: `Interest Income Approaching TDS Threshold (${(ratio * 100).toFixed(0)}%)`,
        explanation: `Interest income of Rs ${params.interestIncomeYTD.toFixed(0)} is approaching the Rs 40,000 TDS threshold (Section 194A). Above this, the bank will deduct TDS at 10%.`,
        observation: `YTD interest income: Rs ${params.interestIncomeYTD.toFixed(0)} / Rs 40,000 threshold`,
        recommendedAction: 'If your total income is below the taxable limit, submit Form 15G to your bank to avoid TDS deduction.',
        regulatoryContext: 'Section 194A of Income Tax Act — TDS on interest.',
        amountInRs: params.interestIncomeYTD.toNumber(),
        detectedAt: now,
      });
    }
  }

  // LTCG exemption limit
  if (params.ltcgEquityYTD.gte(100000)) {
    const exemption = new Decimal(125000);
    const ratio = params.ltcgEquityYTD.div(exemption).toNumber();
    if (ratio >= 0.8) {
      flags.push({
        flagId: 'APPROACHING-LTCG-EXEMPTION',
        riskCategory: 'tax_risk',
        riskLevel: ratio >= 1 ? 'REVIEW' : 'NORMAL',
        title: `LTCG Approaching Rs 1.25L Exemption Limit (${(ratio * 100).toFixed(0)}%)`,
        explanation: `Realized LTCG on equity of Rs ${params.ltcgEquityYTD.toFixed(0)} is approaching the Rs 1,25,000 annual exemption. Gains above this are taxed at 12.5% under Section 112A.`,
        observation: `YTD LTCG: Rs ${params.ltcgEquityYTD.toFixed(0)} / Rs 1,25,000 exemption`,
        recommendedAction: 'If you plan more equity sales, consider timing them for the next financial year. Consider tax-loss harvesting to offset gains.',
        regulatoryContext: 'Section 112A of Income Tax Act — LTCG on equity.',
        amountInRs: params.ltcgEquityYTD.toNumber(),
        detectedAt: now,
      });
    }
  }

  return flags;
}

/**
 * Aggregate risk level across multiple flags.
 */
export function aggregateRiskLevel(flags: RiskFlag[]): RiskLevel {
  if (flags.some(f => f.riskLevel === 'HIGH_RISK')) return 'HIGH_RISK';
  if (flags.some(f => f.riskLevel === 'REVIEW')) return 'REVIEW';
  return 'NORMAL';
}
