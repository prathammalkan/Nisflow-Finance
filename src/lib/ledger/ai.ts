import { Decimal } from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.ts';
import { recordFinancialTransaction, reverseFinancialTransaction } from './service.ts';
import { recordLending, recordBorrowing, recordRepayment } from './people.ts';
import { recordLoanEMI } from './loans.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type AIActionType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'lending'
  | 'borrowing'
  | 'receivable_repayment'
  | 'payable_repayment'
  | 'loan_emi'
  | 'investment_buy'
  | 'investment_sell'
  | 'investment_dividend'
  | 'reversal';

export interface AIFinancialActionPayload {
  actionType: AIActionType;
  actionId?: string;
  amount: number | string;
  currency?: string;
  description?: string;
  date?: string;
  notes?: string;

  // Account references
  accountId?: string;
  accountName?: string;
  toAccountId?: string;
  toAccountName?: string;

  // People references
  personId?: string;
  personName?: string;
  repaymentId?: string;

  // Loan references
  loanId?: string;
  loanName?: string;
  principalAmount?: number | string;
  interestAmount?: number | string;

  // Investment references
  assetSymbol?: string;
  assetName?: string;
  quantity?: number | string;
  pricePerUnit?: number | string;
  holdingAccountId?: string;
  costBasis?: number | string;
  realizedGainLoss?: number | string;

  // Reversal references
  originalJournalEntryId?: string;
  reversalReason?: string;
}

export interface ExecuteAIActionResult {
  success: boolean;
  journalEntryId?: string;
  reversalEntryId?: string;
  actionType: AIActionType;
  message: string;
  error?: string;
}

/**
 * Validates and executes a confirmed AI financial action through authoritative domain services.
 * Strictly enforces user ownership, deterministic idempotency, and double-entry consistency.
 */
export async function executeAIFinancialAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  messageId: string,
  action: AIFinancialActionPayload
): Promise<ExecuteAIActionResult> {
  if (!userId) {
    return { success: false, actionType: action?.actionType || 'expense', message: 'Authentication required', error: 'User is not authenticated' };
  }

  if (!action || !action.actionType) {
    return { success: false, actionType: 'expense', message: 'Invalid action payload', error: 'Malformed AI action: missing actionType' };
  }

  try {
    // 1. Deterministic Idempotency Key
    const stableActionId = action.actionId || 'default';
    const idempotencyKey = `AI:${userId}:${messageId}:${action.actionType}:${stableActionId}`;
    const txnDate = action.date ? action.date.split('T')[0] : new Date().toISOString().split('T')[0];

    // 2. Validate Amount
    let decAmount = new Decimal(action.amount || 0);
    if (action.actionType === 'loan_emi' && decAmount.lte(0) && (action.principalAmount || action.interestAmount)) {
      const p = new Decimal(action.principalAmount || 0);
      const i = new Decimal(action.interestAmount || 0);
      decAmount = p.plus(i);
    }

    if (action.actionType !== 'reversal') {
      if (decAmount.lte(0)) {
        return {
          success: false,
          actionType: action.actionType,
          message: 'Invalid amount',
          error: 'Financial transaction amount must be strictly greater than ₹0.00',
        };
      }
      if (decAmount.decimalPlaces() > 2) {
        return {
          success: false,
          actionType: action.actionType,
          message: 'Invalid precision',
          error: 'Amount exceeds INR 2-decimal paise precision',
        };
      }
    }

    // 3. Resolve Source Account
    let sourceAccountId = action.accountId;
    if (!sourceAccountId && action.accountName) {
      const { data: matchedAcc } = await (supabase.from('accounts') as any)
        .select('id, user_id')
        .eq('user_id', userId)
        .ilike('name', `%${action.accountName}%`)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (matchedAcc) sourceAccountId = matchedAcc.id;
    }

    // Fallback to primary active account if not specified
    if (!sourceAccountId && !['reversal'].includes(action.actionType)) {
      const { data: defaultAcc } = await (supabase.from('accounts') as any)
        .select('id, user_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (defaultAcc) sourceAccountId = defaultAcc.id;
    }

    // Verify Source Account Ownership
    if (sourceAccountId) {
      const { data: ownedAcc } = await (supabase.from('accounts') as any)
        .select('id, user_id')
        .eq('id', sourceAccountId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!ownedAcc) {
        return {
          success: false,
          actionType: action.actionType,
          message: 'Account security violation',
          error: `Security Violation: Source account ${sourceAccountId} does not belong to authenticated user.`,
        };
      }
    }

    // 4. Resolve Counterparty / Person if required
    let counterpartyId = action.personId;
    if (!counterpartyId && action.personName) {
      const { data: existingCp } = await (supabase.from('counterparties') as any)
        .select('id, user_id')
        .eq('user_id', userId)
        .ilike('name', action.personName.trim())
        .limit(1)
        .maybeSingle();

      if (existingCp) {
        counterpartyId = existingCp.id;
      } else if (['lending', 'borrowing', 'receivable_repayment', 'payable_repayment'].includes(action.actionType)) {
        // Create counterparty under authenticated user
        const { data: createdCp, error: cpCreateErr } = await (supabase.from('counterparties') as any)
          .insert({
            user_id: userId,
            name: action.personName.trim(),
            type: 'Other',
          })
          .select('id')
          .single();

        if (cpCreateErr || !createdCp) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Counterparty creation failed',
            error: cpCreateErr?.message || 'Could not provision counterparty',
          };
        }
        counterpartyId = createdCp.id;
      }
    }

    // 5. Dispatch to Authoritative Domain Services
    switch (action.actionType) {
      case 'expense':
      case 'income': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Account required', error: 'An active account is required to record transaction.' };
        }

        const res = await recordFinancialTransaction(supabase, {
          userId,
          type: action.actionType,
          accountId: sourceAccountId,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `${action.actionType.toUpperCase()} via NisFlow AI`,
          notes: action.notes,
          idempotencyKey,
          sourceType: 'ai_action',
        });

        if (!res.success) {
          return { success: false, actionType: action.actionType, message: 'Transaction failed', error: res.error };
        }

        return {
          success: true,
          journalEntryId: res.journalEntryId,
          actionType: action.actionType,
          message: `Recorded ${action.actionType} of ₹${decAmount.toFixed(2)} in double-entry ledger.`,
        };
      }

      case 'transfer': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Source account required', error: 'Source account is required for transfer.' };
        }

        let toAccountId = action.toAccountId;
        if (!toAccountId && action.toAccountName) {
          const { data: matchedDest } = await (supabase.from('accounts') as any)
            .select('id, user_id')
            .eq('user_id', userId)
            .ilike('name', `%${action.toAccountName}%`)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (matchedDest) toAccountId = matchedDest.id;
        }

        if (!toAccountId) {
          return { success: false, actionType: action.actionType, message: 'Destination account required', error: 'Destination account is required for transfer.' };
        }

        // Verify Destination Account Ownership
        const { data: destAcc } = await (supabase.from('accounts') as any)
          .select('id, user_id')
          .eq('id', toAccountId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!destAcc) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Destination account security violation',
            error: `Security Violation: Destination account ${toAccountId} does not belong to authenticated user.`,
          };
        }

        const res = await recordFinancialTransaction(supabase, {
          userId,
          type: 'transfer',
          accountId: sourceAccountId,
          toAccountId,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Transfer to ${action.toAccountName || toAccountId}`,
          notes: action.notes,
          idempotencyKey,
          sourceType: 'ai_action',
        });

        if (!res.success) {
          return { success: false, actionType: action.actionType, message: 'Transfer failed', error: res.error };
        }

        return {
          success: true,
          journalEntryId: res.journalEntryId,
          actionType: action.actionType,
          message: `Transferred ₹${decAmount.toFixed(2)} between accounts in double-entry ledger.`,
        };
      }

      case 'lending': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Account required', error: 'An active account is required to lend money.' };
        }
        if (!counterpartyId) {
          return { success: false, actionType: action.actionType, message: 'Person required', error: 'Counterparty / Person is required to record lending.' };
        }

        const lendRes = await recordLending(supabase, {
          userId,
          accountId: sourceAccountId,
          counterpartyId,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Lent money to ${action.personName || 'person'}`,
          notes: action.notes,
          receivableId: `ai-rec-${messageId}-${stableActionId}`,
        });

        if (!lendRes.success) {
          return { success: false, actionType: action.actionType, message: 'Lending failed', error: lendRes.error };
        }

        return {
          success: true,
          journalEntryId: lendRes.journalEntryId,
          actionType: action.actionType,
          message: `Recorded receivable of ₹${decAmount.toFixed(2)} in People Ledger.`,
        };
      }

      case 'borrowing': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Account required', error: 'An active account is required to receive borrowed money.' };
        }
        if (!counterpartyId) {
          return { success: false, actionType: action.actionType, message: 'Person required', error: 'Counterparty / Person is required to record borrowing.' };
        }

        const borrowRes = await recordBorrowing(supabase, {
          userId,
          accountId: sourceAccountId,
          counterpartyId,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Borrowed money from ${action.personName || 'person'}`,
          notes: action.notes,
          payableId: `ai-pay-${messageId}-${stableActionId}`,
        });

        if (!borrowRes.success) {
          return { success: false, actionType: action.actionType, message: 'Borrowing failed', error: borrowRes.error };
        }

        return {
          success: true,
          journalEntryId: borrowRes.journalEntryId,
          actionType: action.actionType,
          message: `Recorded payable of ₹${decAmount.toFixed(2)} in People Ledger.`,
        };
      }

      case 'receivable_repayment': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Account required', error: 'An active account is required to receive repayment.' };
        }
        if (!counterpartyId) {
          return { success: false, actionType: action.actionType, message: 'Person required', error: 'Counterparty is required for repayment.' };
        }

        const repayRes = await recordRepayment(supabase, {
          userId,
          accountId: sourceAccountId,
          counterpartyId,
          amount: decAmount.toFixed(2),
          direction: 'in',
          date: txnDate,
          description: action.description || `Repayment received from ${action.personName || 'person'}`,
          notes: action.notes,
          repaymentId: action.repaymentId || `ai-repay-in-${messageId}-${stableActionId}`,
        });

        if (!repayRes.success) {
          return { success: false, actionType: action.actionType, message: 'Repayment failed', error: repayRes.error };
        }

        return {
          success: true,
          journalEntryId: repayRes.journalEntryId,
          actionType: action.actionType,
          message: `Recorded ₹${decAmount.toFixed(2)} receivable repayment in People Ledger.`,
        };
      }

      case 'payable_repayment': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Account required', error: 'An active account is required to pay debt.' };
        }
        if (!counterpartyId) {
          return { success: false, actionType: action.actionType, message: 'Person required', error: 'Counterparty is required for debt repayment.' };
        }

        const repayRes = await recordRepayment(supabase, {
          userId,
          accountId: sourceAccountId,
          counterpartyId,
          amount: decAmount.toFixed(2),
          direction: 'out',
          date: txnDate,
          description: action.description || `Debt repayment paid to ${action.personName || 'person'}`,
          notes: action.notes,
          repaymentId: action.repaymentId || `ai-repay-out-${messageId}-${stableActionId}`,
        });

        if (!repayRes.success) {
          return { success: false, actionType: action.actionType, message: 'Debt repayment failed', error: repayRes.error };
        }

        return {
          success: true,
          journalEntryId: repayRes.journalEntryId,
          actionType: action.actionType,
          message: `Recorded ₹${decAmount.toFixed(2)} payable repayment in People Ledger.`,
        };
      }

      case 'loan_emi': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Account required', error: 'An active account is required to pay loan EMI.' };
        }

        let loanId = action.loanId;
        if (!loanId && action.loanName) {
          const { data: matchedLoan } = await (supabase.from('loans') as any)
            .select('id, user_id')
            .eq('user_id', userId)
            .ilike('name', `%${action.loanName}%`)
            .limit(1)
            .maybeSingle();

          if (matchedLoan) loanId = matchedLoan.id;
        }

        if (!loanId) {
          return { success: false, actionType: action.actionType, message: 'Loan required', error: 'Loan ID or valid loan name is required for EMI payment.' };
        }

        // Verify loan ownership
        const { data: ownedLoan } = await (supabase.from('loans') as any)
          .select('id, user_id')
          .eq('id', loanId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!ownedLoan) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Loan security violation',
            error: `Security Violation: Loan ${loanId} does not belong to authenticated user.`,
          };
        }

        const principalDec = new Decimal(action.principalAmount || decAmount);
        const interestDec = new Decimal(action.interestAmount || 0);
        const totalEMI = principalDec.plus(interestDec);

        try {
          const emiRes = await recordLoanEMI(supabase, {
            userId,
            loanId,
            accountId: sourceAccountId,
            principalAmount: principalDec.toFixed(2),
            interestAmount: interestDec.toFixed(2),
            totalAmount: totalEMI.toFixed(2),
            date: txnDate,
            description: action.description || `EMI Payment: ${action.loanName || loanId}`,
            notes: action.notes,
            idempotencyKey,
          });

          return {
            success: true,
            journalEntryId: emiRes.journalEntryId,
            actionType: action.actionType,
            message: `Recorded EMI of ₹${totalEMI.toFixed(2)} (Principal: ₹${principalDec.toFixed(2)}, Interest: ₹${interestDec.toFixed(2)}) in Loan Ledger.`,
          };
        } catch (loanErr: any) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Loan EMI failed',
            error: loanErr.message || 'Failed to record loan EMI',
          };
        }
      }

      case 'investment_buy': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Source account required', error: 'Funding bank/cash account required for investment purchase.' };
        }

        let invAccountId = action.holdingAccountId;
        if (!invAccountId) {
          // Find investment account
          const { data: invAcc } = await (supabase.from('accounts') as any)
            .select('id, user_id')
            .eq('user_id', userId)
            .eq('type', 'investment')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (invAcc) invAccountId = invAcc.id;
        }

        if (!invAccountId) {
          return { success: false, actionType: action.actionType, message: 'Investment account required', error: 'An active investment account is required for buying assets.' };
        }

        // Verify Investment Account Ownership
        const { data: ownedInvAcc } = await (supabase.from('accounts') as any)
          .select('id, user_id')
          .eq('id', invAccountId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!ownedInvAcc) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Investment account security violation',
            error: `Security Violation: Investment account ${invAccountId} does not belong to authenticated user.`,
          };
        }

        const res = await recordFinancialTransaction(supabase, {
          userId,
          type: 'investment_purchase',
          accountId: sourceAccountId,
          toAccountId: invAccountId,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Buy ${action.assetSymbol || action.assetName || 'Investment'}`,
          notes: action.notes,
          metadata: {
            assetSymbol: action.assetSymbol,
            assetName: action.assetName,
            quantity: action.quantity,
            pricePerUnit: action.pricePerUnit,
          },
          idempotencyKey,
          sourceType: 'investment_purchase',
        });

        if (!res.success) {
          return { success: false, actionType: action.actionType, message: 'Investment purchase failed', error: res.error };
        }

        return {
          success: true,
          journalEntryId: res.journalEntryId,
          actionType: action.actionType,
          message: `Recorded purchase of ${action.assetSymbol || 'investment'} (₹${decAmount.toFixed(2)}) in Investment Ledger.`,
        };
      }

      case 'investment_sell': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Destination account required', error: 'Destination bank/cash account required for investment proceeds.' };
        }

        let invAccountId = action.holdingAccountId;
        if (!invAccountId) {
          const { data: invAcc } = await (supabase.from('accounts') as any)
            .select('id, user_id')
            .eq('user_id', userId)
            .eq('type', 'investment')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (invAcc) invAccountId = invAcc.id;
        }

        if (!invAccountId) {
          return { success: false, actionType: action.actionType, message: 'Investment account required', error: 'An active investment account is required for selling assets.' };
        }

        // Verify Investment Account Ownership
        const { data: ownedInvAcc } = await (supabase.from('accounts') as any)
          .select('id, user_id')
          .eq('id', invAccountId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!ownedInvAcc) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Investment account security violation',
            error: `Security Violation: Investment account ${invAccountId} does not belong to authenticated user.`,
          };
        }

        const costBasis = action.costBasis !== undefined ? new Decimal(action.costBasis).toFixed(2) : decAmount.toFixed(2);
        const realizedGain = action.realizedGainLoss !== undefined ? new Decimal(action.realizedGainLoss).toFixed(2) : '0.00';

        const res = await recordFinancialTransaction(supabase, {
          userId,
          type: 'investment_sale',
          accountId: invAccountId, // Dr Bank, Cr Investment
          toAccountId: sourceAccountId,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Sell ${action.assetSymbol || action.assetName || 'Investment'}`,
          notes: action.notes,
          metadata: {
            assetSymbol: action.assetSymbol,
            assetName: action.assetName,
            quantity: action.quantity,
            pricePerUnit: action.pricePerUnit,
            costBasis,
            realizedGainLoss: realizedGain,
          },
          idempotencyKey,
          sourceType: 'investment_sale',
        });

        if (!res.success) {
          return { success: false, actionType: action.actionType, message: 'Investment sale failed', error: res.error };
        }

        return {
          success: true,
          journalEntryId: res.journalEntryId,
          actionType: action.actionType,
          message: `Recorded sale of ${action.assetSymbol || 'investment'} (₹${decAmount.toFixed(2)}) in Investment Ledger.`,
        };
      }

      case 'investment_dividend': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Account required', error: 'An active account is required to receive dividend.' };
        }

        const res = await recordFinancialTransaction(supabase, {
          userId,
          type: 'income',
          accountId: sourceAccountId,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Dividend: ${action.assetSymbol || action.assetName || 'Shares'}`,
          notes: action.notes,
          idempotencyKey,
          sourceType: 'dividend',
        });

        if (!res.success) {
          return { success: false, actionType: action.actionType, message: 'Dividend recording failed', error: res.error };
        }

        return {
          success: true,
          journalEntryId: res.journalEntryId,
          actionType: action.actionType,
          message: `Recorded dividend income of ₹${decAmount.toFixed(2)} in double-entry ledger.`,
        };
      }

      case 'reversal': {
        if (!action.originalJournalEntryId) {
          return { success: false, actionType: action.actionType, message: 'Entry ID required', error: 'Original journal entry ID is required for reversal.' };
        }

        const revRes = await reverseFinancialTransaction(supabase, {
          userId,
          journalEntryId: action.originalJournalEntryId,
          reason: action.reversalReason || action.description || 'Reversal requested via AI assistant',
          idempotencyKey,
        });

        if (!revRes.success) {
          return { success: false, actionType: action.actionType, message: 'Reversal failed', error: revRes.error };
        }

        return {
          success: true,
          reversalEntryId: revRes.reversalEntryId,
          actionType: action.actionType,
          message: `Successfully reversed journal entry ${action.originalJournalEntryId}.`,
        };
      }

      default:
        return {
          success: false,
          actionType: action.actionType,
          message: 'Unsupported action type',
          error: `AI action type '${(action as any).actionType}' is not supported.`,
        };
    }
  } catch (err: any) {
    return {
      success: false,
      actionType: action.actionType || 'expense',
      message: 'Unexpected execution error',
      error: err.message || 'An unexpected error occurred during AI action execution',
    };
  }
}
