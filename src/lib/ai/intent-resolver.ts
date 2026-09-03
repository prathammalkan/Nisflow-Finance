export type UserIntentKind =
  | 'COMMAND'
  | 'INFORMATION_REQUEST'
  | 'AMBIGUOUS_STATEMENT'
  | 'UNSUPPORTED_REQUEST';

export interface DisambiguationPrompt {
  isAmbiguous: boolean;
  question?: string;
  options?: Array<{ key: string; label: string; actionType?: string }>;
  explanation?: string;
  missingPrerequisite?: string;
}

/**
 * Analyzes conversational commands for financial intent ambiguities before action execution.
 * Prevents LLM guessing on materially significant financial transactions.
 */
export function evaluateFinancialIntentAmbiguity(input: {
  rawText: string;
  actionType?: string;
  hasPerson?: boolean;
  hasAmount?: boolean;
  isAccountCreation?: boolean;
  hasFundingAccount?: boolean;
  hasDematAccount?: boolean;
  dematAccountCount?: number;
}): DisambiguationPrompt {
  const lower = input.rawText.toLowerCase();

  // 1. Account Creation with Ambiguous Money
  // e.g. "Create my BOB account and add ₹50,000" or "Create BOB with ₹5 lakh"
  if (
    (lower.includes('create') || lower.includes('open') || lower.includes('add account')) &&
    (lower.includes('add') || lower.includes('put') || lower.includes('deposit')) &&
    !lower.includes('opening balance') &&
    !lower.includes('transfer from') &&
    !lower.includes('salary')
  ) {
    return {
      isAmbiguous: true,
      question: 'How should this initial money be recorded for the new account?',
      options: [
        { key: 'A', label: 'Opening Balance Equity (historical existing balance)', actionType: 'opening_balance' },
        { key: 'B', label: 'Transfer from another bank account', actionType: 'transfer' },
        { key: 'C', label: 'Income / Salary received', actionType: 'income' },
        { key: 'D', label: 'Money received from a person / debt', actionType: 'borrowing' },
      ],
      explanation: 'Account creation is separate from financial posting. Please clarify what the initial funds represent.',
    };
  }

  // 2. Ambiguous Family / Counterparty Money Flow
  // e.g. "I gave Papa ₹10,000" or "Sent ₹5000 to Amit" (not explicitly "lent", "gift", "paid for dinner")
  if (
    input.hasPerson &&
    (lower.startsWith('i gave ') || lower.startsWith('gave ') || lower.startsWith('sent ') || lower.startsWith('paid ') || lower.includes('put ')) &&
    !lower.includes('lent') &&
    !lower.includes('loan') &&
    !lower.includes('borrow') &&
    !lower.includes('repaid') &&
    !lower.includes('gift') &&
    !lower.includes('for lunch') &&
    !lower.includes('for dinner') &&
    !lower.includes('for food') &&
    !lower.includes('for groceries') &&
    !lower.includes('for rent') &&
    !lower.includes('for bill')
  ) {
    return {
      isAmbiguous: true,
      question: 'What is the purpose of this payment to the person?',
      options: [
        { key: 'A', label: 'Lending / Loan to be repaid by them (Receivable)', actionType: 'lending' },
        { key: 'B', label: 'Personal Gift / Non-refundable transfer', actionType: 'expense' },
        { key: 'C', label: 'Debt Repayment (paying back money you owed them)', actionType: 'payable_repayment' },
        { key: 'D', label: 'Shared expense / bill payment', actionType: 'expense' },
      ],
      explanation: 'Money given to a person has economically distinct meanings in the ledger. Please select the correct intent.',
    };
  }

  // 3. Family / Third-Party IPO & Investment Application
  // e.g. "Send ₹46,000 to Papa for Bajaj IPO so he can apply from his demat"
  if (
    input.hasPerson &&
    (lower.includes('ipo') || lower.includes('invest') || lower.includes('shares') || lower.includes('stock')) &&
    (lower.includes('papa') || lower.includes('mummy') || lower.includes('friend') || lower.includes('brother') || lower.includes('sister'))
  ) {
    return {
      isAmbiguous: true,
      question: 'What is the ownership structure for this IPO / Investment application?',
      options: [
        { key: 'A', label: 'Loan to family member (they apply and will repay you)', actionType: 'lending' },
        { key: 'B', label: 'Gift to family member', actionType: 'expense' },
        { key: 'C', label: 'Beneficial ownership / pooled family demat (Not currently supported as direct asset)', actionType: 'lending' },
      ],
      explanation: 'NisFlow Finance records direct personal demat assets. Third-party pooled applications should be recorded as loans or personal transfers.',
    };
  }

  // 4. Investment Demat Account Availability
  if (input.actionType === 'investment_buy') {
    if (input.dematAccountCount === 0) {
      return {
        isAmbiguous: true,
        missingPrerequisite: 'demat_account',
        explanation: 'An active investment/demat account is required before this investment can be recorded. Please create an investment account in Accounts.',
      };
    }

    if (input.dematAccountCount && input.dematAccountCount > 1 && !input.hasDematAccount) {
      return {
        isAmbiguous: true,
        question: 'Which investment/demat account should hold this asset?',
        explanation: 'Multiple investment accounts were found in your portfolio. Please specify the target demat account.',
      };
    }
  }

  return { isAmbiguous: false };
}
