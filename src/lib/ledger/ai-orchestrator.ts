import { Decimal } from 'decimal.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.ts';
import { recordFinancialTransaction, reverseFinancialTransaction, ensureLedgerAccount } from './service.ts';
import { recordLending, recordBorrowing, recordRepayment, ensureCounterpartyLedgerAccounts, getCounterpartyAuthoritativeBalance } from './people.ts';
import { recordLoanEMI, recordLoanDisbursement, deleteLoanAuthoritative, getLoanAuthoritativeBalance } from './loans.ts';
import { resolveAccount, resolveCounterparty, resolveLoan, resolveJournalEntry, resolveCategory } from '../ai/entity-resolution.ts';
import { generateAccountingPreview } from '../ai/accounting-preview.ts';
import { resolveSupportedAccountType, type StandardErrorCode } from '../ai/capabilities.ts';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export interface CanonicalAIActionEnvelope {
  actionType: string;
  actionId?: string;
  amount?: number | string;
  currency?: string;
  description?: string;
  date?: string;
  notes?: string;

  // Account parameters
  accountId?: string;
  accountName?: string;
  accountType?: string;
  toAccountId?: string;
  toAccountName?: string;
  openingBalance?: number | string;

  // People parameters
  personId?: string;
  personName?: string;
  phone?: string;
  email?: string;
  relationship?: string;
  repaymentId?: string;

  // Loan parameters
  loanId?: string;
  loanName?: string;
  loanType?: string;
  principalAmount?: number | string;
  interestAmount?: number | string;
  tenureMonths?: number;
  interestRate?: number;

  // Investment parameters
  assetSymbol?: string;
  assetName?: string;
  quantity?: number | string;
  pricePerUnit?: number | string;
  holdingAccountId?: string;
  holdingAccountName?: string;
  costBasis?: number | string;
  realizedGainLoss?: number | string;

  // Budget & Goal parameters
  budgetId?: string;
  categoryName?: string;
  categoryId?: string;
  month?: number;
  year?: number;
  targetAmount?: number | string;
  deadline?: string;
  goalId?: string;

  // Recurring parameters
  frequency?: string;
  startDate?: string;
  endDate?: string;
  type?: string;

  // Reversal parameters
  originalJournalEntryId?: string;
  reversalReason?: string;
}

export interface OrchestratedActionResult {
  success: boolean;
  actionType: string;
  journalEntryId?: string;
  reversalEntryId?: string;
  createdEntityId?: string;
  message: string;
  errorCode?: StandardErrorCode;
  error?: string;
  accountingPreview?: any;
  verified: boolean;
}

/**
 * Validates and executes an AI action through authoritative domain services.
 * Implements strict tenant isolation, server entity resolution, prerequisite verification,
 * and post-execution ledger verification.
 */
export async function orchestrateAIAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  messageId: string,
  action: CanonicalAIActionEnvelope
): Promise<OrchestratedActionResult> {
  // 1. Authentication & Integrity Check
  if (!userId) {
    return {
      success: false,
      actionType: action?.actionType || 'unknown',
      message: 'Authentication required',
      errorCode: 'AUTH_REQUIRED',
      error: 'User session is not authenticated.',
      verified: false,
    };
  }

  if (!action || !action.actionType) {
    return {
      success: false,
      actionType: 'unknown',
      message: 'Invalid action payload',
      errorCode: 'INSUFFICIENT_INFORMATION',
      error: 'Missing actionType in action payload.',
      verified: false,
    };
  }

  const stableActionId = action.actionId || 'default';
  const idempotencyKey = `AI:${userId}:${messageId}:${action.actionType}:${stableActionId}`;
  const txnDate = action.date ? action.date.split('T')[0] : new Date().toISOString().split('T')[0];

  try {
    switch (action.actionType) {
      // ==========================================
      // L2: ACCOUNT CREATION
      // ==========================================
      case 'create_account': {
        const rawName = action.accountName || action.description;
        if (!rawName) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INSUFFICIENT_INFORMATION',
            error: 'Account name is required to create a new account.',
            verified: false,
          };
        }

        const rawType = action.accountType || 'bank';
        const supportedType = resolveSupportedAccountType(rawType);
        if (!supportedType) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_ACCOUNT_TYPE',
            error: `Account type '${rawType}' is not currently supported by NisFlow. Supported types: Bank Account, Savings, Current, Cash, Wallet, Credit Card, Demat/Investment.`,
            verified: false,
          };
        }

        // Check for duplicate active account with exact same name
        const { data: existingAcc } = await (supabase.from('accounts') as any)
          .select('id, name')
          .eq('user_id', userId)
          .ilike('name', rawName.trim())
          .eq('is_active', true)
          .maybeSingle();

        if (existingAcc) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'ENTITY_AMBIGUOUS',
            error: `An active account named '${existingAcc.name}' already exists. Please choose a distinct name.`,
            verified: false,
          };
        }

        // Insert new account record
        const { data: newAccount, error: accErr } = await (supabase.from('accounts') as any)
          .insert({
            user_id: userId,
            name: rawName.trim(),
            account_type: supportedType.dbType,
            type: supportedType.dbType,
            opening_balance: 0,
            current_balance: 0,
            balance: 0,
            is_active: true,
          })
          .select('id, name, type')
          .single();

        if (accErr || !newAccount) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Failed to create account',
            errorCode: 'PROJECTION_FAILURE',
            error: accErr?.message || 'Database account insert failed',
            verified: false,
          };
        }

        // Automatically provision ledger account in double-entry chart of accounts
        await ensureLedgerAccount(supabase, userId, {
          code: `AST-ACC-${newAccount.id}`,
          name: `Account: ${newAccount.name}`,
          accountType: 'asset',
          entityType: 'account',
          entityId: newAccount.id,
        });

        // If explicit opening balance was requested, post to ledger
        let openingJournalId: string | undefined;
        const initialAmountDec = new Decimal(action.openingBalance || action.amount || 0);
        if (initialAmountDec.gt(0)) {
          const openBalRes = await recordFinancialTransaction(supabase, {
            userId,
            type: 'opening_balance',
            accountId: newAccount.id,
            amount: initialAmountDec.toFixed(2),
            date: txnDate,
            description: `Opening Balance for ${newAccount.name}`,
            idempotencyKey: `ACC:OPEN:${newAccount.id}`,
            sourceType: 'account_opening',
            sourceId: newAccount.id,
          });
          if (openBalRes.success) {
            openingJournalId = openBalRes.journalEntryId;
          }
        }

        return {
          success: true,
          actionType: action.actionType,
          createdEntityId: newAccount.id,
          journalEntryId: openingJournalId,
          message: initialAmountDec.gt(0)
            ? `Created ${supportedType.label} '${newAccount.name}' with ₹${initialAmountDec.toFixed(2)} opening balance in double-entry ledger.`
            : `Created ${supportedType.label} '${newAccount.name}' successfully.`,
          verified: true,
        };
      }

      // ==========================================
      // L2: PERSON / COUNTERPARTY CREATION
      // ==========================================
      case 'create_person': {
        const rawName = action.personName || action.description;
        if (!rawName) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INSUFFICIENT_INFORMATION',
            error: 'Person name is required.',
            verified: false,
          };
        }

        const { data: createdCp, error: cpErr } = await (supabase.from('counterparties') as any)
          .insert({
            user_id: userId,
            name: rawName.trim(),
            phone: action.phone || null,
            email: action.email || null,
            relationship: action.relationship || null,
            is_active: true,
          })
          .select('id, name')
          .single();

        if (cpErr || !createdCp) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Failed to add person',
            errorCode: 'PROJECTION_FAILURE',
            error: cpErr?.message || 'Database counterparty insert failed',
            verified: false,
          };
        }

        // Provision People Ledger receivable & payable accounts
        await ensureCounterpartyLedgerAccounts(supabase, userId, createdCp.id);

        return {
          success: true,
          actionType: action.actionType,
          createdEntityId: createdCp.id,
          message: `Added '${createdCp.name}' to your People Ledger with receivable and payable accounts.`,
          verified: true,
        };
      }

      // ==========================================
      // L3: EXPENSE & INCOME
      // ==========================================
      case 'expense':
      case 'income': {
        const decAmount = new Decimal(action.amount || 0);
        if (decAmount.lte(0)) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Transaction amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }
        if (decAmount.decimalPlaces() > 2) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Amount exceeds INR 2-decimal paise precision.',
            verified: false,
          };
        }

        // Resolve funding/deposit account
        const accRes = await resolveAccount(supabase, userId, {
          id: action.accountId,
          name: action.accountName,
          requireActive: true,
        });

        if (accRes.status !== 'RESOLVED' || !accRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: accRes.status === 'SECURITY_VIOLATION' ? 'Account security violation' : 'Account required',
            errorCode: accRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: accRes.error || 'An active account is required to record transaction.',
            verified: false,
          };
        }

        // Resolve category if provided
        let categoryId: string | null = null;
        if (action.categoryId || action.categoryName) {
          const catRes = await resolveCategory(supabase, userId, {
            id: action.categoryId,
            name: action.categoryName,
          });
          if (catRes.status === 'RESOLVED' && catRes.entity) {
            categoryId = catRes.entity.id;
          }
        }

        // Resolve optional counterparty if mentioned
        let counterpartyId: string | null = null;
        if (action.personId || action.personName) {
          const cpRes = await resolveCounterparty(supabase, userId, {
            id: action.personId,
            name: action.personName,
            allowAutoProvision: true,
          });
          if (cpRes.status === 'RESOLVED' && cpRes.entity) {
            counterpartyId = cpRes.entity.id;
          }
        }

        const postRes = await recordFinancialTransaction(supabase, {
          userId,
          type: action.actionType as any,
          accountId: accRes.entity.id,
          categoryId,
          counterpartyId,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `${action.actionType.toUpperCase()} via NisFlow AI`,
          notes: action.notes,
          idempotencyKey,
          sourceType: 'ai_action',
        });

        if (!postRes.success) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Transaction failed',
            errorCode: 'LEDGER_FAILURE',
            error: postRes.error || 'Failed to post transaction to double-entry ledger.',
            verified: false,
          };
        }

        // Post-execution verification
        const verified = await verifyLedgerPost(supabase, userId, postRes.journalEntryId!);
        if (!verified) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Execution could not be verified',
            errorCode: 'LEDGER_FAILURE',
            error: 'Ledger entry verification failed after post.',
            verified: false,
          };
        }

        return {
          success: true,
          actionType: action.actionType,
          journalEntryId: postRes.journalEntryId,
          message: `Recorded ${action.actionType} of ₹${decAmount.toFixed(2)} in double-entry ledger.`,
          verified: true,
        };
      }

      // ==========================================
      // L3: INTER-ACCOUNT TRANSFER
      // ==========================================
      case 'transfer': {
        const decAmount = new Decimal(action.amount || 0);
        if (decAmount.lte(0) || decAmount.decimalPlaces() > 2) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Transaction amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        // Resolve source account
        const srcRes = await resolveAccount(supabase, userId, {
          id: action.accountId,
          name: action.accountName,
          requireActive: true,
        });

        if (srcRes.status !== 'RESOLVED' || !srcRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: srcRes.status === 'SECURITY_VIOLATION' ? 'Account security violation' : 'Source account required',
            errorCode: srcRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: srcRes.error || 'Source account is required for transfer.',
            verified: false,
          };
        }

        // Resolve destination account
        const destRes = await resolveAccount(supabase, userId, {
          id: action.toAccountId,
          name: action.toAccountName,
          requireActive: true,
        });

        if (destRes.status !== 'RESOLVED' || !destRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: destRes.status === 'SECURITY_VIOLATION' ? 'Destination account security violation' : 'Destination account required',
            errorCode: destRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: destRes.error || 'Destination account is required for transfer.',
            verified: false,
          };
        }

        if (srcRes.entity.id === destRes.entity.id) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_ACCOUNT',
            error: 'Source account and destination account cannot be the same account.',
            verified: false,
          };
        }

        const postRes = await recordFinancialTransaction(supabase, {
          userId,
          type: 'transfer',
          accountId: srcRes.entity.id,
          toAccountId: destRes.entity.id,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Transfer to ${destRes.entity.name}`,
          notes: action.notes,
          idempotencyKey,
          sourceType: 'ai_action',
        });

        if (!postRes.success) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Transfer failed',
            errorCode: 'LEDGER_FAILURE',
            error: postRes.error || 'Failed to post transfer.',
            verified: false,
          };
        }

        const verified = await verifyLedgerPost(supabase, userId, postRes.journalEntryId!);
        return {
          success: verified,
          actionType: action.actionType,
          journalEntryId: postRes.journalEntryId,
          message: `Transferred ₹${decAmount.toFixed(2)} between accounts in double-entry ledger.`,
          verified,
        };
      }

      // ==========================================
      // L3: PEOPLE LEDGER (LENDING / BORROWING / REPAYMENT)
      // ==========================================
      case 'lending': {
        const decAmount = new Decimal(action.amount || 0);
        if (decAmount.lte(0) || decAmount.decimalPlaces() > 2) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Transaction amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        const accRes = await resolveAccount(supabase, userId, { id: action.accountId, name: action.accountName, requireActive: true });
        if (accRes.status !== 'RESOLVED' || !accRes.entity) {
          return { success: false, actionType: action.actionType, message: accRes.status === 'SECURITY_VIOLATION' ? 'Account security violation' : 'Account required', errorCode: accRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND', error: accRes.error || 'An active account is required to lend money.', verified: false };
        }

        const cpRes = await resolveCounterparty(supabase, userId, { id: action.personId, name: action.personName, allowAutoProvision: true });
        if (cpRes.status !== 'RESOLVED' || !cpRes.entity) {
          return { success: false, actionType: action.actionType, message: cpRes.status === 'SECURITY_VIOLATION' ? 'Counterparty security violation' : 'Person required', errorCode: cpRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND', error: cpRes.error || 'Counterparty / Person is required to record lending.', verified: false };
        }

        const lendRes = await recordLending(supabase, {
          userId,
          accountId: accRes.entity.id,
          counterpartyId: cpRes.entity.id,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Lent money to ${cpRes.entity.name}`,
          notes: action.notes,
          receivableId: `ai-rec-${messageId}-${stableActionId}`,
        });

        if (!lendRes.success) {
          return { success: false, actionType: action.actionType, message: 'Lending failed', errorCode: 'LEDGER_FAILURE', error: lendRes.error, verified: false };
        }

        const verified = await verifyLedgerPost(supabase, userId, lendRes.journalEntryId!);
        return {
          success: verified,
          actionType: action.actionType,
          journalEntryId: lendRes.journalEntryId,
          message: `Recorded receivable of ₹${decAmount.toFixed(2)} in People Ledger.`,
          verified,
        };
      }

      case 'borrowing': {
        const decAmount = new Decimal(action.amount || 0);
        if (decAmount.lte(0) || decAmount.decimalPlaces() > 2) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Transaction amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        const accRes = await resolveAccount(supabase, userId, { id: action.accountId, name: action.accountName, requireActive: true });
        if (accRes.status !== 'RESOLVED' || !accRes.entity) {
          return { success: false, actionType: action.actionType, message: accRes.status === 'SECURITY_VIOLATION' ? 'Account security violation' : 'Account required', errorCode: accRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND', error: accRes.error || 'An active account is required to receive borrowed money.', verified: false };
        }

        const cpRes = await resolveCounterparty(supabase, userId, { id: action.personId, name: action.personName, allowAutoProvision: true });
        if (cpRes.status !== 'RESOLVED' || !cpRes.entity) {
          return { success: false, actionType: action.actionType, message: cpRes.status === 'SECURITY_VIOLATION' ? 'Security Violation' : 'Person required', errorCode: cpRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND', error: cpRes.error || 'Counterparty / Person is required to record borrowing.', verified: false };
        }

        const borrowRes = await recordBorrowing(supabase, {
          userId,
          accountId: accRes.entity.id,
          counterpartyId: cpRes.entity.id,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Borrowed money from ${cpRes.entity.name}`,
          notes: action.notes,
          payableId: `ai-pay-${messageId}-${stableActionId}`,
        });

        if (!borrowRes.success) {
          return { success: false, actionType: action.actionType, message: 'Borrowing failed', errorCode: 'LEDGER_FAILURE', error: borrowRes.error, verified: false };
        }

        const verified = await verifyLedgerPost(supabase, userId, borrowRes.journalEntryId!);
        return {
          success: verified,
          actionType: action.actionType,
          journalEntryId: borrowRes.journalEntryId,
          message: `Recorded payable of ₹${decAmount.toFixed(2)} in People Ledger.`,
          verified,
        };
      }

      case 'receivable_repayment':
      case 'payable_repayment': {
        const decAmount = new Decimal(action.amount || 0);
        if (decAmount.lte(0) || decAmount.decimalPlaces() > 2) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Transaction amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        const accRes = await resolveAccount(supabase, userId, { id: action.accountId, name: action.accountName, requireActive: true });
        if (accRes.status !== 'RESOLVED' || !accRes.entity) {
          return { success: false, actionType: action.actionType, message: accRes.status === 'SECURITY_VIOLATION' ? 'Account security violation' : 'Account required', errorCode: accRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND', error: accRes.error || 'An active account is required to record repayment.', verified: false };
        }

        const cpRes = await resolveCounterparty(supabase, userId, { id: action.personId, name: action.personName });
        if (cpRes.status !== 'RESOLVED' || !cpRes.entity) {
          return { success: false, actionType: action.actionType, message: cpRes.status === 'SECURITY_VIOLATION' ? 'Person security violation' : 'Person required', errorCode: cpRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND', error: cpRes.error || 'Person / Counterparty is required to record repayment.', verified: false };
        }

        const direction = action.actionType === 'receivable_repayment' ? 'in' : 'out';
        const repRes = await recordRepayment(supabase, {
          userId,
          accountId: accRes.entity.id,
          counterpartyId: cpRes.entity.id,
          amount: decAmount.toFixed(2),
          direction,
          date: txnDate,
          description: action.description || `${direction === 'in' ? 'Repayment received from' : 'Debt repayment to'} ${cpRes.entity.name}`,
          notes: action.notes,
          repaymentId: action.repaymentId || `ai-rep-${direction}-${messageId}-${stableActionId}`,
        });

        if (!repRes.success) {
          const isOverpay = repRes.error?.includes('Overpayment');
          return {
            success: false,
            actionType: action.actionType,
            message: isOverpay ? 'Repayment recording failed' : 'Repayment recording failed',
            errorCode: isOverpay ? 'OVERPAYMENT' : 'LEDGER_FAILURE',
            error: repRes.error,
            verified: false,
          };
        }

        const verified = await verifyLedgerPost(supabase, userId, repRes.journalEntryId!);
        return {
          success: verified,
          actionType: action.actionType,
          journalEntryId: repRes.journalEntryId,
          message: direction === 'in'
            ? `Recorded repayment of ₹${decAmount.toFixed(2)} received from ${cpRes.entity.name}.`
            : `Recorded debt repayment of ₹${decAmount.toFixed(2)} to ${cpRes.entity.name}.`,
          verified,
        };
      }

      // ==========================================
      // L3: LOANS (EMI & DISBURSEMENT)
      // ==========================================
      case 'loan_emi': {
        const decAmount = new Decimal(action.amount || 0);
        const principalDec = new Decimal(action.principalAmount || decAmount);
        const interestDec = new Decimal(action.interestAmount || 0);
        const totalEMI = principalDec.plus(interestDec);

        if (totalEMI.lte(0) || totalEMI.decimalPlaces() > 2) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Transaction amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        const accRes = await resolveAccount(supabase, userId, { id: action.accountId, name: action.accountName, requireActive: true });
        if (accRes.status !== 'RESOLVED' || !accRes.entity) {
          return { success: false, actionType: action.actionType, message: accRes.status === 'SECURITY_VIOLATION' ? 'Account security violation' : 'Account required', errorCode: accRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND', error: accRes.error || 'Source bank account is required for EMI payment.', verified: false };
        }

        const loanRes = await resolveLoan(supabase, userId, { id: action.loanId, name: action.loanName });
        if (loanRes.status !== 'RESOLVED' || !loanRes.entity) {
          return { success: false, actionType: action.actionType, message: loanRes.status === 'SECURITY_VIOLATION' ? 'Loan security violation' : 'Loan required', errorCode: loanRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND', error: loanRes.error || 'Loan ID or valid loan name is required for EMI payment.', verified: false };
        }

        try {
          const emiRes = await recordLoanEMI(supabase, {
            userId,
            loanId: loanRes.entity.id,
            accountId: accRes.entity.id,
            principalAmount: principalDec.toFixed(2),
            interestAmount: interestDec.toFixed(2),
            totalAmount: totalEMI.toFixed(2),
            date: txnDate,
            description: action.description || `EMI Payment: ${loanRes.entity.name}`,
            notes: action.notes,
            idempotencyKey,
          });

          const verified = await verifyLedgerPost(supabase, userId, emiRes.journalEntryId!);
          return {
            success: verified,
            actionType: action.actionType,
            journalEntryId: emiRes.journalEntryId,
            message: `Recorded EMI of ₹${totalEMI.toFixed(2)} (Principal: ₹${principalDec.toFixed(2)}, Interest: ₹${interestDec.toFixed(2)}) in Loan Ledger.`,
            verified,
          };
        } catch (emiErr: any) {
          const isOverpay = emiErr.message?.toLowerCase().includes('overpayment') || emiErr.message?.toLowerCase().includes('exceeds');
          return {
            success: false,
            actionType: action.actionType,
            message: isOverpay ? 'Action needs information' : 'Loan EMI failed',
            errorCode: isOverpay ? 'OVERPAYMENT' : 'LEDGER_FAILURE',
            error: emiErr.message,
            verified: false,
          };
        }
      }

      // ==========================================
      // L3: INVESTMENTS (BUY / SELL / DIVIDEND)
      // ==========================================
      case 'investment_buy': {
        const decAmount = new Decimal(action.amount || 0);
        if (decAmount.lte(0) || decAmount.decimalPlaces() > 2) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Transaction amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        // 1. Resolve Funding Bank / Cash Account
        const fundingRes = await resolveAccount(supabase, userId, {
          id: action.accountId,
          name: action.accountName,
          requireActive: true,
        });

        if (fundingRes.status !== 'RESOLVED' || !fundingRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: fundingRes.status === 'SECURITY_VIOLATION' ? 'Funding account security violation' : 'Action needs information',
            errorCode: fundingRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: fundingRes.error || 'Funding bank or cash account is required to record investment purchase.',
            verified: false,
          };
        }

        if (fundingRes.entity.type?.toLowerCase() === 'investment') {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_ACCOUNT',
            error: 'Funding source cannot be an investment/demat account. Please select a bank or cash account to fund the purchase.',
            verified: false,
          };
        }

        // 2. Resolve Demat / Holding Account
        const dematRes = await resolveAccount(supabase, userId, {
          id: action.holdingAccountId,
          name: action.holdingAccountName,
          isInvestment: true,
          requireActive: true,
        });

        if (dematRes.status !== 'RESOLVED' || !dematRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: dematRes.status === 'SECURITY_VIOLATION' ? 'Investment account security violation' : 'Action needs information',
            errorCode: dematRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : (dematRes.status === 'AMBIGUOUS' ? 'ENTITY_AMBIGUOUS' : 'PREREQUISITE_MISSING'),
            error: dematRes.error || 'An active investment/demat account is required before this investment can be recorded. Please create or select an investment account in Accounts.',
            verified: false,
          };
        }

        if (dematRes.entity.id === fundingRes.entity.id) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_ACCOUNT',
            error: 'Funding bank account and investment holding account cannot be the same account.',
            verified: false,
          };
        }

        const assetIdent = action.assetSymbol || action.assetName || action.description || 'Investment Asset';

        const postRes = await recordFinancialTransaction(supabase, {
          userId,
          type: 'investment_purchase',
          accountId: fundingRes.entity.id,
          toAccountId: dematRes.entity.id,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Invest in ${assetIdent}`,
          notes: action.notes,
          metadata: {
            assetSymbol: assetIdent,
            assetName: action.assetName || assetIdent,
            quantity: action.quantity,
            pricePerUnit: action.pricePerUnit,
            investmentAccountId: dematRes.entity.id,
          },
          idempotencyKey,
          sourceType: 'investment_purchase',
        });

        if (!postRes.success) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Investment purchase failed',
            errorCode: 'LEDGER_FAILURE',
            error: postRes.error,
            verified: false,
          };
        }

        const verified = await verifyLedgerPost(supabase, userId, postRes.journalEntryId!);
        return {
          success: verified,
          actionType: action.actionType,
          journalEntryId: postRes.journalEntryId,
          message: `Recorded purchase of ${assetIdent} (₹${decAmount.toFixed(2)}) in Investment Ledger.`,
          verified,
        };
      }

      case 'investment_sell': {
        const decAmount = new Decimal(action.amount || 0);
        if (decAmount.lte(0) || decAmount.decimalPlaces() > 2) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Transaction amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        // Resolve proceeds destination account
        const destRes = await resolveAccount(supabase, userId, {
          id: action.accountId,
          name: action.accountName,
          requireActive: true,
        });

        if (destRes.status !== 'RESOLVED' || !destRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: destRes.status === 'SECURITY_VIOLATION' ? 'Destination account security violation' : 'Action needs information',
            errorCode: destRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: destRes.error || 'Destination bank/cash account required for investment proceeds.',
            verified: false,
          };
        }

        // Resolve investment source account
        const dematRes = await resolveAccount(supabase, userId, {
          id: action.holdingAccountId,
          name: action.holdingAccountName,
          isInvestment: true,
          requireActive: true,
        });

        if (dematRes.status !== 'RESOLVED' || !dematRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: dematRes.status === 'SECURITY_VIOLATION' ? 'Investment account security violation' : 'Action needs information',
            errorCode: dematRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: dematRes.error || 'An active investment account is required for selling assets.',
            verified: false,
          };
        }

        const costBasis = action.costBasis !== undefined ? new Decimal(action.costBasis).toFixed(2) : decAmount.toFixed(2);
        const realizedGain = action.realizedGainLoss !== undefined ? new Decimal(action.realizedGainLoss).toFixed(2) : '0.00';
        const assetIdent = action.assetSymbol || action.assetName || action.description || 'Investment Asset';

        const postRes = await recordFinancialTransaction(supabase, {
          userId,
          type: 'investment_sale',
          accountId: dematRes.entity.id,
          toAccountId: destRes.entity.id,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Sell ${assetIdent}`,
          notes: action.notes,
          metadata: {
            assetSymbol: assetIdent,
            assetName: action.assetName || assetIdent,
            quantity: action.quantity,
            pricePerUnit: action.pricePerUnit,
            costBasis,
            realizedGainLoss: realizedGain,
            investmentAccountId: dematRes.entity.id,
          },
          idempotencyKey,
          sourceType: 'investment_sale',
        });

        if (!postRes.success) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Investment sale failed',
            errorCode: 'LEDGER_FAILURE',
            error: postRes.error,
            verified: false,
          };
        }

        const verified = await verifyLedgerPost(supabase, userId, postRes.journalEntryId!);
        return {
          success: verified,
          actionType: action.actionType,
          journalEntryId: postRes.journalEntryId,
          message: `Recorded sale of ${assetIdent} (₹${decAmount.toFixed(2)}) in Investment Ledger.`,
          verified,
        };
      }

      case 'investment_dividend': {
        const decAmount = new Decimal(action.amount || 0);
        if (decAmount.lte(0) || decAmount.decimalPlaces() > 2) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Transaction amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        const accRes = await resolveAccount(supabase, userId, { id: action.accountId, name: action.accountName, requireActive: true });
        if (accRes.status !== 'RESOLVED' || !accRes.entity) {
          return { success: false, actionType: action.actionType, message: 'Account required', errorCode: 'ENTITY_NOT_FOUND', error: accRes.error || 'An active account is required to receive dividend.', verified: false };
        }

        const assetIdent = action.assetSymbol || action.assetName || 'Shares';
        const postRes = await recordFinancialTransaction(supabase, {
          userId,
          type: 'income',
          accountId: accRes.entity.id,
          amount: decAmount.toFixed(2),
          date: txnDate,
          description: action.description || `Dividend: ${assetIdent}`,
          notes: action.notes,
          idempotencyKey,
          sourceType: 'dividend',
        });

        if (!postRes.success) {
          return { success: false, actionType: action.actionType, message: 'Dividend recording failed', errorCode: 'LEDGER_FAILURE', error: postRes.error, verified: false };
        }

        const verified = await verifyLedgerPost(supabase, userId, postRes.journalEntryId!);
        return {
          success: verified,
          actionType: action.actionType,
          journalEntryId: postRes.journalEntryId,
          message: `Recorded dividend income of ₹${decAmount.toFixed(2)} in double-entry ledger.`,
          verified,
        };
      }

      // ==========================================
      // L4: REVERSAL / CORRECTION (DESTRUCTIVE)
      // ==========================================
      case 'reversal': {
        if (!action.originalJournalEntryId) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Entry ID required',
            errorCode: 'INSUFFICIENT_INFORMATION',
            error: 'Original journal entry ID is required for reversal.',
            verified: false,
          };
        }

        const entryRes = await resolveJournalEntry(supabase, userId, { id: action.originalJournalEntryId });
        if (entryRes.status !== 'RESOLVED' || !entryRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Reversal failed',
            errorCode: entryRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: entryRes.error || 'Original journal entry not found or unauthorized.',
            verified: false,
          };
        }

        const revRes = await reverseFinancialTransaction(supabase, {
          userId,
          journalEntryId: entryRes.entity.id,
          reason: action.reversalReason || action.description || 'Reversal requested via AI assistant',
          idempotencyKey,
        });

        if (!revRes.success) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Reversal failed',
            errorCode: 'LEDGER_FAILURE',
            error: revRes.error || 'Failed to post reversal entry.',
            verified: false,
          };
        }

        return {
          success: true,
          actionType: action.actionType,
          reversalEntryId: revRes.reversalEntryId,
          message: `Successfully reversed journal entry ${entryRes.entity.id}.`,
          verified: true,
        };
      }

      case 'delete_loan': {
        if (!action.loanId) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INSUFFICIENT_INFORMATION',
            error: 'Loan ID is required for deletion.',
            verified: false,
          };
        }

        const loanRes = await resolveLoan(supabase, userId, { id: action.loanId, name: action.loanName });
        if (loanRes.status !== 'RESOLVED' || !loanRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Loan deletion failed',
            errorCode: loanRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: loanRes.error || 'Loan not found or unauthorized.',
            verified: false,
          };
        }

        const delRes = await deleteLoanAuthoritative(supabase, userId, loanRes.entity.id);
        if (!delRes.success) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Loan deletion failed',
            errorCode: 'LEDGER_FAILURE',
            error: delRes.error || 'Failed to delete loan.',
            verified: false,
          };
        }

        return {
          success: true,
          actionType: action.actionType,
          message: `Deleted loan '${loanRes.entity.name}' and reversed ${delRes.reversedEntryCount} associated ledger entries.`,
          verified: true,
        };
      }

      // ==========================================
      // L2: ACCOUNT ARCHIVAL
      // ==========================================
      case 'archive_account': {
        const accRes = await resolveAccount(supabase, userId, { id: action.accountId, name: action.accountName });
        if (accRes.status !== 'RESOLVED' || !accRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: accRes.status === 'SECURITY_VIOLATION' ? 'Account security violation' : 'Account not found',
            errorCode: accRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: accRes.error || 'Account not found for archival.',
            verified: false,
          };
        }

        const { error: archErr } = await (supabase.from('accounts') as any)
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', accRes.entity.id)
          .eq('user_id', userId);

        if (archErr) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Failed to archive account',
            errorCode: 'PROJECTION_FAILURE',
            error: archErr.message,
            verified: false,
          };
        }

        return {
          success: true,
          actionType: action.actionType,
          createdEntityId: accRes.entity.id,
          message: `Archived account '${accRes.entity.name}' successfully. Past double-entry ledger history is preserved.`,
          verified: true,
        };
      }

      // ==========================================
      // L2: PERSON RENAME
      // ==========================================
      case 'rename_person': {
        const cpRes = await resolveCounterparty(supabase, userId, { id: action.personId, name: action.personName });
        if (cpRes.status !== 'RESOLVED' || !cpRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: cpRes.status === 'SECURITY_VIOLATION' ? 'Security violation' : 'Person not found',
            errorCode: cpRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: cpRes.error || 'Counterparty not found for rename.',
            verified: false,
          };
        }

        const originalName = cpRes.entity.name;
        const newName = (action.description || action.personName || '').trim();
        if (!newName) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INSUFFICIENT_INFORMATION',
            error: 'New name for counterparty is required.',
            verified: false,
          };
        }

        const { error: renErr } = await (supabase.from('counterparties') as any)
          .update({ name: newName, updated_at: new Date().toISOString() })
          .eq('id', cpRes.entity.id)
          .eq('user_id', userId);

        if (renErr) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Failed to rename person',
            errorCode: 'PROJECTION_FAILURE',
            error: renErr.message,
            verified: false,
          };
        }

        // Update display names in chart of accounts
        await (supabase.from('ledger_accounts') as any)
          .update({ name: `Receivable: ${newName}` })
          .eq('entity_id', cpRes.entity.id)
          .eq('user_id', userId)
          .eq('code', `AST-REC-${cpRes.entity.id}`);

        await (supabase.from('ledger_accounts') as any)
          .update({ name: `Payable: ${newName}` })
          .eq('entity_id', cpRes.entity.id)
          .eq('user_id', userId)
          .eq('code', `LIA-PAY-${cpRes.entity.id}`);

        return {
          success: true,
          actionType: action.actionType,
          createdEntityId: cpRes.entity.id,
          message: `Renamed counterparty from '${originalName}' to '${newName}'.`,
          verified: true,
        };
      }

      // ==========================================
      // L2: BUDGET CREATION & UPDATE
      // ==========================================
      case 'create_budget': {
        const decAmount = new Decimal(action.amount || action.targetAmount || 0);
        if (decAmount.lte(0)) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Budget allocation amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        const now = new Date();
        const month = action.month || (now.getMonth() + 1);
        const year = action.year || now.getFullYear();

        const catRes = await resolveCategory(supabase, userId, { id: action.categoryId, name: action.categoryName });
        if (catRes.status !== 'RESOLVED' || !catRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Category required for budget',
            errorCode: 'ENTITY_NOT_FOUND',
            error: catRes.error || 'A category is required to create a budget allocation.',
            verified: false,
          };
        }

        // Get or create budget header for (user_id, month, year)
        let budgetId: string;
        const { data: existingBudget } = await (supabase.from('budgets') as any)
          .select('id, total_budget')
          .eq('user_id', userId)
          .eq('month', month)
          .eq('year', year)
          .maybeSingle();

        if (existingBudget) {
          budgetId = existingBudget.id;
        } else {
          const { data: newB, error: bErr } = await (supabase.from('budgets') as any)
            .insert({
              user_id: userId,
              month,
              year,
              total_budget: decAmount.toNumber(),
            })
            .select('id')
            .single();

          if (bErr || !newB) {
            return {
              success: false,
              actionType: action.actionType,
              message: 'Failed to create budget',
              errorCode: 'PROJECTION_FAILURE',
              error: bErr?.message || 'Database budget insert failed',
              verified: false,
            };
          }
          budgetId = newB.id;
        }

        // Upsert budget_categories
        await (supabase.from('budget_categories') as any)
          .upsert(
            {
              budget_id: budgetId,
              category_id: catRes.entity.id,
              allocated_amount: decAmount.toNumber(),
            },
            { onConflict: 'budget_id, category_id' }
          );

        return {
          success: true,
          actionType: action.actionType,
          createdEntityId: budgetId,
          message: `Created budget of ₹${decAmount.toFixed(2)} for ${catRes.entity.name} (${month}/${year}).`,
          verified: true,
        };
      }

      case 'update_budget': {
        const decAmount = new Decimal(action.amount || 0);
        if (decAmount.lte(0)) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Budget amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        if (action.budgetId) {
          const { data: bg } = await (supabase.from('budgets') as any)
            .select('id, user_id')
            .eq('id', action.budgetId)
            .eq('user_id', userId)
            .maybeSingle();

          if (!bg) {
            return {
              success: false,
              actionType: action.actionType,
              message: 'Budget not found',
              errorCode: 'ENTITY_NOT_FOUND',
              error: 'Budget not found or unauthorized.',
              verified: false,
            };
          }

          await (supabase.from('budgets') as any)
            .update({ total_budget: decAmount.toNumber(), updated_at: new Date().toISOString() })
            .eq('id', bg.id)
            .eq('user_id', userId);

          return {
            success: true,
            actionType: action.actionType,
            createdEntityId: bg.id,
            message: `Updated total budget to ₹${decAmount.toFixed(2)}.`,
            verified: true,
          };
        }

        return {
          success: false,
          actionType: action.actionType,
          message: 'Budget ID required',
          errorCode: 'INSUFFICIENT_INFORMATION',
          error: 'Budget ID is required for update.',
          verified: false,
        };
      }

      // ==========================================
      // L2: SAVINGS GOALS CREATION & UPDATE
      // ==========================================
      case 'create_savings_goal': {
        const goalName = (action.description || action.assetName || action.notes || '').trim();
        if (!goalName) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INSUFFICIENT_INFORMATION',
            error: 'Savings goal name is required.',
            verified: false,
          };
        }

        const decTarget = new Decimal(action.targetAmount || action.amount || 0);
        if (decTarget.lte(0)) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Savings goal target amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        const { data: newGoal, error: gErr } = await (supabase.from('savings_goals') as any)
          .insert({
            user_id: userId,
            name: goalName,
            target_amount: decTarget.toNumber(),
            current_amount: 0,
            deadline: action.deadline || null,
            status: 'in_progress',
          })
          .select('id, name')
          .single();

        if (gErr || !newGoal) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Failed to create savings goal',
            errorCode: 'PROJECTION_FAILURE',
            error: gErr?.message || 'Database savings goal insert failed',
            verified: false,
          };
        }

        return {
          success: true,
          actionType: action.actionType,
          createdEntityId: newGoal.id,
          message: `Created savings goal '${newGoal.name}' with target ₹${decTarget.toFixed(2)}.`,
          verified: true,
        };
      }

      case 'update_savings_goal': {
        if (!action.goalId && !action.actionId) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Goal ID required',
            errorCode: 'INSUFFICIENT_INFORMATION',
            error: 'Savings goal ID is required for update.',
            verified: false,
          };
        }

        const targetGoalId = action.goalId || action.actionId;
        const { data: existingGoal } = await (supabase.from('savings_goals') as any)
          .select('id, name, user_id')
          .eq('id', targetGoalId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!existingGoal) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Goal not found',
            errorCode: 'ENTITY_NOT_FOUND',
            error: 'Savings goal not found or unauthorized.',
            verified: false,
          };
        }

        const updatePayload: any = { updated_at: new Date().toISOString() };
        if (action.targetAmount) updatePayload.target_amount = new Decimal(action.targetAmount).toNumber();
        if (action.amount) updatePayload.current_amount = new Decimal(action.amount).toNumber();
        if (action.deadline) updatePayload.deadline = action.deadline;

        await (supabase.from('savings_goals') as any)
          .update(updatePayload)
          .eq('id', existingGoal.id)
          .eq('user_id', userId);

        return {
          success: true,
          actionType: action.actionType,
          createdEntityId: existingGoal.id,
          message: `Updated savings goal '${existingGoal.name}'.`,
          verified: true,
        };
      }

      // ==========================================
      // L2: RECURRING TRANSACTION SCHEDULES
      // ==========================================
      case 'create_recurring_rule': {
        const decAmount = new Decimal(action.amount || 0);
        if (decAmount.lte(0)) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Action needs information',
            errorCode: 'INVALID_AMOUNT',
            error: 'Recurring amount must be strictly greater than ₹0.00',
            verified: false,
          };
        }

        const accRes = await resolveAccount(supabase, userId, { id: action.accountId, name: action.accountName, requireActive: true });
        if (accRes.status !== 'RESOLVED' || !accRes.entity) {
          return {
            success: false,
            actionType: action.actionType,
            message: accRes.status === 'SECURITY_VIOLATION' ? 'Account security violation' : 'Account required',
            errorCode: accRes.status === 'SECURITY_VIOLATION' ? 'OWNERSHIP_VIOLATION' : 'ENTITY_NOT_FOUND',
            error: accRes.error || 'An active account is required to schedule recurring transactions.',
            verified: false,
          };
        }

        const freq = (action.frequency || 'monthly').toLowerCase();
        const validFreqs = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
        const chosenFreq = validFreqs.includes(freq) ? freq : 'monthly';
        const startDate = action.startDate || txnDate;
        const desc = action.description || `Recurring ${chosenFreq} schedule`;

        const { data: newRec, error: recErr } = await (supabase.from('recurring_transactions') as any)
          .insert({
            user_id: userId,
            account_id: accRes.entity.id,
            amount: decAmount.toNumber(),
            frequency: chosenFreq,
            start_date: startDate,
            next_due_date: startDate,
            type: action.type || 'expense',
            direction: action.type === 'income' ? 'in' : 'out',
            description: desc,
            is_active: true,
            auto_create: false,
          })
          .select('id, description')
          .single();

        if (recErr || !newRec) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Failed to create recurring rule',
            errorCode: 'PROJECTION_FAILURE',
            error: recErr?.message || 'Database recurring insert failed',
            verified: false,
          };
        }

        return {
          success: true,
          actionType: action.actionType,
          createdEntityId: newRec.id,
          message: `Created recurring transaction rule '${newRec.description}' (₹${decAmount.toFixed(2)}, ${chosenFreq}).`,
          verified: true,
        };
      }

      case 'delete_recurring_rule': {
        const ruleId = action.actionId || (action as any).recurringId;
        if (!ruleId) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Recurring rule ID required',
            errorCode: 'INSUFFICIENT_INFORMATION',
            error: 'Recurring rule ID is required for deletion.',
            verified: false,
          };
        }

        const { data: existingRec } = await (supabase.from('recurring_transactions') as any)
          .select('id, description, user_id')
          .eq('id', ruleId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!existingRec) {
          return {
            success: false,
            actionType: action.actionType,
            message: 'Rule not found',
            errorCode: 'ENTITY_NOT_FOUND',
            error: 'Recurring rule not found or unauthorized.',
            verified: false,
          };
        }

        await (supabase.from('recurring_transactions') as any)
          .delete()
          .eq('id', existingRec.id)
          .eq('user_id', userId);

        return {
          success: true,
          actionType: action.actionType,
          message: `Deleted recurring transaction rule '${existingRec.description}'.`,
          verified: true,
        };
      }

      default: {
        return {
          success: false,
          actionType: action.actionType,
          message: 'Unsupported action type',
          errorCode: 'INSUFFICIENT_INFORMATION',
          error: `AI action type '${action.actionType}' is not supported.`,
          verified: false,
        };
      }
    }
  } catch (err: any) {
    return {
      success: false,
      actionType: action.actionType || 'unknown',
      message: 'Unexpected execution error',
      errorCode: 'LEDGER_FAILURE',
      error: err.message || 'An unexpected error occurred during AI action execution',
      verified: false,
    };
  }
}

/**
 * Post-execution verification helper.
 * Queries double-entry journal directly to ensure transaction is authoritatively posted.
 */
async function verifyLedgerPost(
  supabase: SupabaseClient<Database>,
  userId: string,
  journalEntryId: string
): Promise<boolean> {
  try {
    const { data: entry, error } = await (supabase.from('journal_entries') as any)
      .select('id, user_id, status')
      .eq('id', journalEntryId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !entry || entry.status !== 'posted') {
      return false;
    }

    const { data: lines } = await (supabase.from('journal_lines') as any)
      .select('debit_amount, credit_amount')
      .eq('journal_entry_id', journalEntryId)
      .eq('user_id', userId);

    if (!lines || lines.length < 2) {
      return false;
    }

    let totalDr = new Decimal(0);
    let totalCr = new Decimal(0);
    for (const l of lines) {
      totalDr = totalDr.plus(new Decimal(l.debit_amount || 0));
      totalCr = totalCr.plus(new Decimal(l.credit_amount || 0));
    }

    return totalDr.equals(totalCr) && totalDr.gt(0);
  } catch (verifyErr) {
    console.error('Post-execution verification error:', verifyErr);
    return false;
  }
}
