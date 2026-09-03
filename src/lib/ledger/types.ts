import { Decimal } from 'decimal.js';

export type LedgerAccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export type JournalEntryStatus = 'posted' | 'reversed';

export type JournalLineInput = {
  ledgerAccountId: string;
  debitAmount: number | string | Decimal;
  creditAmount: number | string | Decimal;
  currency?: string;
  memo?: string;
};

export type PostJournalEntryInput = {
  userId: string;
  transactionDate: string; // YYYY-MM-DD
  description: string;
  sourceType: 'manual' | 'recurring' | 'reconciliation' | 'ai_action' | 'loan_emi' | 'investment' | 'reversal';
  sourceId?: string | null;
  idempotencyKey: string;
  lines: JournalLineInput[];
  createdBy: string;
  metadata?: Record<string, any>;
};

export type PostReversalInput = {
  userId: string;
  originalEntryId: string;
  reason: string;
  idempotencyKey: string;
  createdBy: string;
  metadata?: Record<string, any>;
};

export type ValidationResult = 
  | { isValid: true; totalDebit: Decimal; totalCredit: Decimal; lineCount: number }
  | { isValid: false; error: string };

export type ReconciliationDiscrepancy = {
  accountId: string;
  accountName: string;
  cachedBalance: number;
  ledgerBalance: number;
  discrepancy: number;
  isReconciled: boolean;
};
