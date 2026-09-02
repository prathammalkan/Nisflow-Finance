/**
 * NISFLOW FINANCE Ã¢â‚¬â€ TRANSACTION GUARD
 *
 * Pre-transaction evaluation layer.
 * Before recording any financially material transaction, evaluate:
 *   - source account
 *   - destination
 *   - account purpose
 *   - economic purpose
 *   - transaction type
 *   - accounting classification
 *   - tax classification
 *   - documentation
 *   - bank/payment channel
 *   - risk
 *
 * Ambiguous transactions MUST trigger clarification Ã¢â‚¬â€ never be auto-classified.
 *
 * Examples of ambiguous transactions that require clarification:
 *   "Papa gave me Rs 50,000" Ã¢â‚¬â€ gift? loan? return of earlier amount?
 *   "Rahul sent Rs 80,000" Ã¢â‚¬â€ loan repayment? gift? expense reimbursement?
 *   "I paid Rs 50,000 to BOB" Ã¢â‚¬â€ loan EMI? bill payment? transfer?
 *   "I invested Rs 1 lakh" Ã¢â‚¬â€ which account? which asset? buy or transfer?
 *
 * @module transaction-guard
 */

import type { RiskLevel } from './financial-risk-monitor.ts';

// --- Types --------------------------------------------------------------------

export type TransactionIntent =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'gift_received'
  | 'gift_given'
  | 'loan_received'
  | 'loan_given'
  | 'loan_repayment_received'
  | 'loan_repayment_made'
  | 'investment_purchase'
  | 'investment_sale'
  | 'salary'
  | 'business_income'
  | 'opening_balance'
  | 'AMBIGUOUS';

export type AccountingClassification =
  | 'asset_increase'
  | 'asset_decrease'
  | 'liability_increase'
  | 'liability_decrease'
  | 'income'
  | 'expense'
  | 'equity'
  | 'UNCLEAR';

export type TaxTreatment =
  | 'taxable_income'
  | 'exempt_income'
  | 'capital_gain'
  | 'gift_from_relative'
  | 'gift_from_non_relative_possibly_taxable'
  | 'loan_not_taxable'
  | 'expense_deductible'
  | 'expense_not_deductible'
  | 'asset_transfer_not_taxable'
  | 'UNCLEAR';

export interface ClarificationQuestion {
  questionId: string;
  question: string;
  options?: string[];
  required: boolean;
  explanation: string;
}

export interface TransactionGuardResult {
  /** True if the transaction can proceed without clarification */
  canProceed: boolean;
  /** Detected intent (AMBIGUOUS if unclear) */
  detectedIntent: TransactionIntent;
  /** Accounting classification */
  accountingClassification: AccountingClassification;
  /** Tax treatment */
  taxTreatment: TaxTreatment;
  /** Risk level for this transaction */
  riskLevel: RiskLevel;
  /** Risk explanation */
  riskExplanation?: string;
  /** Clarification questions if ambiguous */
  clarificationRequired: ClarificationQuestion[];
  /** Warnings even if allowed to proceed */
  warnings: string[];
  /** Documentation the user should attach */
  documentationRecommended: string[];
  /** Why the guard reached this conclusion */
  reasoning: string;
}

// --- Ambiguity Detection Patterns ---------------------------------------------

interface AmbiguityPattern {
  pattern: RegExp;
  possibleIntents: TransactionIntent[];
  requiredClarifications: string[];
}

const AMBIGUITY_PATTERNS: AmbiguityPattern[] = [
  {
    pattern: /gave|given|sent|received|transferred/i,
    possibleIntents: ['gift_received', 'loan_received', 'loan_repayment_received', 'income'],
    requiredClarifications: ['Is this a gift, a loan, a loan repayment, or income for services?'],
  },
  {
    pattern: /papa|mom|father|mother|parent|brother|sister|sibling|spouse|wife|husband/i,
    possibleIntents: ['gift_received', 'loan_received'],
    requiredClarifications: [
      'Is this a gift (no repayment expected) or a loan (to be repaid)?',
      'Gifts from close relatives are tax-exempt; loans are not income.',
    ],
  },
  {
    pattern: /invested|invest/i,
    possibleIntents: ['investment_purchase', 'transfer'],
    requiredClarifications: [
      'Which investment account / broker account?',
      'What asset did you buy (stocks, mutual fund, FD, gold, other)?',
      'From which bank account was the funding done?',
    ],
  },
  {
    pattern: /paid to|payment to/i,
    possibleIntents: ['expense', 'loan_repayment_made', 'transfer'],
    requiredClarifications: [
      'What was this payment for? (Loan EMI, bill, purchase, or transfer to own account?)',
    ],
  },
];

// --- Core Guard Function ------------------------------------------------------

export interface TransactionGuardInput {
  description: string;
  amount: number;
  accountId?: string;
  accountType?: string;
  accountPurposeId?: string;
  counterpartyName?: string;
  /** User-provided intent if already stated */
  userStatedType?: string;
  isCash?: boolean;
  date?: string;
}

export function evaluateTransactionGuard(input: TransactionGuardInput): TransactionGuardResult {
  const clarificationRequired: ClarificationQuestion[] = [];
  const warnings: string[] = [];
  const documentationRecommended: string[] = [];
  let detectedIntent: TransactionIntent = 'AMBIGUOUS';
  let accountingClassification: AccountingClassification = 'UNCLEAR';
  let taxTreatment: TaxTreatment = 'UNCLEAR';
  let riskLevel: RiskLevel = 'NORMAL';
  let riskExplanation: string | undefined;
  let reasoning = '';

  const desc = input.description?.toLowerCase() ?? '';
  const amount = input.amount;

  // -- Step 1: Check if user explicitly stated intent --------------------------
  if (input.userStatedType) {
    const statedLower = input.userStatedType.toLowerCase();
    if (['expense', 'income', 'transfer'].includes(statedLower)) {
      detectedIntent = statedLower as TransactionIntent;
      reasoning = `User explicitly stated transaction type: ${statedLower}.`;
    }
  }

  // -- Step 2: Detect ambiguity patterns -------------------------------------
  if (detectedIntent === 'AMBIGUOUS') {
    for (const pattern of AMBIGUITY_PATTERNS) {
      if (pattern.pattern.test(desc) || pattern.pattern.test(input.counterpartyName ?? '')) {
        for (let i = 0; i < pattern.requiredClarifications.length; i++) {
          clarificationRequired.push({
            questionId: `AMB-${pattern.pattern.source.slice(0, 10)}-${i}`,
            question: pattern.requiredClarifications[i],
            required: true,
            explanation: `This is needed to correctly classify the transaction for accounting and tax purposes.`,
          });
        }
        reasoning = `Ambiguity detected: description matches pattern "${pattern.pattern.source}". Possible intents: ${pattern.possibleIntents.join(', ')}.`;
        detectedIntent = 'AMBIGUOUS';
        break;
      }
    }
  }

  // -- Step 3: Cash compliance checks -----------------------------------------
  if (input.isCash) {
    if (amount >= 200000) {
      riskLevel = 'HIGH_RISK';
      riskExplanation = `Cash transaction of Rs ${amount.toLocaleString('en-IN')} violates Section 269ST (Rs 2,00,000 limit). Penalty = 100% of amount.`;
      warnings.push('LEGAL WARNING: Section 269ST prohibits cash receipts/payments of Rs 2,00,000 or more. This transaction as recorded may be illegal.');
    } else if (amount >= 50000) {
      riskLevel = 'REVIEW';
      warnings.push('PAN may be required for cash transactions above Rs 50,000 at financial institutions.');
    }
  }

  // -- Step 4: Large transaction documentation --------------------------------
  if (amount >= 100000) {
    documentationRecommended.push('Invoice, receipt, or agreement for large transaction');
    if (amount >= 200000) {
      documentationRecommended.push('Purpose statement if queried by Income Tax (Section 68 Ã¢â‚¬â€ unexplained credits)');
    }
  }

  // -- Step 5: Classify known intents ----------------------------------------
  if (detectedIntent !== 'AMBIGUOUS') {
    switch (detectedIntent) {
      case 'expense':
        accountingClassification = 'expense';
        taxTreatment = 'expense_deductible'; // assume; warn if personal
        break;
      case 'income':
        accountingClassification = 'income';
        taxTreatment = 'taxable_income';
        warnings.push('Ensure this income is declared in your Income Tax Return under the correct head.');
        break;
      case 'transfer':
        accountingClassification = 'asset_decrease'; // source account
        taxTreatment = 'asset_transfer_not_taxable';
        break;
      case 'gift_received':
        accountingClassification = 'income'; // or equity if from relative
        taxTreatment = 'gift_from_non_relative_possibly_taxable';
        clarificationRequired.push({
          questionId: 'GIFT-RELATIVE-CHECK',
          question: 'Is the person who gave you this gift a "specified relative" (spouse, parent, sibling, child)?',
          options: ['Yes Ã¢â‚¬â€ close relative', 'No Ã¢â‚¬â€ friend/colleague/other'],
          required: true,
          explanation: 'Gifts from specified relatives are fully tax-exempt. Gifts > Rs 50,000 from non-relatives in a year are taxable as "Income from Other Sources" under Section 56(2)(x).',
        });
        documentationRecommended.push('Gift deed or written acknowledgment from donor');
        break;
      case 'loan_received':
        accountingClassification = 'liability_increase';
        taxTreatment = 'loan_not_taxable';
        documentationRecommended.push('Loan agreement', 'Repayment schedule');
        warnings.push('A loan is NOT income. Record it as a liability, not income, to avoid tax complications.');
        break;
      case 'loan_repayment_received':
        accountingClassification = 'asset_decrease'; // receivable reduces
        taxTreatment = 'asset_transfer_not_taxable';
        break;
      case 'investment_purchase':
        accountingClassification = 'asset_increase';
        taxTreatment = 'asset_transfer_not_taxable';
        documentationRecommended.push('Broker contract note', 'Mutual fund statement');
        break;
      default:
        accountingClassification = 'UNCLEAR';
        taxTreatment = 'UNCLEAR';
    }
  }

  // -- Step 6: Account purpose mismatch warning --------------------------------
  if (input.accountPurposeId === 'current-business' && detectedIntent === 'expense') {
    warnings.push('Business account: ensure this expense has a business purpose. Personal expenses are not deductible under Section 37(1).');
    documentationRecommended.push('Business invoice or vendor receipt');
  }

  const canProceed = clarificationRequired.filter(q => q.required).length === 0;

  return {
    canProceed,
    detectedIntent,
    accountingClassification,
    taxTreatment,
    riskLevel,
    riskExplanation,
    clarificationRequired,
    warnings,
    documentationRecommended,
    reasoning: reasoning || (canProceed ? 'Transaction intent is clear and can proceed.' : 'Ambiguity detected Ã¢â‚¬â€ clarification required before recording.'),
  };
}

/**
 * Quick check if a description/amount combination is ambiguous.
 */
export function isAmbiguous(description: string, counterpartyName?: string): boolean {
  return AMBIGUITY_PATTERNS.some(
    p => p.pattern.test(description?.toLowerCase() ?? '') || p.pattern.test(counterpartyName?.toLowerCase() ?? '')
  );
}

/**
 * Get the clarification questions for an ambiguous transaction.
 */
export function getAmbiguityClarifications(description: string): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];
  for (const pattern of AMBIGUITY_PATTERNS) {
    if (pattern.pattern.test(description?.toLowerCase() ?? '')) {
      pattern.requiredClarifications.forEach((q, i) => {
        questions.push({
          questionId: `AMB-${pattern.pattern.source.slice(0, 8)}-${i}`,
          question: q,
          required: true,
          explanation: 'Required for correct accounting and tax classification.',
        });
      });
    }
  }
  return questions;
}
