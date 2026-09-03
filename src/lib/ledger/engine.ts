import { Decimal } from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';
import type {
  PostJournalEntryInput,
  PostReversalInput,
  ValidationResult,
  JournalLineInput,
} from './types';

// Strict decimal precision configuration for financial math
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * Validates a candidate double-entry journal payload mathematically.
 * Ensures:
 * 1. At least 2 journal lines.
 * 2. Exact SUM(debit) === SUM(credit).
 * 3. Exact paise-level precision (max 2 decimal places, e.g. ₹0.01).
 * 4. Non-negative amounts.
 * 5. Strict debit XOR credit per line.
 * 6. Total entry amount strictly > 0.
 */
export function validateJournalEntry(lines: JournalLineInput[]): ValidationResult {
  if (!lines || !Array.isArray(lines) || lines.length < 2) {
    return {
      isValid: false,
      error: `A journal entry must contain at least 2 lines (found ${lines?.length || 0}).`,
    };
  }

  let totalDebit = new Decimal(0);
  let totalCredit = new Decimal(0);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.ledgerAccountId || typeof line.ledgerAccountId !== 'string') {
      return {
        isValid: false,
        error: `Line ${i + 1} is missing a valid ledgerAccountId.`,
      };
    }

    let debit: Decimal;
    let credit: Decimal;

    try {
      debit = new Decimal(line.debitAmount || 0);
      credit = new Decimal(line.creditAmount || 0);
    } catch {
      return {
        isValid: false,
        error: `Line ${i + 1} contains non-numeric monetary amounts.`,
      };
    }

    // Check for NaN or non-finite numbers
    if (!debit.isFinite() || !credit.isFinite()) {
      return {
        isValid: false,
        error: `Line ${i + 1} contains non-finite monetary values.`,
      };
    }

    // Check for negative amounts
    if (debit.isNegative() || credit.isNegative()) {
      return {
        isValid: false,
        error: `Line ${i + 1} has negative amounts. Debit and credit amounts must be >= 0.`,
      };
    }

    // Check precision (max 2 decimal places in INR)
    if (debit.decimalPlaces() > 2 || credit.decimalPlaces() > 2) {
      return {
        isValid: false,
        error: `Line ${i + 1} exceeds INR 2-decimal precision (paise). Fractional paise is not supported.`,
      };
    }

    // Check XOR: exactly one of debit or credit must be positive
    const hasDebit = debit.gt(0);
    const hasCredit = credit.gt(0);

    if ((hasDebit && hasCredit) || (!hasDebit && !hasCredit)) {
      return {
        isValid: false,
        error: `Line ${i + 1} must have strictly positive debit OR credit, not both or zero.`,
      };
    }

    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
  }

  // Check balancing invariant: SUM(debits) === SUM(credits)
  if (!totalDebit.equals(totalCredit)) {
    const diff = totalDebit.minus(totalCredit);
    return {
      isValid: false,
      error: `Unbalanced journal entry. Total Debits (₹${totalDebit.toFixed(2)}) != Total Credits (₹${totalCredit.toFixed(2)}). Discrepancy: ₹${diff.toFixed(2)}.`,
    };
  }

  if (totalDebit.isZero()) {
    return {
      isValid: false,
      error: 'Total journal entry amount must be strictly greater than ₹0.00.',
    };
  }

  return {
    isValid: true,
    totalDebit,
    totalCredit,
    lineCount: lines.length,
  };
}

/**
 * Single authoritative server-side interface for posting immutable journal entries.
 * All mutations (manual, recurring, reconciliation, AI, loans, investments) route through here.
 */
export async function postJournalEntry(
  supabase: SupabaseClient<Database>,
  input: PostJournalEntryInput
): Promise<{ success: true; entryId: string } | { success: false; error: string }> {
  // Pre-validate locally with Decimal.js
  const validation = validateJournalEntry(input.lines);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  if (!input.idempotencyKey || typeof input.idempotencyKey !== 'string' || input.idempotencyKey.trim() === '') {
    return { success: false, error: 'Deterministic idempotencyKey is required for financial mutations.' };
  }

  // Format lines for PostgreSQL JSONB
  const formattedLines = input.lines.map((l) => ({
    ledger_account_id: l.ledgerAccountId,
    debit_amount: new Decimal(l.debitAmount || 0).toNumber(),
    credit_amount: new Decimal(l.creditAmount || 0).toNumber(),
    currency: l.currency || 'INR',
    memo: l.memo || null,
  }));

  try {
    const { data, error } = await supabase.rpc('post_journal_entry', {
      p_user_id: input.userId,
      p_transaction_date: input.transactionDate,
      p_description: input.description,
      p_source_type: input.sourceType,
      p_source_id: input.sourceId || null,
      p_idempotency_key: input.idempotencyKey,
      p_lines: formattedLines,
      p_created_by: input.createdBy,
      p_metadata: input.metadata || {},
    } as any);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, entryId: data as string };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown database error during journal posting.' };
  }
}

/**
 * Posts an immutable corrective reversal entry.
 * Never deletes or updates posted transaction lines.
 */
export async function postReversalEntry(
  supabase: SupabaseClient<Database>,
  input: PostReversalInput
): Promise<{ success: true; reversalEntryId: string } | { success: false; error: string }> {
  if (!input.originalEntryId) {
    return { success: false, error: 'originalEntryId is required for reversals.' };
  }
  if (!input.reason || input.reason.trim() === '') {
    return { success: false, error: 'A valid audit reason is required for financial reversals.' };
  }
  if (!input.idempotencyKey) {
    return { success: false, error: 'idempotencyKey is required for reversal operation.' };
  }

  try {
    const { data, error } = await supabase.rpc('post_reversal_entry', {
      p_user_id: input.userId,
      p_original_entry_id: input.originalEntryId,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey,
      p_created_by: input.createdBy,
      p_metadata: input.metadata || {},
    } as any);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, reversalEntryId: data as string };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown database error during reversal posting.' };
  }
}
