import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.ts';
import { orchestrateAIAction, type CanonicalAIActionEnvelope, type OrchestratedActionResult } from './ai-orchestrator.ts';

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
  | 'opening_balance'
  | 'create_account'
  | 'create_person'
  | 'delete_loan'
  | 'reversal';

export interface AIFinancialActionPayload extends CanonicalAIActionEnvelope {
  actionType: AIActionType;
}

export interface ExecuteAIActionResult {
  success: boolean;
  journalEntryId?: string;
  reversalEntryId?: string;
  createdEntityId?: string;
  actionType: AIActionType;
  message: string;
  error?: string;
}

/**
 * Validates and executes a confirmed AI financial action through authoritative domain services.
 * Strictly enforces user ownership, deterministic idempotency, double-entry consistency, and verification.
 * Delegates to the central AI Action Orchestrator.
 */
export async function executeAIFinancialAction(
  supabase: SupabaseClient<Database>,
  userId: string,
  messageId: string,
  action: AIFinancialActionPayload
): Promise<ExecuteAIActionResult> {
  const result: OrchestratedActionResult = await orchestrateAIAction(
    supabase,
    userId,
    messageId,
    action
  );

  return {
    success: result.success,
    journalEntryId: result.journalEntryId,
    reversalEntryId: result.reversalEntryId,
    createdEntityId: result.createdEntityId,
    actionType: result.actionType as AIActionType,
    message: result.message,
    error: result.error,
  };
}
