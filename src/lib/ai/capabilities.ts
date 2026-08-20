/**
 * NISFLOW FINANCE — CANONICAL AI CAPABILITY REGISTRY
 * 
 * Single source of truth for all AI capabilities, authority levels (L0-L4),
 * prerequisite requirements, validation rules, confirmation policies, and error classifications.
 * 
 * CORE PRINCIPLE: "BROAD AUTHORITY, NARROW ASSUMPTIONS"
 */

export type AuthorityLevel =
  | 'L0_READ'
  | 'L1_PREPARE'
  | 'L2_NON_FINANCIAL_MUTATION'
  | 'L3_FINANCIAL_POSTING'
  | 'L4_HIGH_RISK_DESTRUCTIVE';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type AIActionDomain =
  | 'accounts'
  | 'people'
  | 'transactions'
  | 'loans'
  | 'investments'
  | 'recurring'
  | 'budgets'
  | 'savings_goals'
  | 'reconciliation'
  | 'reversals'
  | 'analytics'
  | 'plans';

export type StandardErrorCode =
  | 'AUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'ENTITY_NOT_FOUND'
  | 'ENTITY_AMBIGUOUS'
  | 'PREREQUISITE_MISSING'
  | 'INVALID_AMOUNT'
  | 'INVALID_CURRENCY'
  | 'INVALID_DATE'
  | 'INVALID_ACCOUNT'
  | 'INVALID_ACCOUNT_TYPE'
  | 'OWNERSHIP_VIOLATION'
  | 'INSUFFICIENT_INFORMATION'
  | 'INSUFFICIENT_BALANCE'
  | 'OVERPAYMENT'
  | 'DUPLICATE_ACTION'
  | 'LEDGER_FAILURE'
  | 'PROJECTION_FAILURE'
  | 'PROVIDER_FAILURE'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'PARTIAL_FAILURE';

export type CanonicalActionType =
  // L0 Read
  | 'inquire_net_worth'
  | 'inquire_balances'
  | 'inquire_spending'
  | 'inquire_counterparty_balance'
  | 'inquire_loan_balance'
  | 'inquire_holdings'
  | 'inquire_budget_status'
  | 'inquire_goals'
  // L1 Prepare
  | 'prepare_financial_plan'
  | 'calculate_split'
  // L2 Non-Financial Mutation
  | 'create_account'
  | 'archive_account'
  | 'create_person'
  | 'rename_person'
  | 'create_budget'
  | 'update_budget'
  | 'create_savings_goal'
  | 'update_savings_goal'
  | 'create_recurring_rule'
  | 'delete_recurring_rule'
  // L3 Financial Mutation
  | 'expense'
  | 'income'
  | 'transfer'
  | 'opening_balance'
  | 'lending'
  | 'borrowing'
  | 'receivable_repayment'
  | 'payable_repayment'
  | 'loan_disbursement'
  | 'loan_emi'
  | 'investment_buy'
  | 'investment_sell'
  | 'investment_dividend'
  | 'reconciliation_adjustment'
  // L4 Destructive Mutation
  | 'reversal'
  | 'delete_loan'
  | 'execute_plan';

export interface CapabilityDefinition {
  id: string;
  actionType: CanonicalActionType;
  domain: AIActionDomain;
  authorityLevel: AuthorityLevel;
  financialMutation: boolean;
  destructive: boolean;
  confirmationRequired: boolean;
  riskLevel: RiskLevel;
  description: string;
  requiredParameters: string[];
  optionalParameters: string[];
  idempotencyPrefix: string;
}

/**
 * Supported account types in NisFlow Finance domain model.
 * Mapped to canonical database types.
 */
export const SUPPORTED_ACCOUNT_TYPES: Record<string, { dbType: string; label: string; isInvestment: boolean }> = {
  // Bank accounts
  'bank': { dbType: 'bank', label: 'Bank Account', isInvestment: false },
  'savings': { dbType: 'bank', label: 'Savings Account', isInvestment: false },
  'current': { dbType: 'bank', label: 'Current Account', isInvestment: false },
  'salary': { dbType: 'bank', label: 'Salary Account', isInvestment: false },
  'checking': { dbType: 'bank', label: 'Checking Account', isInvestment: false },
  
  // Cash & Wallet
  'cash': { dbType: 'cash', label: 'Cash Wallet', isInvestment: false },
  'wallet': { dbType: 'wallet', label: 'UPI / Digital Wallet', isInvestment: false },
  'upi': { dbType: 'wallet', label: 'UPI Wallet', isInvestment: false },
  
  // Credit Card
  'credit': { dbType: 'credit', label: 'Credit Card', isInvestment: false },
  'credit_card': { dbType: 'credit', label: 'Credit Card', isInvestment: false },
  'credit card': { dbType: 'credit', label: 'Credit Card', isInvestment: false },
  
  // Investment & Demat
  'investment': { dbType: 'investment', label: 'Investment Account', isInvestment: true },
  'demat': { dbType: 'investment', label: 'Demat Account', isInvestment: true },
  'broker': { dbType: 'investment', label: 'Broker Account', isInvestment: true },
  'mutual_fund': { dbType: 'investment', label: 'Mutual Fund Account', isInvestment: true },
  'mutual fund': { dbType: 'investment', label: 'Mutual Fund Account', isInvestment: true },
  'fixed_deposit': { dbType: 'investment', label: 'Fixed Deposit', isInvestment: true },
  'fixed deposit': { dbType: 'investment', label: 'Fixed Deposit', isInvestment: true },
  'fd': { dbType: 'investment', label: 'Fixed Deposit', isInvestment: true },
};

export const CAPABILITY_REGISTRY: Record<CanonicalActionType, CapabilityDefinition> = {
  // L0 READ CAPABILITIES
  inquire_net_worth: {
    id: 'CAP_NET_WORTH_READ',
    actionType: 'inquire_net_worth',
    domain: 'analytics',
    authorityLevel: 'L0_READ',
    financialMutation: false,
    destructive: false,
    confirmationRequired: false,
    riskLevel: 'low',
    description: 'Calculates total net worth exclusively from double-entry ledger accounts.',
    requiredParameters: [],
    optionalParameters: [],
    idempotencyPrefix: 'READ',
  },
  inquire_balances: {
    id: 'CAP_BALANCES_READ',
    actionType: 'inquire_balances',
    domain: 'accounts',
    authorityLevel: 'L0_READ',
    financialMutation: false,
    destructive: false,
    confirmationRequired: false,
    riskLevel: 'low',
    description: 'Retrieves current authoritative balances for all or specific accounts.',
    requiredParameters: [],
    optionalParameters: ['accountId', 'accountName'],
    idempotencyPrefix: 'READ',
  },
  inquire_spending: {
    id: 'CAP_SPENDING_READ',
    actionType: 'inquire_spending',
    domain: 'transactions',
    authorityLevel: 'L0_READ',
    financialMutation: false,
    destructive: false,
    confirmationRequired: false,
    riskLevel: 'low',
    description: 'Analyzes spending by category or timeframe from double-entry ledger.',
    requiredParameters: [],
    optionalParameters: ['categoryId', 'categoryName', 'startDate', 'endDate'],
    idempotencyPrefix: 'READ',
  },
  inquire_counterparty_balance: {
    id: 'CAP_PEOPLE_BAL_READ',
    actionType: 'inquire_counterparty_balance',
    domain: 'people',
    authorityLevel: 'L0_READ',
    financialMutation: false,
    destructive: false,
    confirmationRequired: false,
    riskLevel: 'low',
    description: 'Retrieves authoritative receivable / payable balance for a counterparty from People Ledger.',
    requiredParameters: ['personName'],
    optionalParameters: ['personId'],
    idempotencyPrefix: 'READ',
  },
  inquire_loan_balance: {
    id: 'CAP_LOAN_BAL_READ',
    actionType: 'inquire_loan_balance',
    domain: 'loans',
    authorityLevel: 'L0_READ',
    financialMutation: false,
    destructive: false,
    confirmationRequired: false,
    riskLevel: 'low',
    description: 'Retrieves outstanding principal, interest paid, and settlement status from Loan Ledger.',
    requiredParameters: ['loanName'],
    optionalParameters: ['loanId'],
    idempotencyPrefix: 'READ',
  },
  inquire_holdings: {
    id: 'CAP_HOLDINGS_READ',
    actionType: 'inquire_holdings',
    domain: 'investments',
    authorityLevel: 'L0_READ',
    financialMutation: false,
    destructive: false,
    confirmationRequired: false,
    riskLevel: 'low',
    description: 'Retrieves portfolio assets, invested amounts, units, and valuation from Investment Ledger.',
    requiredParameters: [],
    optionalParameters: ['assetSymbol', 'investmentId'],
    idempotencyPrefix: 'READ',
  },
  inquire_budget_status: {
    id: 'CAP_BUDGET_READ',
    actionType: 'inquire_budget_status',
    domain: 'budgets',
    authorityLevel: 'L0_READ',
    financialMutation: false,
    destructive: false,
    confirmationRequired: false,
    riskLevel: 'low',
    description: 'Retrieves monthly budget allocations and actual spending progress.',
    requiredParameters: [],
    optionalParameters: ['month', 'year', 'categoryName'],
    idempotencyPrefix: 'READ',
  },
  inquire_goals: {
    id: 'CAP_GOALS_READ',
    actionType: 'inquire_goals',
    domain: 'savings_goals',
    authorityLevel: 'L0_READ',
    financialMutation: false,
    destructive: false,
    confirmationRequired: false,
    riskLevel: 'low',
    description: 'Retrieves savings goals target amounts and accumulated progress.',
    requiredParameters: [],
    optionalParameters: ['goalName', 'goalId'],
    idempotencyPrefix: 'READ',
  },

  // L1 PREPARE CAPABILITIES
  prepare_financial_plan: {
    id: 'CAP_PREPARE_PLAN',
    actionType: 'prepare_financial_plan',
    domain: 'plans',
    authorityLevel: 'L1_PREPARE',
    financialMutation: false,
    destructive: false,
    confirmationRequired: false,
    riskLevel: 'low',
    description: 'Prepares a multi-step structured plan for complex multi-party or multi-account operations.',
    requiredParameters: ['steps'],
    optionalParameters: ['title', 'notes'],
    idempotencyPrefix: 'PLAN',
  },
  calculate_split: {
    id: 'CAP_CALCULATE_SPLIT',
    actionType: 'calculate_split',
    domain: 'people',
    authorityLevel: 'L1_PREPARE',
    financialMutation: false,
    destructive: false,
    confirmationRequired: false,
    riskLevel: 'low',
    description: 'Calculates exact equal or custom bill split shares without mutating the database.',
    requiredParameters: ['totalAmount', 'participants'],
    optionalParameters: ['payer'],
    idempotencyPrefix: 'CALC',
  },

  // L2 NON-FINANCIAL MUTATION CAPABILITIES
  create_account: {
    id: 'CAP_ACCOUNT_CREATE',
    actionType: 'create_account',
    domain: 'accounts',
    authorityLevel: 'L2_NON_FINANCIAL_MUTATION',
    financialMutation: false,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Creates a new bank, cash wallet, credit card, or demat/investment account.',
    requiredParameters: ['accountName', 'accountType'],
    optionalParameters: ['institution', 'purpose', 'color'],
    idempotencyPrefix: 'ACC:CREATE',
  },
  archive_account: {
    id: 'CAP_ACCOUNT_ARCHIVE',
    actionType: 'archive_account',
    domain: 'accounts',
    authorityLevel: 'L2_NON_FINANCIAL_MUTATION',
    financialMutation: false,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'high',
    description: 'Deactivates an account from active use without modifying posted ledger entries.',
    requiredParameters: ['accountId'],
    optionalParameters: ['accountName'],
    idempotencyPrefix: 'ACC:ARCH',
  },
  create_person: {
    id: 'CAP_PERSON_CREATE',
    actionType: 'create_person',
    domain: 'people',
    authorityLevel: 'L2_NON_FINANCIAL_MUTATION',
    financialMutation: false,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'low',
    description: 'Adds a counterparty / person and automatically provisions receivable/payable ledger accounts.',
    requiredParameters: ['personName'],
    optionalParameters: ['phone', 'email', 'relationship', 'notes'],
    idempotencyPrefix: 'CP:CREATE',
  },
  rename_person: {
    id: 'CAP_PERSON_RENAME',
    actionType: 'rename_person',
    domain: 'people',
    authorityLevel: 'L2_NON_FINANCIAL_MUTATION',
    financialMutation: false,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'low',
    description: 'Renames an existing counterparty and updates corresponding ledger account display names.',
    requiredParameters: ['personId', 'personName'],
    optionalParameters: [],
    idempotencyPrefix: 'CP:RENAME',
  },
  create_budget: {
    id: 'CAP_BUDGET_CREATE',
    actionType: 'create_budget',
    domain: 'budgets',
    authorityLevel: 'L2_NON_FINANCIAL_MUTATION',
    financialMutation: false,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'low',
    description: 'Sets a monthly spending allocation target for a specific category.',
    requiredParameters: ['categoryName', 'amount', 'month', 'year'],
    optionalParameters: [],
    idempotencyPrefix: 'BUDGET:CREATE',
  },
  update_budget: {
    id: 'CAP_BUDGET_UPDATE',
    actionType: 'update_budget',
    domain: 'budgets',
    authorityLevel: 'L2_NON_FINANCIAL_MUTATION',
    financialMutation: false,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'low',
    description: 'Adjusts a monthly budget allocation amount.',
    requiredParameters: ['budgetId', 'amount'],
    optionalParameters: ['categoryName'],
    idempotencyPrefix: 'BUDGET:UPDATE',
  },
  create_savings_goal: {
    id: 'CAP_GOAL_CREATE',
    actionType: 'create_savings_goal',
    domain: 'savings_goals',
    authorityLevel: 'L2_NON_FINANCIAL_MUTATION',
    financialMutation: false,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'low',
    description: 'Creates a target savings goal with deadline.',
    requiredParameters: ['name', 'targetAmount'],
    optionalParameters: ['initialAmount', 'deadline'],
    idempotencyPrefix: 'GOAL:CREATE',
  },
  update_savings_goal: {
    id: 'CAP_GOAL_UPDATE',
    actionType: 'update_savings_goal',
    domain: 'savings_goals',
    authorityLevel: 'L2_NON_FINANCIAL_MUTATION',
    financialMutation: false,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'low',
    description: 'Updates a savings goal target or current progress amount.',
    requiredParameters: ['goalId'],
    optionalParameters: ['targetAmount', 'currentAmount', 'deadline'],
    idempotencyPrefix: 'GOAL:UPDATE',
  },
  create_recurring_rule: {
    id: 'CAP_RECURRING_CREATE',
    actionType: 'create_recurring_rule',
    domain: 'recurring',
    authorityLevel: 'L2_NON_FINANCIAL_MUTATION',
    financialMutation: false,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Configures a recurring transaction schedule (e.g. monthly rent, SIP, salary).',
    requiredParameters: ['amount', 'accountId', 'frequency', 'startDate'],
    optionalParameters: ['description', 'categoryId', 'counterpartyId', 'endDate', 'type'],
    idempotencyPrefix: 'REC:RULE:CREATE',
  },
  delete_recurring_rule: {
    id: 'CAP_RECURRING_DELETE',
    actionType: 'delete_recurring_rule',
    domain: 'recurring',
    authorityLevel: 'L2_NON_FINANCIAL_MUTATION',
    financialMutation: false,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Deletes a recurring transaction rule schedule.',
    requiredParameters: ['recurringId'],
    optionalParameters: [],
    idempotencyPrefix: 'REC:RULE:DEL',
  },

  // L3 FINANCIAL POSTING CAPABILITIES (MANDATORY CONFIRMATION)
  expense: {
    id: 'CAP_FIN_EXPENSE',
    actionType: 'expense',
    domain: 'transactions',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Posts balanced Dr Expense / Cr Bank Asset entry in double-entry ledger.',
    requiredParameters: ['amount', 'accountId'],
    optionalParameters: ['accountName', 'categoryId', 'categoryName', 'description', 'date', 'notes'],
    idempotencyPrefix: 'TXN:EXP',
  },
  income: {
    id: 'CAP_FIN_INCOME',
    actionType: 'income',
    domain: 'transactions',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Posts balanced Dr Bank Asset / Cr Income entry in double-entry ledger.',
    requiredParameters: ['amount', 'accountId'],
    optionalParameters: ['accountName', 'categoryId', 'categoryName', 'description', 'date', 'notes'],
    idempotencyPrefix: 'TXN:INC',
  },
  transfer: {
    id: 'CAP_FIN_TRANSFER',
    actionType: 'transfer',
    domain: 'transactions',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Posts balanced Dr Destination Asset / Cr Source Asset entry in double-entry ledger.',
    requiredParameters: ['amount', 'accountId', 'toAccountId'],
    optionalParameters: ['accountName', 'toAccountName', 'description', 'date', 'notes'],
    idempotencyPrefix: 'TXN:XFER',
  },
  opening_balance: {
    id: 'CAP_FIN_OPEN_BAL',
    actionType: 'opening_balance',
    domain: 'transactions',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Posts balanced Dr Account Asset / Cr Opening Balance Equity entry.',
    requiredParameters: ['amount', 'accountId'],
    optionalParameters: ['accountName', 'description', 'date'],
    idempotencyPrefix: 'ACC:OPEN',
  },
  lending: {
    id: 'CAP_FIN_LENDING',
    actionType: 'lending',
    domain: 'people',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Posts balanced Dr Asset:Receivable / Cr Asset:Bank entry in People Ledger.',
    requiredParameters: ['amount', 'accountId', 'personId'],
    optionalParameters: ['personName', 'accountName', 'description', 'date', 'notes'],
    idempotencyPrefix: 'REC:LEND',
  },
  borrowing: {
    id: 'CAP_FIN_BORROWING',
    actionType: 'borrowing',
    domain: 'people',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Posts balanced Dr Asset:Bank / Cr Liability:Payable entry in People Ledger.',
    requiredParameters: ['amount', 'accountId', 'personId'],
    optionalParameters: ['personName', 'accountName', 'description', 'date', 'notes'],
    idempotencyPrefix: 'PAY:BORROW',
  },
  receivable_repayment: {
    id: 'CAP_FIN_REC_REPAY',
    actionType: 'receivable_repayment',
    domain: 'people',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Posts balanced Dr Asset:Bank / Cr Asset:Receivable with strict overpayment protection.',
    requiredParameters: ['amount', 'accountId', 'personId'],
    optionalParameters: ['personName', 'accountName', 'repaymentId', 'description', 'date', 'notes'],
    idempotencyPrefix: 'REC:REPAY',
  },
  payable_repayment: {
    id: 'CAP_FIN_PAY_REPAY',
    actionType: 'payable_repayment',
    domain: 'people',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Posts balanced Dr Liability:Payable / Cr Asset:Bank with strict overpayment protection.',
    requiredParameters: ['amount', 'accountId', 'personId'],
    optionalParameters: ['personName', 'accountName', 'repaymentId', 'description', 'date', 'notes'],
    idempotencyPrefix: 'PAY:REPAY',
  },
  loan_disbursement: {
    id: 'CAP_FIN_LOAN_DISBURSE',
    actionType: 'loan_disbursement',
    domain: 'loans',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'high',
    description: 'Posts balanced Dr Asset:Bank / Cr Liability:Loan in Loan Ledger.',
    requiredParameters: ['amount', 'accountId', 'loanId'],
    optionalParameters: ['loanName', 'accountName', 'description', 'date'],
    idempotencyPrefix: 'LOAN:DISBURSE',
  },
  loan_emi: {
    id: 'CAP_FIN_LOAN_EMI',
    actionType: 'loan_emi',
    domain: 'loans',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Posts compound Dr Liability:Loan (Principal) + Dr Expense:LoanInterest (Interest) / Cr Asset:Bank entry.',
    requiredParameters: ['amount', 'accountId', 'loanId', 'principalAmount', 'interestAmount'],
    optionalParameters: ['loanName', 'accountName', 'description', 'date', 'notes'],
    idempotencyPrefix: 'LOAN:EMI',
  },
  investment_buy: {
    id: 'CAP_FIN_INV_BUY',
    actionType: 'investment_buy',
    domain: 'investments',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'high',
    description: 'Posts balanced Dr Asset:Investment / Cr Asset:Bank in Investment Ledger. Strictly validates separate funding and demat accounts.',
    requiredParameters: ['amount', 'accountId', 'holdingAccountId', 'assetSymbol'],
    optionalParameters: ['accountName', 'holdingAccountName', 'assetName', 'quantity', 'pricePerUnit', 'description', 'date', 'notes'],
    idempotencyPrefix: 'INV:BUY',
  },
  investment_sell: {
    id: 'CAP_FIN_INV_SELL',
    actionType: 'investment_sell',
    domain: 'investments',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'high',
    description: 'Posts balanced Dr Cash (Proceeds) / Cr Investment (Cost Basis) +/- Capital Gain or Loss.',
    requiredParameters: ['amount', 'accountId', 'holdingAccountId', 'assetSymbol'],
    optionalParameters: ['accountName', 'holdingAccountName', 'assetName', 'quantity', 'pricePerUnit', 'costBasis', 'realizedGainLoss', 'description', 'date', 'notes'],
    idempotencyPrefix: 'INV:SELL',
  },
  investment_dividend: {
    id: 'CAP_FIN_INV_DIVIDEND',
    actionType: 'investment_dividend',
    domain: 'investments',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'medium',
    description: 'Posts balanced Dr Asset:Bank / Cr Income:Dividend entry in double-entry ledger.',
    requiredParameters: ['amount', 'accountId', 'assetSymbol'],
    optionalParameters: ['accountName', 'assetName', 'description', 'date', 'notes'],
    idempotencyPrefix: 'INV:DIV',
  },
  reconciliation_adjustment: {
    id: 'CAP_FIN_RECON_ADJUST',
    actionType: 'reconciliation_adjustment',
    domain: 'reconciliation',
    authorityLevel: 'L3_FINANCIAL_POSTING',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'high',
    description: 'Posts an explicit surplus or shortfall balancing entry against bank statement reconciliation.',
    requiredParameters: ['amount', 'accountId'],
    optionalParameters: ['isPositive', 'description', 'date'],
    idempotencyPrefix: 'RECON:ADJ',
  },

  // L4 DESTRUCTIVE CAPABILITIES (STRONG CONFIRMATION)
  reversal: {
    id: 'CAP_FIN_REVERSAL',
    actionType: 'reversal',
    domain: 'reversals',
    authorityLevel: 'L4_HIGH_RISK_DESTRUCTIVE',
    financialMutation: true,
    destructive: true,
    confirmationRequired: true,
    riskLevel: 'critical',
    description: 'Inverts all lines of a posted journal entry via post_reversal_entry() and records cryptographic audit record.',
    requiredParameters: ['originalJournalEntryId', 'reversalReason'],
    optionalParameters: ['description'],
    idempotencyPrefix: 'REV',
  },
  delete_loan: {
    id: 'CAP_LOAN_DELETE',
    actionType: 'delete_loan',
    domain: 'loans',
    authorityLevel: 'L4_HIGH_RISK_DESTRUCTIVE',
    financialMutation: true,
    destructive: true,
    confirmationRequired: true,
    riskLevel: 'critical',
    description: 'Reverses all associated active loan journal entries before soft-deleting loan metadata record.',
    requiredParameters: ['loanId'],
    optionalParameters: ['loanName'],
    idempotencyPrefix: 'REV:LOAN:DEL',
  },
  execute_plan: {
    id: 'CAP_PLAN_EXECUTE',
    actionType: 'execute_plan',
    domain: 'plans',
    authorityLevel: 'L4_HIGH_RISK_DESTRUCTIVE',
    financialMutation: true,
    destructive: false,
    confirmationRequired: true,
    riskLevel: 'high',
    description: 'Executes a multi-step financial plan with pre-flight verification and partial execution protection.',
    requiredParameters: ['planId', 'steps'],
    optionalParameters: ['title'],
    idempotencyPrefix: 'PLAN:EXEC',
  },
};

/**
 * Helper to get capability metadata by actionType
 */
export function getCapability(actionType: CanonicalActionType): CapabilityDefinition | null {
  return CAPABILITY_REGISTRY[actionType] || null;
}

/**
 * Helper to check if an account type is supported
 */
export function resolveSupportedAccountType(input: string): { dbType: string; label: string; isInvestment: boolean } | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  return SUPPORTED_ACCOUNT_TYPES[normalized] || null;
}
