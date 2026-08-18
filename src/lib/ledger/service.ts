import { Decimal } from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.ts';
import { postJournalEntry, postReversalEntry, validateJournalEntry } from './engine.ts';
import type { JournalLineInput, PostJournalEntryInput } from './types.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type FinancialTransactionType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'lending'
  | 'borrowing'
  | 'repayment'
  | 'settlement'
  | 'investment_purchase'
  | 'investment_sale'
  | 'dividend'
  | 'loan_emi'
  | 'opening_balance'
  | 'reconciliation_adjustment';

export interface RecordTransactionParams {
  userId: string;
  type: FinancialTransactionType;
  accountId: string;
  toAccountId?: string;
  categoryId?: string | null;
  counterpartyId?: string | null;
  amount: number | string;
  date: string;
  description: string;
  notes?: string | null;
  idempotencyKey: string;
  sourceType?: string;
  sourceId?: string;
  metadata?: Record<string, any>;
  // For loan EMI split
  principalAmount?: number | string;
  interestAmount?: number | string;
}

export interface RecordTransactionResult {
  success: boolean;
  journalEntryId?: string;
  transactionId?: string;
  error?: string;
  projectionSynced: boolean;
}

/**
 * Helper to ensure a corresponding ledger_account exists for a domain entity
 */
export async function ensureLedgerAccount(
  supabase: SupabaseClient<Database>,
  userId: string,
  params: {
    code: string;
    name: string;
    accountType: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
    entityType: string;
    entityId: string;
    currency?: string;
  }
): Promise<string> {
  // Check if ledger account already exists
  const { data: existing, error: findError } = await (supabase.from('ledger_accounts') as any)
    .select('id')
    .eq('user_id', userId)
    .eq('code', params.code)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return existing.id;
  }

  // Create new ledger account
  const { data: created, error: insertError } = await (supabase.from('ledger_accounts') as any)
    .insert({
      user_id: userId,
      code: params.code,
      name: params.name,
      account_type: params.accountType,
      entity_type: params.entityType,
      entity_id: params.entityId,
      currency: params.currency || 'INR',
      is_active: true,
    })
    .select('id')
    .single();

  if (insertError) {
    // Check if inserted concurrently
    const { data: retry } = await (supabase.from('ledger_accounts') as any)
      .select('id')
      .eq('user_id', userId)
      .eq('code', params.code)
      .single();
    if (retry?.id) return retry.id;
    throw new Error(`Failed to ensure ledger account ${params.code}: ${insertError.message}`);
  }

  return created.id;
}

/**
 * Single authoritative mutation pipeline for all financial transactions.
 * First commits to the immutable double-entry ledger, then updates legacy read projections.
 */
export async function recordFinancialTransaction(
  supabase: SupabaseClient<Database>,
  params: RecordTransactionParams
): Promise<RecordTransactionResult> {
  try {
    const decAmount = new Decimal(params.amount);
    if (decAmount.lte(0)) {
      return { success: false, error: 'Transaction amount must be strictly greater than ₹0.00', projectionSynced: false };
    }

    const formattedAmount = decAmount.toFixed(2);
    const txnDate = params.date ? params.date.split('T')[0] : new Date().toISOString().split('T')[0];

    // 1. Ensure source account ledger account
    const sourceLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
      code: `AST-ACC-${params.accountId}`,
      name: `Account ${params.accountId}`,
      accountType: 'asset',
      entityType: 'account',
      entityId: params.accountId,
    });

    let lines: JournalLineInput[] = [];

    // 2. Build double-entry balanced lines based on transaction type
    switch (params.type) {
      case 'expense': {
        const catId = params.categoryId || 'GENERAL';
        const expLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `EXP-CAT-${catId}`,
          name: `Expense Category ${catId}`,
          accountType: 'expense',
          entityType: 'category',
          entityId: catId,
        });

        // Dr Expense, Cr Asset
        lines = [
          { ledgerAccountId: expLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
          { ledgerAccountId: sourceLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
        ];
        break;
      }

      case 'income': {
        const catId = params.categoryId || 'GENERAL';
        const incLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `INC-CAT-${catId}`,
          name: `Income Category ${catId}`,
          accountType: 'income',
          entityType: 'category',
          entityId: catId,
        });

        // Dr Asset, Cr Income
        lines = [
          { ledgerAccountId: sourceLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
          { ledgerAccountId: incLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
        ];
        break;
      }

      case 'transfer': {
        if (!params.toAccountId) {
          return { success: false, error: 'Destination account is required for transfers', projectionSynced: false };
        }

        const destLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `AST-ACC-${params.toAccountId}`,
          name: `Account ${params.toAccountId}`,
          accountType: 'asset',
          entityType: 'account',
          entityId: params.toAccountId,
        });

        // Dr Destination Asset, Cr Source Asset (Net wealth change = ₹0.00)
        lines = [
          { ledgerAccountId: destLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
          { ledgerAccountId: sourceLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
        ];
        break;
      }

      case 'lending': {
        const personId = params.counterpartyId || 'GENERAL';
        const recLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `AST-REC-${personId}`,
          name: `Receivable: Person ${personId}`,
          accountType: 'asset',
          entityType: 'counterparty',
          entityId: personId,
        });

        // Dr Asset:Receivable, Cr Asset:Bank
        lines = [
          { ledgerAccountId: recLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
          { ledgerAccountId: sourceLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
        ];
        break;
      }

      case 'borrowing': {
        const personId = params.counterpartyId || 'GENERAL';
        const payLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `LIA-PAY-${personId}`,
          name: `Payable: Person ${personId}`,
          accountType: 'liability',
          entityType: 'counterparty',
          entityId: personId,
        });

        // Dr Asset:Bank, Cr Liability:Payable
        lines = [
          { ledgerAccountId: sourceLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
          { ledgerAccountId: payLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
        ];
        break;
      }

      case 'repayment':
      case 'settlement': {
        const personId = params.counterpartyId || 'GENERAL';
        // Check if receiving repayment (money in) or making repayment (money out)
        const isReceiving = params.metadata?.direction === 'in' || !params.metadata?.isDebtRepayment;

        if (isReceiving) {
          const recLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
            code: `AST-REC-${personId}`,
            name: `Receivable: Person ${personId}`,
            accountType: 'asset',
            entityType: 'counterparty',
            entityId: personId,
          });
          // Dr Asset:Bank, Cr Asset:Receivable
          lines = [
            { ledgerAccountId: sourceLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
            { ledgerAccountId: recLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
          ];
        } else {
          const payLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
            code: `LIA-PAY-${personId}`,
            name: `Payable: Person ${personId}`,
            accountType: 'liability',
            entityType: 'counterparty',
            entityId: personId,
          });
          // Dr Liability:Payable, Cr Asset:Bank
          lines = [
            { ledgerAccountId: payLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
            { ledgerAccountId: sourceLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
          ];
        }
        break;
      }

      case 'loan_emi': {
        const loanId = params.metadata?.loanId || 'GENERAL';
        const principal = new Decimal(params.principalAmount || params.amount);
        const interest = new Decimal(params.interestAmount || 0);

        if (!principal.plus(interest).equals(decAmount)) {
          return { success: false, error: 'Principal plus interest must equal total EMI amount exactly', projectionSynced: false };
        }

        const loanLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `LIA-LOAN-${loanId}`,
          name: `Loan Liability ${loanId}`,
          accountType: 'liability',
          entityType: 'loan',
          entityId: loanId,
        });

        const intExpAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `EXP-LOAN-INT-${loanId}`,
          name: `Loan Interest Expense ${loanId}`,
          accountType: 'expense',
          entityType: 'loan_interest',
          entityId: loanId,
        });

        lines = [
          { ledgerAccountId: loanLedgerAccId, debitAmount: principal.toFixed(2), creditAmount: '0.00', memo: 'Loan Principal Repayment' },
          { ledgerAccountId: intExpAccId, debitAmount: interest.toFixed(2), creditAmount: '0.00', memo: 'Loan Interest' },
          { ledgerAccountId: sourceLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
        ];
        break;
      }

      case 'investment_purchase': {
        const invId = params.metadata?.investmentId || 'GENERAL';
        const invLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `AST-INV-${invId}`,
          name: `Investment Asset ${invId}`,
          accountType: 'asset',
          entityType: 'investment',
          entityId: invId,
        });

        // Dr Asset:Investment, Cr Asset:Bank
        lines = [
          { ledgerAccountId: invLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
          { ledgerAccountId: sourceLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
        ];
        break;
      }

      case 'investment_sale': {
        const invId = params.metadata?.investmentId || 'GENERAL';
        const invLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `AST-INV-${invId}`,
          name: `Investment Asset ${invId}`,
          accountType: 'asset',
          entityType: 'investment',
          entityId: invId,
        });

        // Dr Asset:Bank, Cr Asset:Investment
        lines = [
          { ledgerAccountId: sourceLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
          { ledgerAccountId: invLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
        ];
        break;
      }

      case 'dividend': {
        const incLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `INC-DIVIDEND`,
          name: `Investment Dividend Income`,
          accountType: 'income',
          entityType: 'dividend',
          entityId: 'DIVIDEND',
        });

        // Dr Asset:Bank, Cr Income:Dividend
        lines = [
          { ledgerAccountId: sourceLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
          { ledgerAccountId: incLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
        ];
        break;
      }

      case 'opening_balance': {
        const eqLedgerAccId = await ensureLedgerAccount(supabase, params.userId, {
          code: `EQU-OPEN-BAL`,
          name: `Opening Balance Equity`,
          accountType: 'equity',
          entityType: 'opening_balance',
          entityId: 'OPENING_BAL',
        });

        // Dr Asset:Account, Cr Equity:Opening Balance
        lines = [
          { ledgerAccountId: sourceLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
          { ledgerAccountId: eqLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
        ];
        break;
      }

      case 'reconciliation_adjustment': {
        const isPositive = params.metadata?.isPositive ?? true;
        if (isPositive) {
          const incRecId = await ensureLedgerAccount(supabase, params.userId, {
            code: `INC-RECON-ADJ`,
            name: `Reconciliation Adjustment (Surplus)`,
            accountType: 'income',
            entityType: 'reconciliation',
            entityId: 'RECON_INC',
          });
          // Dr Asset:Bank, Cr Income:Recon Adjustment
          lines = [
            { ledgerAccountId: sourceLedgerAccId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
            { ledgerAccountId: incRecId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
          ];
        } else {
          const expRecId = await ensureLedgerAccount(supabase, params.userId, {
            code: `EXP-RECON-ADJ`,
            name: `Reconciliation Adjustment (Shortfall)`,
            accountType: 'expense',
            entityType: 'reconciliation',
            entityId: 'RECON_EXP',
          });
          // Dr Expense:Recon Adjustment, Cr Asset:Bank
          lines = [
            { ledgerAccountId: expRecId, debitAmount: formattedAmount, creditAmount: '0.00', memo: params.description },
            { ledgerAccountId: sourceLedgerAccId, debitAmount: '0.00', creditAmount: formattedAmount, memo: params.description },
          ];
        }
        break;
      }

      default:
        return { success: false, error: `Unsupported transaction type: ${params.type}`, projectionSynced: false };
    }

    // 3. Post to Authoritative Double-Entry Ledger
    const postPayload: PostJournalEntryInput = {
      userId: params.userId,
      transactionDate: txnDate,
      description: params.description,
      sourceType: (params.sourceType as any) || 'manual',
      sourceId: params.sourceId || null,
      idempotencyKey: params.idempotencyKey,
      lines,
      createdBy: params.userId,
      metadata: params.metadata || {},
    };

    const postResult = await postJournalEntry(supabase, postPayload);
    if (!postResult.success) {
      return {
        success: false,
        error: postResult.error || 'Failed to post entry to authoritative ledger',
        projectionSynced: false,
      };
    }

    const journalEntryId = postResult.entryId;

    // 4. Synchronize Legacy Read-Model Projection (transactions table)
    let projectionSynced = false;
    let createdTxId: string | undefined;

    try {
      const direction = params.type === 'income' || (params.type === 'settlement' && params.metadata?.direction === 'in') ? 'in' : 'out';
      const legacyTxType = params.type === 'transfer' ? 'transfer' : direction === 'in' ? 'income' : 'expense';

      const { data: legacyTx, error: txError } = await (supabase.from('transactions') as any)
        .insert({
          user_id: params.userId,
          account_id: params.accountId,
          category_id: params.categoryId || null,
          counterparty_id: params.counterpartyId || null,
          amount: decAmount.toNumber(),
          type: legacyTxType,
          direction,
          description: params.description,
          notes: params.notes ? `${params.notes} [Ledger: ${journalEntryId}]` : `[Ledger: ${journalEntryId}]`,
          date: txnDate,
          status: 'confirmed',
          bank_reference: params.idempotencyKey,
        })
        .select('id')
        .single();

      if (!txError && legacyTx) {
        projectionSynced = true;
        createdTxId = legacyTx.id;
      } else {
        console.warn('Projection sync warning: Legacy transaction insert encountered an issue, but ledger entry is securely posted:', txError?.message);
      }
    } catch (projErr: any) {
      console.warn('Projection sync error:', projErr.message);
    }

    return {
      success: true,
      journalEntryId,
      transactionId: createdTxId,
      projectionSynced,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unexpected error during transaction posting',
      projectionSynced: false,
    };
  }
}

/**
 * Reverses a posted financial transaction through the immutable ledger engine.
 */
export async function reverseFinancialTransaction(
  supabase: SupabaseClient<Database>,
  params: {
    userId: string;
    journalEntryId: string;
    reason: string;
    idempotencyKey: string;
  }
): Promise<{ success: boolean; reversalEntryId?: string; error?: string }> {
  try {
    const revResult = await postReversalEntry(supabase, {
      userId: params.userId,
      originalEntryId: params.journalEntryId,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey,
      createdBy: params.userId,
    });

    if (!revResult.success) {
      return { success: false, error: revResult.error || 'Failed to post reversal entry' };
    }

    const reversalEntryId = revResult.reversalEntryId;

    // Update legacy projection status
    await (supabase.from('transactions') as any)
      .update({ status: 'cancelled' })
      .eq('user_id', params.userId)
      .ilike('notes', `%${params.journalEntryId}%`);

    return {
      success: true,
      reversalEntryId: revResult.reversalEntryId,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Unexpected error during reversal',
    };
  }
}

/**
 * Reusable zero-tolerance integrity audit comparing authoritative ledger balances against cached projections.
 */
export async function verifyFinancialIntegrity(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{
  isIntegrityVerified: boolean;
  totalAccountsChecked: number;
  discrepancies: Array<{
    accountId: string;
    accountName: string;
    cachedBalance: number;
    ledgerBalance: number;
    discrepancy: number;
  }>;
}> {
  const { data: recData, error } = await supabase.rpc('reconcile_ledger_balances', {
    p_user_id: userId,
  } as any);

  if (error) {
    throw new Error(`Integrity check failed: ${error.message}`);
  }

  const discrepancies: Array<any> = [];
  const rows = (recData as any) || [];

  for (const row of rows) {
    const diff = new Decimal(row.discrepancy || 0).abs().toNumber();
    if (diff !== 0) {
      discrepancies.push({
        accountId: row.account_id,
        accountName: row.account_name,
        cachedBalance: Number(row.cached_balance || 0),
        ledgerBalance: Number(row.ledger_balance || 0),
        discrepancy: Number(row.discrepancy || 0),
      });
    }
  }

  return {
    isIntegrityVerified: discrepancies.length === 0,
    totalAccountsChecked: rows.length,
    discrepancies,
  };
}
