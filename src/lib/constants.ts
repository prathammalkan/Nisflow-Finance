import { AccountType, TransactionType, TransactionStatus, Direction, Ownership } from '@/types/database';

export const APP_NAME = 'NisFlow Finance';
export const CURRENCY = 'INR';
export const CURRENCY_SYMBOL = '₹';

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: AccountType.CASH, label: 'Cash' },
  { value: AccountType.BANK, label: 'Bank Account' },
  { value: AccountType.CREDIT_CARD, label: 'Credit Card' },
  { value: AccountType.WALLET, label: 'Digital Wallet' },
  { value: AccountType.INVESTMENT, label: 'Investment Account' },
  { value: AccountType.LOAN, label: 'Loan Account' },
];

export const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: TransactionType.INCOME, label: 'Income' },
  { value: TransactionType.EXPENSE, label: 'Expense' },
  { value: TransactionType.TRANSFER, label: 'Transfer' },
  { value: TransactionType.INVESTMENT, label: 'Investment' },
];

export const TRANSACTION_STATUSES: { value: TransactionStatus; label: string }[] = [
  { value: TransactionStatus.PENDING, label: 'Pending' },
  { value: TransactionStatus.COMPLETED, label: 'Completed' },
  { value: TransactionStatus.FAILED, label: 'Failed' },
  { value: TransactionStatus.CANCELLED, label: 'Cancelled' },
];

export const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: Direction.IN, label: 'Money In' },
  { value: Direction.OUT, label: 'Money Out' },
];

export const OWNERSHIP_TYPES: { value: Ownership; label: string }[] = [
  { value: Ownership.SELF, label: 'Self' },
  { value: Ownership.JOINT, label: 'Joint' },
  { value: Ownership.THIRD_PARTY, label: 'Third Party' },
];
