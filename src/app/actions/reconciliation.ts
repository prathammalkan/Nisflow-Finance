'use server';

import { createClient } from '@/lib/supabase/server';
import Decimal from 'decimal.js';

export interface ReconciliationPairInput {
  bankTxId: string;
  ledgerTxId: string;
}

export interface ExecuteReconciliationParams {
  accountId: string;
  statementBalance: number;
  ledgerBalance: number;
  difference: number;
  matchedPairs: ReconciliationPairInput[];
  unmatchedCount: number;
}

export interface ReconciliationResult {
  success: boolean;
  message?: string;
  error?: string;
  reconciliationId?: string;
}

/**
 * Server Action: Executes an atomic, tenant-isolated reconciliation confirmation.
 * Verifies authenticated session, validates account and transaction ownership,
 * executes batch updates with partial execution protection, and creates an audit record.
 */
export async function executeReconciliationServer(
  params: ExecuteReconciliationParams
): Promise<ReconciliationResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      success: false,
      error: 'Authentication required. Please sign in again.',
    };
  }

  const { accountId, statementBalance, ledgerBalance, difference, matchedPairs, unmatchedCount } = params;

  if (!accountId) {
    return { success: false, error: 'Account ID is required for reconciliation.' };
  }

  try {
    // 1. Verify account ownership
    const { data: account, error: accError } = await supabase
      .from('accounts')
      .select('id, name, user_id')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (accError || !account) {
      return { success: false, error: 'Account not found or access denied.' };
    }

    const ledgerIds = matchedPairs.map(p => p.ledgerTxId);
    const bankIds = matchedPairs.map(p => p.bankTxId);

    // SEC-01: Application-layer defense-in-depth ownership validation for bank_statement_transactions.
    // The schema has RLS on this table (via bank_statements.user_id), but we explicitly verify here too.
    // bank_statement_transactions has no user_id column; ownership is via statement_id → bank_statements.user_id.
    // We MUST verify ALL bankIds before touching any of them — partial failure would leave foreign rows mutated.
    if (bankIds.length > 0) {
      // Fetch the count of bank statement transactions that belong to this user's statements
      const { data: ownedBankTxs, error: bankOwnershipErr } = await (supabase.from('bank_statement_transactions') as any)
        .select('id')
        .in('id', bankIds)
        .in('statement_id',
          (supabase.from('bank_statements') as any).select('id').eq('user_id', user.id)
        );

      if (bankOwnershipErr) {
        return {
          success: false,
          error: 'Security Validation Error: Unable to verify bank statement transaction ownership.',
        };
      }

      if (!ownedBankTxs || ownedBankTxs.length !== bankIds.length) {
        // Some IDs not found under this user — could be foreign or non-existent. Reject all.
        return {
          success: false,
          error: 'Security Validation Error: One or more bank statement transactions do not belong to this account or user.',
        };
      }
    }

    // 2. Validate all ledger transactions belong to authenticated user & account
    if (ledgerIds.length > 0) {
      const { data: verifiedTxs, error: txValError } = await supabase
        .from('transactions')
        .select('id')
        .in('id', ledgerIds)
        .eq('user_id', user.id)
        .eq('account_id', accountId);

      if (txValError || !verifiedTxs || verifiedTxs.length !== ledgerIds.length) {
        return {
          success: false,
          error: 'Security Validation Error: One or more transactions do not belong to this account or user.',
        };
      }
    }

    const nowIso = new Date().toISOString();
    const todayIso = nowIso.split('T')[0];
    const isBalanced = new Decimal(difference).abs().lt(0.01);

    // Track modified IDs for rollback on failure
    const successfullyUpdatedBankIds: string[] = [];
    let ledgerUpdated = false;

    try {
      // 3. Mark matched statement transactions
      for (const pair of matchedPairs) {
        const { error: bankErr } = await (supabase.from('bank_statement_transactions') as any)
          .update({
            is_matched: true,
            matched_transaction_id: pair.ledgerTxId,
            updated_at: nowIso,
          })
          .eq('id', pair.bankTxId);

        if (bankErr) {
          throw new Error(`Failed to update bank statement item: ${bankErr.message}`);
        }
        successfullyUpdatedBankIds.push(pair.bankTxId);
      }

      // 4. Mark matched ledger transactions in batch
      if (ledgerIds.length > 0) {
        const { error: ledgerErr } = await (supabase.from('transactions') as any)
          .update({
            reconciliation_status: 'reconciled',
            status: 'reconciled',
            updated_at: nowIso,
          })
          .in('id', ledgerIds)
          .eq('user_id', user.id)
          .eq('account_id', accountId);

        if (ledgerErr) {
          throw new Error(`Failed to update ledger transactions: ${ledgerErr.message}`);
        }
        ledgerUpdated = true;
      }

      // 5. Create reconciliation audit record
      const { data: recData, error: recError } = await (supabase.from('reconciliations') as any)
        .insert({
          user_id: user.id,
          account_id: accountId,
          date: todayIso,
          statement_balance: statementBalance,
          ledger_balance: ledgerBalance,
          difference: difference,
          status: isBalanced ? 'balanced' : 'discrepancy',
          matched_count: matchedPairs.length,
          unmatched_count: unmatchedCount,
          completed_at: nowIso,
        })
        .select()
        .single();

      if (recError) {
        throw new Error(`Failed to record reconciliation: ${recError.message}`);
      }

      // 6. Update account last_reconciled_at
      await (supabase.from('accounts') as any)
        .update({
          last_reconciled_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', accountId)
        .eq('user_id', user.id);

      return {
        success: true,
        reconciliationId: recData?.id,
        message: 'Reconciliation confirmed and completed successfully.',
      };
    } catch (mutationErr: any) {
      // Partial execution rollback
      if (successfullyUpdatedBankIds.length > 0) {
        await (supabase.from('bank_statement_transactions') as any)
          .update({
            is_matched: false,
            matched_transaction_id: null,
            updated_at: new Date().toISOString(),
          })
          .in('id', successfullyUpdatedBankIds);
      }

      if (ledgerUpdated && ledgerIds.length > 0) {
        await (supabase.from('transactions') as any)
          .update({
            reconciliation_status: 'unreconciled',
            status: 'confirmed',
            updated_at: new Date().toISOString(),
          })
          .in('id', ledgerIds)
          .eq('user_id', user.id)
          .eq('account_id', accountId);
      }

      return {
        success: false,
        error: mutationErr.message || 'Reconciliation failed and was rolled back.',
      };
    }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unexpected server error during reconciliation.',
    };
  }
}
