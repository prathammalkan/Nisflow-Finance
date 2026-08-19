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
  holdingAccountName?: string;
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
        return { success: false, actionType: action.actionType, message: 'Invalid amount', error: 'Action amount must be strictly greater than ₹0.00' };
      }
      if (decAmount.decimalPlaces() > 2) {
        return { success: false, actionType: action.actionType, message: 'Invalid precision', error: 'Amount exceeds INR 2-decimal paise precision' };
      }
    }

    // 3. Resolve & Verify Source Account (if applicable)
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

    if (sourceAccountId) {
      const { data: ownedAcc } = await (supabase.from('accounts') as any)
        .select('id, user_id, is_active, type')
        .eq('id', sourceAccountId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!ownedAcc) {
        return {
          success: false,
          actionType: action.actionType,
          message: 'Account security violation',
          error: `Security Violation: Account ${sourceAccountId} does not belong to authenticated user.`,
        };
      }
    }

    // 4. Resolve & Verify Person / Counterparty (if applicable)
    let counterpartyId = action.personId;
    if (!counterpartyId && action.personName) {
      const { data: matchedCp } = await (supabase.from('counterparties') as any)
        .select('id, user_id')
        .eq('user_id', userId)
        .ilike('name', `%${action.personName}%`)
        .limit(1)
        .maybeSingle();

      if (matchedCp) {
        counterpartyId = matchedCp.id;
      } else {
        // Auto-provision new counterparty for user
        const { data: createdCp } = await (supabase.from('counterparties') as any)
          .insert({
            user_id: userId,
            name: action.personName,
            status: 'active',
          })
          .select('id')
          .single();

        if (createdCp) {
          counterpartyId = createdCp.id;
        }
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
          counterpartyId: counterpartyId || undefined,
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
          return { success: false, actionType: action.actionType, message: 'Person required', error: 'Person / Counterparty is required to record repayment.' };
        }

        const recRes = await recordRepayment(supabase, {
          userId,
          accountId: sourceAccountId,
          counterpartyId,
          amount: decAmount.toFixed(2),
          direction: 'in', // Money coming in from debtor
          date: txnDate,
          description: action.description || `Repayment received from ${action.personName || 'person'}`,
          notes: action.notes,
          repaymentId: action.repaymentId || `ai-rep-in-${messageId}-${stableActionId}`,
        });

        if (!recRes.success) {
          return { success: false, actionType: action.actionType, message: 'Repayment recording failed', error: recRes.error };
        }

        return {
          success: true,
          journalEntryId: recRes.journalEntryId,
          actionType: action.actionType,
          message: `Recorded repayment of ₹${decAmount.toFixed(2)} received from ${action.personName || 'counterparty'}.`,
        };
      }

      case 'payable_repayment': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Account required', error: 'An active account is required to pay repayment.' };
        }
        if (!counterpartyId) {
          return { success: false, actionType: action.actionType, message: 'Person required', error: 'Person / Creditor is required to record debt repayment.' };
        }

        const payRes = await recordRepayment(supabase, {
          userId,
          accountId: sourceAccountId,
          counterpartyId,
          amount: decAmount.toFixed(2),
          direction: 'out', // Money going out to creditor
          date: txnDate,
          description: action.description || `Debt repayment to ${action.personName || 'person'}`,
          notes: action.notes,
          repaymentId: action.repaymentId || `ai-rep-out-${messageId}-${stableActionId}`,
        });

        if (!payRes.success) {
          return { success: false, actionType: action.actionType, message: 'Debt repayment failed', error: payRes.error };
        }

        return {
          success: true,
          journalEntryId: payRes.journalEntryId,
          actionType: action.actionType,
          message: `Recorded debt repayment of ₹${decAmount.toFixed(2)} to ${action.personName || 'creditor'}.`,
        };
      }

      case 'loan_emi': {
        if (!sourceAccountId) {
          return { success: false, actionType: action.actionType, message: 'Account required', error: 'Source bank account is required for EMI payment.' };
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
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            error: 'Funding bank or cash account is required to record investment purchase.',
          };
        }

        // 1. Validate Funding Account
        const { data: fundingAcc } = await (supabase.from('accounts') as any)
          .select('id, user_id, name, type, is_active')
          .eq('id', sourceAccountId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!fundingAcc) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Funding account security violation',
            error: `Security Violation: Funding account ${sourceAccountId} does not belong to authenticated user.`,
          };
        }

        if (!fundingAcc.is_active) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            error: `Funding account '${fundingAcc.name}' is inactive. Please select an active bank or cash account.`,
          };
        }

        if (fundingAcc.type?.toLowerCase() === 'investment') {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            error: 'Funding source cannot be an investment/demat account. Please select a bank or cash account to fund the purchase.',
          };
        }

        // 2. Resolve Investment / Demat Holding Account
        let invAccountId = action.holdingAccountId;
        if (!invAccountId && action.holdingAccountName) {
          const { data: matchedInv } = await (supabase.from('accounts') as any)
            .select('id, user_id, name, type, is_active')
            .eq('user_id', userId)
            .eq('type', 'investment')
            .ilike('name', `%${action.holdingAccountName}%`)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (matchedInv) invAccountId = matchedInv.id;
        }

        if (!invAccountId) {
          const { data: allInvAccs } = await (supabase.from('accounts') as any)
            .select('id, user_id, name, type, is_active')
            .eq('user_id', userId)
            .eq('type', 'investment')
            .eq('is_active', true);

          if (!allInvAccs || allInvAccs.length === 0) {
            return {
              success: false,
              actionType: action.actionType,
              message: 'Action needs information',
              error: 'An active investment/demat account is required before this investment can be recorded. Please create or select an investment account in Accounts.',
            };
          }

          if (allInvAccs.length === 1) {
            invAccountId = allInvAccs[0].id;
          } else {
            return {
              success: false,
              actionType: action.actionType,
              message: 'Action needs information',
              error: `Multiple investment accounts found (${allInvAccs.map((a: any) => a.name).join(', ')}). Please specify which investment account should receive this asset.`,
            };
          }
        }

        // 3. Verify Investment Account Ownership & Status
        const { data: ownedInvAcc } = await (supabase.from('accounts') as any)
          .select('id, user_id, name, type, is_active')
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

        if (!ownedInvAcc.is_active) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            error: `Investment account '${ownedInvAcc.name}' is inactive. Please activate it or select an active demat account.`,
          };
        }

        if (ownedInvAcc.id === sourceAccountId) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            error: 'Funding bank account and investment holding account cannot be the same account.',
          };
        }

        const assetIdent = action.assetSymbol || action.assetName || action.description || 'Investment Asset';

        const res = await recordFinancialTransaction(supabase, {
          userId,
          type: 'investment_purchase',
          accountId: sourceAccountId,
          toAccountId: invAccountId,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Invest in ${assetIdent}`,
          notes: action.notes,
          metadata: {
            assetSymbol: action.assetSymbol || assetIdent,
            assetName: action.assetName || assetIdent,
            quantity: action.quantity,
            pricePerUnit: action.pricePerUnit,
            investmentAccountId: invAccountId,
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
          message: `Recorded purchase of ${assetIdent} (₹${decAmount.toFixed(2)}) in Investment Ledger.`,
        };
      }

      case 'investment_sell': {
        if (!sourceAccountId) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            error: 'Destination bank/cash account required for investment proceeds.',
          };
        }

        // 1. Validate Destination Account
        const { data: destAcc } = await (supabase.from('accounts') as any)
          .select('id, user_id, name, type, is_active')
          .eq('id', sourceAccountId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!destAcc) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Destination account security violation',
            error: `Security Violation: Destination account ${sourceAccountId} does not belong to authenticated user.`,
          };
        }

        // 2. Resolve Investment Account
        let invAccountId = action.holdingAccountId;
        if (!invAccountId && action.holdingAccountName) {
          const { data: matchedInv } = await (supabase.from('accounts') as any)
            .select('id, user_id, name, type, is_active')
            .eq('user_id', userId)
            .eq('type', 'investment')
            .ilike('name', `%${action.holdingAccountName}%`)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

          if (matchedInv) invAccountId = matchedInv.id;
        }

        if (!invAccountId) {
          const { data: allInvAccs } = await (supabase.from('accounts') as any)
            .select('id, user_id, name, type, is_active')
            .eq('user_id', userId)
            .eq('type', 'investment')
            .eq('is_active', true);

          if (!allInvAccs || allInvAccs.length === 0) {
            return {
              success: false,
              actionType: action.actionType,
              message: 'Action needs information',
              error: 'An active investment account is required for selling assets.',
            };
          }

          if (allInvAccs.length === 1) {
            invAccountId = allInvAccs[0].id;
          } else {
            return {
              success: false,
              actionType: action.actionType,
              message: 'Action needs information',
              error: `Multiple investment accounts found (${allInvAccs.map((a: any) => a.name).join(', ')}). Please specify which investment account to sell from.`,
            };
          }
        }

        // 3. Verify Investment Account Ownership
        const { data: ownedInvAcc } = await (supabase.from('accounts') as any)
          .select('id, user_id, name, type, is_active')
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

        if (!ownedInvAcc.is_active) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            error: `Investment account '${ownedInvAcc.name}' is inactive.`,
          };
        }

        const costBasis = action.costBasis !== undefined ? new Decimal(action.costBasis).toFixed(2) : decAmount.toFixed(2);
        const realizedGain = action.realizedGainLoss !== undefined ? new Decimal(action.realizedGainLoss).toFixed(2) : '0.00';
        const assetIdent = action.assetSymbol || action.assetName || action.description || 'Investment Asset';

        const res = await recordFinancialTransaction(supabase, {
          userId,
          type: 'investment_sale',
          accountId: invAccountId!, // Dr Bank, Cr Investment
          toAccountId: sourceAccountId,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Sell ${assetIdent}`,
          notes: action.notes,
          metadata: {
            assetSymbol: action.assetSymbol || assetIdent,
            assetName: action.assetName || assetIdent,
            quantity: action.quantity,
            pricePerUnit: action.pricePerUnit,
            costBasis,
            realizedGainLoss: realizedGain,
            investmentAccountId: invAccountId,
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
          message: `Recorded sale of ${assetIdent} (₹${decAmount.toFixed(2)}) in Investment Ledger.`,
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
