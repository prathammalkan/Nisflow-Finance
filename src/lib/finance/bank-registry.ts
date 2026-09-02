/**
 * NISFLOW FINANCE — INDIAN BANK REGISTRY
 *
 * Maintainable, versioned bank intelligence architecture.
 * DO NOT hard-code bank rules inside React components.
 *
 * Sources: RBI circulars, NPCI guidelines, official bank websites.
 * Every material rule carries: source_authority, source_url, effective_from,
 * verified_at, and a status flag.
 *
 * STALENESS POLICY:
 *   If verified_at is older than RULE_STALENESS_DAYS, rule surfaces with
 *   status = 'UNVERIFIED' and a "Verification required" warning.
 *
 * @module bank-registry
 */

export const RULE_STALENESS_DAYS = 90;

// --- Domain Types -------------------------------------------------------------

export type BankRuleType =
  | 'upi_daily_limit'
  | 'upi_single_txn_limit'
  | 'upi_lite_limit'
  | 'neft_minimum'
  | 'neft_maximum'
  | 'rtgs_minimum'
  | 'rtgs_maximum'
  | 'imps_daily_limit'
  | 'imps_single_txn_limit'
  | 'cash_withdrawal_daily'
  | 'cash_deposit_limit'
  | 'minimum_balance'
  | 'savings_interest_rate'
  | 'fd_minimum'
  | 'rd_minimum'
  | 'tds_threshold_interest'
  | 'kyc_requirement'
  | 'upi_p2m_limit'
  | 'upi_p2p_limit'
  | 'upi_autopay_limit'
  | 'upi_tax_payment'
  | 'upi_ipo_payment';

export type RuleUnit =
  | 'INR'
  | 'INR_per_day'
  | 'INR_per_txn'
  | 'INR_per_month'
  | 'INR_per_year'
  | 'percent_pa'
  | 'days'
  | 'boolean'
  | 'text';

export type RuleStatus = 'ACTIVE' | 'UNVERIFIED' | 'SUPERSEDED' | 'BANK_SPECIFIC';

export type BankCategory =
  | 'public_sector'
  | 'private_sector'
  | 'small_finance'
  | 'cooperative'
  | 'payments_bank'
  | 'foreign'
  | 'regional_rural';

export type AccountProduct =
  | 'savings'
  | 'salary'
  | 'current'
  | 'cash'
  | 'credit_card'
  | 'fixed_deposit'
  | 'recurring_deposit'
  | 'loan'
  | 'demat'
  | 'nre'
  | 'nro'
  | 'fcnr';

export interface BankRuleSource {
  authority: string;
  url: string;
  circular?: string;
  section?: string;
}

export interface BankRule {
  id: string;
  ruleType: BankRuleType;
  value: number | string | boolean;
  unit: RuleUnit;
  description: string;
  applicableTo: AccountProduct[];
  eligibility?: string;
  conditions?: string[];
  exceptions?: string[];
  effectiveFrom: string;
  effectiveTo?: string;
  source: BankRuleSource;
  verifiedAt: string;
  status: RuleStatus;
  isRbiNpciRule: boolean;
}

export interface BankProduct {
  productId: string;
  name: string;
  type: AccountProduct;
  description: string;
  targetCustomer: string;
  keyFeatures: string[];
  taxImplications: string[];
  auditConsiderations: string[];
  documentationRequired: string[];
  rules: BankRule[];
}

export interface BankDefinition {
  bankId: string;
  name: string;
  shortName: string;
  ifscPrefix: string[];
  category: BankCategory;
  regulatedBy: string;
  headOffice: string;
  products: BankProduct[];
  bankWidePolicies: BankRule[];
  notes?: string;
}

// --- RBI / NPCI Canonical Rules -----------------------------------------------

export const RBI_NPCI_RULES: BankRule[] = [
  {
    id: 'NPCI-UPI-P2P-DAILY-01',
    ruleType: 'upi_daily_limit',
    value: 100000,
    unit: 'INR_per_day',
    description: 'NPCI default UPI P2P daily transaction limit per account.',
    applicableTo: ['savings', 'salary', 'current'],
    eligibility: 'All UPI-enabled accounts',
    conditions: [
      'Banks may set lower limits at their discretion',
      'Banks may offer higher limits for verified merchant/premium accounts',
      'Limit applies across all UPI apps linked to the account',
    ],
    effectiveFrom: '2021-04-01',
    source: {
      authority: 'NPCI',
      url: 'https://www.npci.org.in/what-we-do/upi/product-overview',
      circular: 'NPCI/2021/UPI/OC-65',
    },
    verifiedAt: '2025-01-15',
    status: 'ACTIVE',
    isRbiNpciRule: true,
  },
  {
    id: 'NPCI-UPI-SINGLE-TXN-01',
    ruleType: 'upi_single_txn_limit',
    value: 100000,
    unit: 'INR_per_txn',
    description: 'NPCI default UPI single transaction limit.',
    applicableTo: ['savings', 'salary', 'current'],
    conditions: ['Higher limits available for select categories (tax, IPO, healthcare, education)'],
    effectiveFrom: '2021-04-01',
    source: {
      authority: 'NPCI',
      url: 'https://www.npci.org.in/what-we-do/upi/product-overview',
    },
    verifiedAt: '2025-01-15',
    status: 'ACTIVE',
    isRbiNpciRule: true,
  },
  {
    id: 'NPCI-UPI-TAX-PAYMENT-01',
    ruleType: 'upi_tax_payment',
    value: 500000,
    unit: 'INR_per_txn',
    description: 'Enhanced UPI limit for direct tax payments (Income Tax, GST) via NPCI Tax category.',
    applicableTo: ['savings', 'salary', 'current'],
    conditions: [
      'Transaction must be categorized as Tax Payment in UPI app',
      'Supported by apps implementing UPI enhanced category limits',
    ],
    effectiveFrom: '2023-12-01',
    source: {
      authority: 'NPCI',
      url: 'https://www.npci.org.in/PDF/npci/upi/circular/2023/OC-137_Enhancing_UPI_Transaction_Limits.pdf',
      circular: 'NPCI/2023/UPI/OC-137',
    },
    verifiedAt: '2025-01-15',
    status: 'ACTIVE',
    isRbiNpciRule: true,
  },
  {
    id: 'NPCI-UPI-IPO-01',
    ruleType: 'upi_ipo_payment',
    value: 500000,
    unit: 'INR_per_txn',
    description: 'UPI ASBA mandate limit for IPO applications via SEBI/NPCI channel.',
    applicableTo: ['savings', 'salary'],
    conditions: [
      'Must use UPI ASBA-enabled app',
      'Mandate created by SEBI-registered exchange/registrar',
      'Amount blocked — not debited until allotment',
    ],
    effectiveFrom: '2022-01-01',
    source: {
      authority: 'SEBI',
      url: 'https://www.sebi.gov.in/legal/circulars/jan-2022/discontinuation-of-the-use-of-asba-for-initial-public-offerings-and-further-public-offerings_55548.html',
    },
    verifiedAt: '2025-01-15',
    status: 'ACTIVE',
    isRbiNpciRule: true,
  },
  {
    id: 'NPCI-UPI-LITE-01',
    ruleType: 'upi_lite_limit',
    value: 500,
    unit: 'INR_per_txn',
    description: 'UPI Lite single transaction limit (offline wallet on device). Max wallet balance Rs 2,000.',
    applicableTo: ['savings', 'salary'],
    conditions: [
      'Max wallet balance Rs 2,000',
      'No UPI PIN required',
      'Not reflected in bank statement in real-time',
      'Settlement at end of day',
    ],
    effectiveFrom: '2022-09-19',
    source: {
      authority: 'NPCI',
      url: 'https://www.npci.org.in/what-we-do/upi/product-overview',
    },
    verifiedAt: '2025-01-15',
    status: 'ACTIVE',
    isRbiNpciRule: true,
  },
  {
    id: 'RBI-RTGS-MIN-01',
    ruleType: 'rtgs_minimum',
    value: 200000,
    unit: 'INR_per_txn',
    description: 'RBI minimum amount for RTGS transactions.',
    applicableTo: ['savings', 'salary', 'current'],
    effectiveFrom: '2019-12-14',
    source: {
      authority: 'RBI',
      url: 'https://www.rbi.org.in/scripts/FAQView.aspx?Id=70',
    },
    verifiedAt: '2025-01-15',
    status: 'ACTIVE',
    isRbiNpciRule: true,
  },
  {
    id: 'RBI-NEFT-NO-MIN-01',
    ruleType: 'neft_minimum',
    value: 1,
    unit: 'INR_per_txn',
    description: 'NEFT has no minimum transaction amount as per RBI.',
    applicableTo: ['savings', 'salary', 'current'],
    effectiveFrom: '2019-11-16',
    source: {
      authority: 'RBI',
      url: 'https://www.rbi.org.in/scripts/FAQView.aspx?Id=72',
    },
    verifiedAt: '2025-01-15',
    status: 'ACTIVE',
    isRbiNpciRule: true,
  },
  {
    id: 'CBDT-CASH-DEPOSIT-SAVINGS-SFT-01',
    ruleType: 'cash_deposit_limit',
    value: 1000000,
    unit: 'INR_per_year',
    description: 'Cash deposits in savings account exceeding Rs 10,00,000 per FY reported to IT Dept under SFT (SFT-005).',
    applicableTo: ['savings'],
    conditions: [
      'Reporting by bank to IT dept — not a transaction block',
      'Triggers SFT-005 in Annual Information Statement (AIS)',
    ],
    effectiveFrom: '2016-04-01',
    source: {
      authority: 'CBDT',
      url: 'https://www.incometax.gov.in/iec/foportal/help/information/statement-of-financial-transactions',
      section: 'Rule 114E of Income Tax Rules 1962',
    },
    verifiedAt: '2025-01-15',
    status: 'ACTIVE',
    isRbiNpciRule: true,
  },
  {
    id: 'CBDT-CASH-DEPOSIT-CURRENT-SFT-01',
    ruleType: 'cash_deposit_limit',
    value: 5000000,
    unit: 'INR_per_year',
    description: 'Cash deposits in current account exceeding Rs 50,00,000 per FY reported under SFT.',
    applicableTo: ['current'],
    effectiveFrom: '2016-04-01',
    source: {
      authority: 'CBDT',
      url: 'https://www.incometax.gov.in/iec/foportal/help/information/statement-of-financial-transactions',
    },
    verifiedAt: '2025-01-15',
    status: 'ACTIVE',
    isRbiNpciRule: true,
  },
  {
    id: 'CBDT-TDS-SAVINGS-INTEREST-01',
    ruleType: 'tds_threshold_interest',
    value: 40000,
    unit: 'INR_per_year',
    description: 'TDS at 10% on savings/FD interest exceeding Rs 40,000 per year (Rs 50,000 for senior citizens) under Section 194A.',
    applicableTo: ['savings', 'fixed_deposit'],
    conditions: [
      'Threshold is per bank — not aggregate across banks',
      'Submit Form 15G/15H to avoid TDS if total income below taxable limit',
    ],
    effectiveFrom: '2019-04-01',
    source: {
      authority: 'CBDT',
      url: 'https://www.incometax.gov.in/iec/foportal/',
      section: 'Section 194A of Income Tax Act 1961',
    },
    verifiedAt: '2025-01-15',
    status: 'ACTIVE',
    isRbiNpciRule: true,
  },
];

// --- Bank Registry -------------------------------------------------------------

export const INDIAN_BANK_REGISTRY: BankDefinition[] = [
  {
    bankId: 'HDFC',
    name: 'HDFC Bank Limited',
    shortName: 'HDFC',
    ifscPrefix: ['HDFC'],
    category: 'private_sector',
    regulatedBy: 'RBI',
    headOffice: 'Mumbai, Maharashtra',
    bankWidePolicies: [],
    products: [
      {
        productId: 'HDFC-SAVINGS',
        name: 'HDFC Savings Account',
        type: 'savings',
        description: 'Standard savings account with UPI, NEFT, RTGS, IMPS, and digital banking.',
        targetCustomer: 'Salaried individuals, self-employed, students',
        keyFeatures: ['UPI enabled', 'NetBanking', 'Debit card', 'Auto-sweep FD'],
        taxImplications: [
          'Interest income taxable under "Income from Other Sources"',
          'Section 80TTA: Deduction up to Rs 10,000 on savings interest (Old Regime)',
          'TDS applies if interest > Rs 40,000/year',
        ],
        auditConsiderations: [
          'Annual SFT filing by bank for high-value cash transactions',
          'Large cash deposits appear in AIS under SFT-005',
        ],
        documentationRequired: ['Bank statements', 'Form 16A (TDS certificate)', 'Form 26AS'],
        rules: [],
      },
      {
        productId: 'HDFC-SALARY',
        name: 'HDFC Salary Account',
        type: 'salary',
        description: 'Zero-balance account linked to employer payroll.',
        targetCustomer: 'Salaried employees',
        keyFeatures: ['Zero minimum balance while employed', 'Free transactions', 'UPI enabled'],
        taxImplications: [
          'Salary credit visible in bank statement — cross-reference with Form 16',
          'Interest income taxable',
        ],
        auditConsiderations: [
          'Salary credits should match Form 16 gross salary',
          'Non-salary large credits may trigger scrutiny',
        ],
        documentationRequired: ['Salary slips', 'Form 16', 'Bank statements'],
        rules: [],
      },
    ],
  },
  {
    bankId: 'SBI',
    name: 'State Bank of India',
    shortName: 'SBI',
    ifscPrefix: ['SBIN', 'SBIY'],
    category: 'public_sector',
    regulatedBy: 'RBI',
    headOffice: 'Mumbai, Maharashtra',
    bankWidePolicies: [],
    products: [
      {
        productId: 'SBI-SAVINGS',
        name: 'SBI Savings Account',
        type: 'savings',
        description: 'India\'s largest bank standard savings product with wide branch/ATM network.',
        targetCustomer: 'General public, rural customers',
        keyFeatures: ['UPI enabled', 'YONO app', 'Wide ATM network', 'BSDA variant available'],
        taxImplications: [
          'Interest income taxable under "Income from Other Sources"',
          'Section 80TTA deduction applicable',
        ],
        auditConsiderations: ['SFT filing for high-value cash transactions'],
        documentationRequired: ['Bank statements', 'Form 16A'],
        rules: [],
      },
    ],
  },
  {
    bankId: 'ICICI',
    name: 'ICICI Bank Limited',
    shortName: 'ICICI',
    ifscPrefix: ['ICIC'],
    category: 'private_sector',
    regulatedBy: 'RBI',
    headOffice: 'Mumbai, Maharashtra',
    bankWidePolicies: [],
    products: [
      {
        productId: 'ICICI-SAVINGS',
        name: 'ICICI Savings Account',
        type: 'savings',
        description: 'Standard savings with iMobile Pay app, UPI, NEFT, RTGS.',
        targetCustomer: 'Salaried, self-employed',
        keyFeatures: ['UPI enabled', 'iMobile Pay', '3-in-1 account (Demat+Trading+Bank)'],
        taxImplications: ['Interest income taxable', 'Section 80TTA deduction'],
        auditConsiderations: ['SFT for high-value cash transactions'],
        documentationRequired: ['Bank statements', 'Form 16A'],
        rules: [],
      },
    ],
  },
  {
    bankId: 'AXIS',
    name: 'Axis Bank Limited',
    shortName: 'Axis',
    ifscPrefix: ['UTIB'],
    category: 'private_sector',
    regulatedBy: 'RBI',
    headOffice: 'Mumbai, Maharashtra',
    bankWidePolicies: [],
    products: [
      {
        productId: 'AXIS-SAVINGS',
        name: 'Axis Bank Savings Account',
        type: 'savings',
        description: 'Standard savings with BHIM Axis Pay UPI, online banking.',
        targetCustomer: 'Salaried, self-employed',
        keyFeatures: ['UPI enabled', 'BHIM Axis Pay', 'Multiple savings account variants'],
        taxImplications: ['Interest income taxable', 'Section 80TTA deduction'],
        auditConsiderations: ['SFT for high-value cash'],
        documentationRequired: ['Bank statements', 'Form 16A'],
        rules: [],
      },
    ],
  },
  {
    bankId: 'KOTAK',
    name: 'Kotak Mahindra Bank',
    shortName: 'Kotak',
    ifscPrefix: ['KKBK'],
    category: 'private_sector',
    regulatedBy: 'RBI',
    headOffice: 'Mumbai, Maharashtra',
    bankWidePolicies: [],
    products: [
      {
        productId: 'KOTAK-SAVINGS',
        name: 'Kotak 811 / Savings Account',
        type: 'savings',
        description: 'Digital-first savings (811) or full-service savings.',
        targetCustomer: 'Digital-first customers, salaried',
        keyFeatures: ['Zero-balance 811 variant', 'UPI enabled', 'High interest rate tiers'],
        taxImplications: ['Interest income taxable', 'Section 80TTA deduction'],
        auditConsiderations: ['SFT for high-value cash'],
        documentationRequired: ['Bank statements', 'Form 16A'],
        rules: [],
      },
    ],
  },
  {
    bankId: 'BOB',
    name: 'Bank of Baroda',
    shortName: 'BOB',
    ifscPrefix: ['BARB'],
    category: 'public_sector',
    regulatedBy: 'RBI',
    headOffice: 'Vadodara, Gujarat',
    bankWidePolicies: [],
    products: [
      {
        productId: 'BOB-SAVINGS',
        name: 'Bank of Baroda Savings Account',
        type: 'savings',
        description: 'Public sector bank savings account with wide rural/urban reach.',
        targetCustomer: 'General public',
        keyFeatures: ['UPI via bob World', 'NEFT/RTGS/IMPS', 'Jan Dhan variant available'],
        taxImplications: ['Interest income taxable', 'Section 80TTA deduction'],
        auditConsiderations: ['SFT for high-value cash'],
        documentationRequired: ['Bank statements', 'Form 16A'],
        rules: [],
      },
    ],
  },
];

// --- Helpers ------------------------------------------------------------------

export function findBank(bankId: string): BankDefinition | null {
  const id = bankId.trim().toUpperCase();
  return INDIAN_BANK_REGISTRY.find(b => b.bankId === id) ?? null;
}

export function findBankByIFSC(ifsc: string): BankDefinition | null {
  if (!ifsc || ifsc.length < 4) return null;
  const prefix = ifsc.slice(0, 4).toUpperCase();
  return INDIAN_BANK_REGISTRY.find(b => b.ifscPrefix.includes(prefix)) ?? null;
}

export function getRbiNpciRules(ruleType?: BankRuleType): BankRule[] {
  const rules = RBI_NPCI_RULES.filter(r => r.status === 'ACTIVE');
  if (ruleType) return rules.filter(r => r.ruleType === ruleType);
  return rules;
}

export function isRuleStale(rule: BankRule): boolean {
  const verifiedDate = new Date(rule.verifiedAt);
  const daysSince = (Date.now() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > RULE_STALENESS_DAYS;
}

export interface UPILimitResult {
  limitAmount: number;
  unit: RuleUnit;
  ruleId: string;
  description: string;
  isStale: boolean;
  source: BankRuleSource;
  bankSpecificNote?: string;
}

export function getUPILimit(
  transactionCategory: 'p2p' | 'p2m' | 'tax' | 'ipo' | 'lite',
  bankId?: string,
): UPILimitResult {
  const categoryRuleMap: Record<string, string> = {
    tax: 'NPCI-UPI-TAX-PAYMENT-01',
    ipo: 'NPCI-UPI-IPO-01',
    lite: 'NPCI-UPI-LITE-01',
    p2p: 'NPCI-UPI-P2P-DAILY-01',
    p2m: 'NPCI-UPI-P2P-DAILY-01',
  };

  const ruleId = categoryRuleMap[transactionCategory] ?? 'NPCI-UPI-P2P-DAILY-01';
  const rule = RBI_NPCI_RULES.find(r => r.id === ruleId);

  if (!rule) {
    return {
      limitAmount: 100000,
      unit: 'INR_per_day',
      ruleId: 'NPCI-UPI-P2P-DAILY-01',
      description: 'Default NPCI UPI limit (rule not found in registry)',
      isStale: true,
      source: { authority: 'NPCI', url: 'https://www.npci.org.in' },
    };
  }

  let bankSpecificNote: string | undefined;
  if (bankId) {
    const bank = findBank(bankId);
    if (bank) {
      const override = bank.bankWidePolicies.find(p => p.ruleType === rule.ruleType);
      if (override) {
        bankSpecificNote = `${bank.name} may set its own limit: Rs ${Number(override.value).toLocaleString('en-IN')}. Verify with your bank.`;
      }
    }
  }

  return {
    limitAmount: Number(rule.value),
    unit: rule.unit,
    ruleId: rule.id,
    description: rule.description,
    isStale: isRuleStale(rule),
    source: rule.source,
    bankSpecificNote,
  };
}

export function getAllBankIds(): string[] {
  return INDIAN_BANK_REGISTRY.map(b => b.bankId);
}

export function getBankProducts(bankId: string): BankProduct[] {
  const bank = findBank(bankId);
  return bank?.products ?? [];
}
