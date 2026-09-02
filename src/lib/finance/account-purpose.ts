/**
 * NISFLOW FINANCE â€” ACCOUNT PURPOSE ADVISOR
 *
 * Formal account-purpose intelligence layer. Separates:
 *   - bank product type (savings, current, credit card, FD, etc.)
 *   - account purpose (salary account, emergency fund, business, etc.)
 *   - accounting classification (asset, liability, equity, income, expense)
 *   - tax classification (interest income, business expense, capital asset, etc.)
 *
 * Every account purpose definition contains:
 *   PURPOSE, USE WHEN, USE WITH CAUTION, DO NOT USE FOR,
 *   EXPECTED TRANSACTIONS, DOCUMENTATION, TAX CONSIDERATIONS,
 *   AUDIT CONSIDERATIONS, AI GUIDANCE
 *
 * @module account-purpose
 */

import type { AccountProduct } from './bank-registry.ts';

export type AccountingClassification =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense';

export type TaxClassification =
  | 'savings_interest'
  | 'salary_income'
  | 'business_income'
  | 'capital_asset'
  | 'liability'
  | 'investment_asset'
  | 'loan_liability'
  | 'credit_facility'
  | 'not_directly_taxable';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface AccountPurposeDefinition {
  purposeId: string;
  purposeName: string;
  /** The bank product type this purpose maps to */
  bankProductType: AccountProduct;
  /** Accounting classification in the double-entry ledger */
  accountingClassification: AccountingClassification;
  /** Tax classification for income/deduction determination */
  taxClassification: TaxClassification;
  /** Primary description */
  purpose: string;
  /** When to use this type of account */
  useWhen: string[];
  /** When to proceed carefully */
  useWithCaution: string[];
  /** What this account should NOT be used for */
  doNotUseFor: string[];
  /** Expected transaction types */
  expectedTransactions: string[];
  /** Documentation to retain */
  documentation: string[];
  /** Tax considerations */
  taxConsiderations: string[];
  /** Audit considerations */
  auditConsiderations: string[];
  /** AI guidance for ambiguous transaction classification */
  aiGuidance: string;
  /** Risk level if misused */
  misusedRiskLevel: RiskLevel;
}

// --- Purpose Definitions ------------------------------------------------------

export const ACCOUNT_PURPOSES: AccountPurposeDefinition[] = [
  {
    purposeId: 'savings-general',
    purposeName: 'General Savings Account',
    bankProductType: 'savings',
    accountingClassification: 'asset',
    taxClassification: 'savings_interest',
    purpose: 'A bank account for everyday transactions and accumulating personal savings.',
    useWhen: [
      'Receiving salary or periodic income',
      'Paying everyday expenses via UPI, debit card, or NEFT',
      'Maintaining an emergency fund',
      'Small regular savings before moving to FD/RD',
    ],
    useWithCaution: [
      'Using for business income/expenses (prefer current account for business)',
      'Very large cash deposits (may trigger SFT reporting)',
      'Frequent large round-figure credits from unclear sources',
    ],
    doNotUseFor: [
      'Running a business without proper accounting separation',
      'Parking undisclosed income',
      'Routing cash to avoid detection',
      'Receiving funds from unverified or unknown counterparties without documentation',
    ],
    expectedTransactions: [
      'Salary credits',
      'UPI payments to merchants/individuals',
      'EMI debits',
      'Utility payments',
      'ATM cash withdrawals',
      'FD/RD investments',
      'Small personal transfers',
    ],
    documentation: [
      'Bank statements (monthly/quarterly)',
      'Form 16A (TDS on interest if applicable)',
      'Salary slips for incoming credits',
      'Receipts for major expenses',
    ],
    taxConsiderations: [
      'Interest income taxable under "Income from Other Sources"',
      'Section 80TTA: Deduction up to Rs 10,000 on savings interest (Old Regime)',
      'TDS at 10% if interest > Rs 40,000/year per bank (Rs 50,000 for senior citizens)',
      'Cash deposits > Rs 10,00,000/FY reported under SFT',
      'Large unexplained credits may be treated as income under Section 68',
    ],
    auditConsiderations: [
      'All large credits should be explainable with documentation',
      'Salary credits should match Form 16 CTC',
      'Interest income should appear in AIS/Form 26AS',
      'Cash deposits above SFT threshold appear in AIS',
    ],
    aiGuidance:
      'When a transaction is unclear, ask: Is this personal income, a gift, a loan repayment, or a transfer? Each has different tax and accounting treatment. Do not assume a credit is income without confirmation.',
    misusedRiskLevel: 'high',
  },
  {
    purposeId: 'salary-account',
    purposeName: 'Salary Account',
    bankProductType: 'salary',
    accountingClassification: 'asset',
    taxClassification: 'salary_income',
    purpose: 'A zero-balance savings account opened by an employer for salary disbursement.',
    useWhen: [
      'Receiving monthly employer salary',
      'Employer-mandated primary account for payroll',
    ],
    useWithCaution: [
      'Receiving large non-salary credits (may cause classification confusion)',
      'Using for business transactions without proper accounting separation',
    ],
    doNotUseFor: [
      'Business income routing',
      'Undisclosed income deposits',
    ],
    expectedTransactions: [
      'Monthly salary credit',
      'EMI debits',
      'UPI payments',
      'Tax deductions by employer',
    ],
    documentation: [
      'Monthly salary slips',
      'Form 16 (annual)',
      'Bank statements',
    ],
    taxConsiderations: [
      'Salary income is the primary income under "Salaries"',
      'TDS deducted by employer under Section 192',
      'Cross-verify with Form 16 Part A and Form 26AS',
    ],
    auditConsiderations: [
      'Non-salary credits should be clearly documented',
      'Form 16 must match bank salary credits',
    ],
    aiGuidance:
      'If a credit appears in a salary account that is not from the employer, explicitly ask the user to classify it as: salary, freelance income, gift, loan, transfer, or other. Do not assume it is salary.',
    misusedRiskLevel: 'medium',
  },
  {
    purposeId: 'current-business',
    purposeName: 'Current / Business Account',
    bankProductType: 'current',
    accountingClassification: 'asset',
    taxClassification: 'business_income',
    purpose: 'A non-interest-bearing account for business transactions with higher transaction limits.',
    useWhen: [
      'Running a business, shop, or professional practice',
      'Receiving business payments from clients/customers',
      'Paying business vendors and suppliers',
      'GST-registered businesses requiring GST-linked account',
    ],
    useWithCaution: [
      'Personal transactions through business account (creates audit and tax complications)',
      'Cash withdrawals without business purpose documentation',
    ],
    doNotUseFor: [
      'Personal savings or salary',
      'Routing personal gifts or loans through business account',
    ],
    expectedTransactions: [
      'Client invoice payments',
      'Vendor payments',
      'GST payments',
      'Payroll debits',
      'Loan EMI from business loans',
      'Utility and rent payments for business premises',
    ],
    documentation: [
      'Bank statements',
      'GST returns',
      'Invoices',
      'Vendor receipts',
      'Business contracts',
    ],
    taxConsiderations: [
      'Income from business is taxable under "Profits and Gains of Business or Profession"',
      'Cash deposits > Rs 50,00,000/FY reported under SFT (current account)',
      'GST input credit claims require corresponding bank payment proof',
      'Business expenses require receipts for deduction',
      'Audit mandatory if turnover > Rs 1 crore (Rs 2 crore for presumptive)',
    ],
    auditConsiderations: [
      'All business credits must have corresponding invoices',
      'Unexplained credits can be treated as business income (Section 68)',
      'Cash transactions > Rs 2,00,000 in single transaction â€” not deductible as expense (Section 40A(3))',
    ],
    aiGuidance:
      'For current accounts, every credit must be traced to a business purpose (invoice, sale, loan, capital introduction). Every debit must have a business purpose (expense, vendor, salary). Personal mixing is a red flag.',
    misusedRiskLevel: 'high',
  },
  {
    purposeId: 'cash-wallet',
    purposeName: 'Cash / Petty Cash',
    bankProductType: 'cash',
    accountingClassification: 'asset',
    taxClassification: 'not_directly_taxable',
    purpose: 'Physical cash on hand for small everyday transactions.',
    useWhen: [
      'Small daily purchases where digital payment is not available',
      'Petty cash for household expenses',
      'Tips, donations, small market purchases',
    ],
    useWithCaution: [
      'Large cash transactions (record clearly)',
      'Cash received from unknown sources',
    ],
    doNotUseFor: [
      'Large purchases over Rs 2,00,000 in cash (not deductible as business expense, cash acceptance prohibited for businesses)',
      'Routing undisclosed income',
    ],
    expectedTransactions: [
      'ATM withdrawals (funding)',
      'Small cash payments',
      'Small cash receipts',
    ],
    documentation: [
      'Receipts for cash purchases',
      'ATM withdrawal slips (correlate with bank statement)',
    ],
    taxConsiderations: [
      'Cash payments > Rs 2,00,000 per transaction disallowed as business expense (Section 40A(3))',
      'Cash receipts > Rs 2,00,000 per transaction restricted under Section 269ST',
      'Unexplained cash holdings can be treated as income',
    ],
    auditConsiderations: [
      'Keep a petty cash book if used for business',
      'Reconcile cash balance regularly',
    ],
    aiGuidance:
      'If cash transactions involve large amounts, warn the user about Section 269ST limits and documentation requirements. Ask for source of cash if unclear.',
    misusedRiskLevel: 'high',
  },
  {
    purposeId: 'credit-card',
    purposeName: 'Credit Card Account',
    bankProductType: 'credit_card',
    accountingClassification: 'liability',
    taxClassification: 'credit_facility',
    purpose: 'A revolving credit facility for purchases repaid monthly.',
    useWhen: [
      'Large purchases where you can repay in full before due date',
      'Online purchases with purchase protection',
      'Reward/cashback-earning transactions',
      'Emergency purchases',
    ],
    useWithCaution: [
      'Carrying a balance (high interest rates â€” 36-42% pa typically)',
      'Using for cash advances (high fees and interest)',
      'EMI conversions (lock-in and interest costs)',
    ],
    doNotUseFor: [
      'Regular expenses you cannot pay back in full',
      'Business expenses without separate business card',
    ],
    expectedTransactions: [
      'Purchase debits',
      'Monthly bill payment credit',
      'Reward credits',
      'Interest charges (if balance carried)',
    ],
    documentation: [
      'Monthly credit card statements',
      'Purchase receipts for large items',
      'EMI repayment schedules',
    ],
    taxConsiderations: [
      'Credit card interest is not deductible for personal use',
      'Business purchases on credit card are deductible with receipts',
      'Reward cashback may be taxable as income in some interpretations',
    ],
    auditConsiderations: [
      'High credit card spend relative to income may flag lifestyle discrepancy',
      'Business credit card expenses require corresponding business purpose',
    ],
    aiGuidance:
      'Credit card account is a liability. A payment to the credit card reduces the liability â€” it is NOT an expense. The expense occurred when you swiped the card. Distinguish between credit card payment and credit card purchase.',
    misusedRiskLevel: 'medium',
  },
  {
    purposeId: 'fixed-deposit',
    purposeName: 'Fixed Deposit (FD)',
    bankProductType: 'fixed_deposit',
    accountingClassification: 'asset',
    taxClassification: 'savings_interest',
    purpose: 'A term deposit earning fixed interest for a defined period.',
    useWhen: [
      'Parking surplus funds for guaranteed returns',
      'Tax-saving FDs (5-year lock-in) under Section 80C',
      'Building an emergency fund',
      'Meeting a known future financial obligation',
    ],
    useWithCaution: [
      'Premature withdrawal (penalty charges)',
      'Overlooking TDS on interest',
    ],
    doNotUseFor: [
      'Emergency liquidity (funds are locked)',
      'Short-term market speculation',
    ],
    expectedTransactions: [
      'Initial deposit (asset purchase â€” not an expense)',
      'Interest credit (income)',
      'TDS deduction by bank',
      'Maturity proceeds',
    ],
    documentation: [
      'FD receipt/certificate',
      'Form 16A (TDS certificate)',
      'Renewal receipts',
    ],
    taxConsiderations: [
      'Interest taxable on accrual basis (not just on receipt) â€” income must be declared each FY',
      'TDS at 10% if interest > Rs 40,000/year per bank (Rs 50,000 for senior citizens)',
      'Tax-saving FD: Section 80C deduction for 5-year lock-in FD',
      'Premature withdrawal may affect tax-saving FD deduction claimed',
    ],
    auditConsiderations: [
      'FD interest must appear in annual IT return even if TDS was deducted',
      'FD maturity proceeds are not income â€” only interest portion is',
    ],
    aiGuidance:
      'Creating an FD is an asset transfer (cash ? FD asset), not an expense. FD maturity is another asset transfer. Only the interest earned is income. Clarify this accounting treatment before recording.',
    misusedRiskLevel: 'low',
  },
  {
    purposeId: 'recurring-deposit',
    purposeName: 'Recurring Deposit (RD)',
    bankProductType: 'recurring_deposit',
    accountingClassification: 'asset',
    taxClassification: 'savings_interest',
    purpose: 'A monthly savings deposit earning fixed interest for disciplined savings.',
    useWhen: [
      'Building a corpus through monthly systematic savings',
      'Saving for a specific goal with a fixed timeline',
    ],
    useWithCaution: [
      'Missing monthly installments (may result in penalty or reduced interest)',
    ],
    doNotUseFor: [
      'Emergency fund (locked until maturity)',
    ],
    expectedTransactions: [
      'Monthly installment debit',
      'Interest credit on maturity',
      'Maturity proceeds credit',
    ],
    documentation: [
      'RD passbook / statement',
      'Form 16A (TDS on interest if applicable)',
    ],
    taxConsiderations: [
      'Interest taxable on accrual basis each FY',
      'TDS applies if cumulative interest > Rs 40,000/year',
    ],
    auditConsiderations: [
      'RD interest must be declared annually even before maturity',
    ],
    aiGuidance:
      'RD installment is an asset transfer (savings ? RD), not an expense. Maturity proceeds include principal + interest. Only interest is income.',
    misusedRiskLevel: 'low',
  },
  {
    purposeId: 'demat-investment',
    purposeName: 'Demat / Investment Account',
    bankProductType: 'demat',
    accountingClassification: 'asset',
    taxClassification: 'investment_asset',
    purpose: 'An account holding securities (equity, mutual funds, bonds, ETFs) for investment.',
    useWhen: [
      'Buying/selling equities, mutual funds, ETFs, bonds',
      'Applying for IPOs',
      'Long-term wealth creation',
    ],
    useWithCaution: [
      'Short-term trading (high tax implications â€” STCG at 15% for equity)',
      'Intraday trading (speculative income treatment)',
    ],
    doNotUseFor: [
      'Personal spending',
      'Business expenses',
    ],
    expectedTransactions: [
      'Investment purchase (asset increase)',
      'Investment sale (asset decrease)',
      'Dividend income',
      'Capital gain/loss on sale',
    ],
    documentation: [
      'Demat account statement (annual)',
      'Broker contract notes for each trade',
      'Dividend statements',
      'Capital gains statement from broker',
    ],
    taxConsiderations: [
      'LTCG on equity > Rs 1,25,000/year: 12.5% (FY 2024-25 onwards)',
      'STCG on equity: 20% (FY 2024-25 onwards)',
      'LTCG on debt funds: 20% with indexation (pre-April 2023 purchases only; after: slab rate)',
      'Dividend taxable in investors hands at slab rate',
      'STT paid on exchange transactions',
    ],
    auditConsiderations: [
      'Capital gains must be reported in ITR with buy/sell details',
      'AIS reflects securities transactions via SFT',
      'Intraday and F&O treated as business income',
    ],
    aiGuidance:
      'Buying an investment is not an expense. Selling an investment is not income â€” only the gain/loss is. Track cost basis carefully. Distinguish long-term vs short-term holding periods for tax purposes.',
    misusedRiskLevel: 'medium',
  },
  {
    purposeId: 'loan-liability',
    purposeName: 'Loan Account',
    bankProductType: 'loan',
    accountingClassification: 'liability',
    taxClassification: 'loan_liability',
    purpose: 'A borrowing account representing principal owed to a lender.',
    useWhen: [
      'Tracking a home loan, personal loan, vehicle loan, or education loan',
      'Recording EMI payments',
    ],
    useWithCaution: [
      'EMI split between principal and interest must be correctly accounted',
      'Pre-payment or foreclosure charges',
    ],
    doNotUseFor: [
      'Treating loan disbursement as income',
      'Confusing principal repayment with interest expense',
    ],
    expectedTransactions: [
      'Loan disbursement (increases liability)',
      'EMI payment (reduces principal + records interest expense)',
      'Pre-payment',
      'Foreclosure',
    ],
    documentation: [
      'Loan sanction letter',
      'Disbursement advice',
      'EMI schedule',
      'Annual interest certificate from lender',
    ],
    taxConsiderations: [
      'Home loan interest: Section 24(b) deduction up to Rs 2,00,000 (self-occupied)',
      'Home loan principal: Section 80C deduction',
      'Education loan interest: Section 80E deduction',
      'Personal loan interest: not deductible for personal use',
      'Loan disbursement is NOT income â€” it must not be reported as income',
    ],
    auditConsiderations: [
      'Annual interest certificate needed for IT deduction claims',
      'Loan account statement for EMI reconciliation',
    ],
    aiGuidance:
      'A loan is a liability. Receiving loan money increases your bank asset AND your loan liability equally â€” net worth does not change. EMI principal reduces liability; interest is an expense. Never treat a loan disbursement as income.',
    misusedRiskLevel: 'high',
  },
];

// --- Helpers ------------------------------------------------------------------

/**
 * Get the account purpose definition by purpose ID.
 */
export function getAccountPurpose(purposeId: string): AccountPurposeDefinition | null {
  return ACCOUNT_PURPOSES.find(p => p.purposeId === purposeId) ?? null;
}

/**
 * Get all account purposes for a given bank product type.
 */
export function getPurposesForProduct(bankProductType: AccountProduct): AccountPurposeDefinition[] {
  return ACCOUNT_PURPOSES.filter(p => p.bankProductType === bankProductType);
}

/**
 * Get the accounting classification for a given purpose.
 */
export function getAccountingClassification(purposeId: string): AccountingClassification | null {
  const def = getAccountPurpose(purposeId);
  return def?.accountingClassification ?? null;
}

/**
 * Get AI guidance for a given purpose.
 */
export function getAIGuidance(purposeId: string): string {
  const def = getAccountPurpose(purposeId);
  return def?.aiGuidance ?? 'Please classify this transaction carefully based on its actual economic purpose.';
}

/**
 * Get caution flags for a given purpose.
 */
export interface PurposeCautionResult {
  purposeId: string;
  purposeName: string;
  doNotUseFor: string[];
  taxConsiderations: string[];
  auditConsiderations: string[];
  aiGuidance: string;
}

export function getPurposeCautionFlags(purposeId: string): PurposeCautionResult | null {
  const def = getAccountPurpose(purposeId);
  if (!def) return null;
  return {
    purposeId: def.purposeId,
    purposeName: def.purposeName,
    doNotUseFor: def.doNotUseFor,
    taxConsiderations: def.taxConsiderations,
    auditConsiderations: def.auditConsiderations,
    aiGuidance: def.aiGuidance,
  };
}

/**
 * List all available purposes as a summary.
 */
export function listAllPurposes(): Array<{ purposeId: string; purposeName: string; bankProductType: AccountProduct; accountingClassification: AccountingClassification }> {
  return ACCOUNT_PURPOSES.map(p => ({
    purposeId: p.purposeId,
    purposeName: p.purposeName,
    bankProductType: p.bankProductType,
    accountingClassification: p.accountingClassification,
  }));
}
