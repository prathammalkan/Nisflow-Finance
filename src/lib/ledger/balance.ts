import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';
import type { ReconciliationDiscrepancy } from './types';

/**
 * Derives the authoritative balance of a ledger account from posted journal lines.
 */
export async function getLedgerAccountBalance(
  supabase: SupabaseClient<Database>,
  ledgerAccountId: string
): Promise<number> {
  const { data, error } = await supabase.rpc('get_ledger_account_balance', {
    p_ledger_account_id: ledgerAccountId,
  } as any);

  if (error) throw error;
  return Number(data || 0);
}

/**
 * Runs zero-tolerance discrepancy detection comparing cached account balances vs ledger derived balances.
 */
export async function reconcileLedgerBalances(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<ReconciliationDiscrepancy[]> {
  const { data, error } = await supabase.rpc('reconcile_ledger_balances', {
    p_user_id: userId,
  } as any);

  if (error) throw error;

  return ((data as any[]) || []).map((row: any) => ({
    accountId: row.account_id,
    accountName: row.account_name,
    cachedBalance: Number(row.cached_balance || 0),
    ledgerBalance: Number(row.ledger_balance || 0),
    discrepancy: Number(row.discrepancy || 0),
    isReconciled: Boolean(row.is_reconciled),
  }));
}
