import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database.ts';
import { orchestrateAIAction, type CanonicalAIActionEnvelope, type OrchestratedActionResult } from '../ledger/ai-orchestrator.ts';
import { reverseFinancialTransaction } from '../ledger/service.ts';
import { resolveAccount, resolveCounterparty, resolveLoan } from './entity-resolution.ts';

export type PlanStatus =
  | 'READY'
  | 'CONFIRMING'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'PARTIAL_FAILURE'
  | 'FAILED'
  | 'CANCELLED'
  | 'ROLLED_BACK';

export interface AIPlanStep {
  stepIndex: number;
  title: string;
  action: CanonicalAIActionEnvelope;
  status: 'PENDING' | 'PREFLIGHT_PASSED' | 'PREFLIGHT_FAILED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  result?: OrchestratedActionResult;
  error?: string;
}

export interface AIPlan {
  planId: string;
  title: string;
  steps: AIPlanStep[];
  status: PlanStatus;
  createdAt: string;
  executedStepsCount: number;
  error?: string;
}

export interface PlanPreflightResult {
  canExecute: boolean;
  steps: Array<{
    stepIndex: number;
    title: string;
    valid: boolean;
    error?: string;
    accountingPreview?: any;
  }>;
  overallError?: string;
}

/**
 * Pre-flights all steps of a complex multi-action financial plan before execution.
 * Validates entities, accounts, and prerequisites across all steps.
 */
export async function preflightPlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  plan: AIPlan
): Promise<PlanPreflightResult> {
  if (!userId) {
    return {
      canExecute: false,
      steps: [],
      overallError: 'Authentication required for plan preflight.',
    };
  }

  const stepResults: PlanPreflightResult['steps'] = [];
  let allValid = true;

  for (const step of plan.steps) {
    const act = step.action;
    let stepValid = true;
    let stepError: string | undefined;

    // Validate based on action type
    if (act.actionType === 'transfer' || act.actionType === 'expense' || act.actionType === 'lending') {
      if (act.accountId || act.accountName) {
        const accRes = await resolveAccount(supabase, userId, { id: act.accountId, name: act.accountName });
        if (accRes.status !== 'RESOLVED' && !act.accountName?.toLowerCase().includes('create')) {
          stepValid = false;
          stepError = accRes.error || `Source account for step ${step.stepIndex} not found.`;
        }
      }
    }

    if (act.actionType === 'investment_buy') {
      const dematRes = await resolveAccount(supabase, userId, { id: act.holdingAccountId, name: act.holdingAccountName, isInvestment: true });
      if (dematRes.status !== 'RESOLVED' && !act.holdingAccountName?.toLowerCase().includes('create')) {
        stepValid = false;
        stepError = dematRes.error || 'Demat account prerequisite missing.';
      }
    }

    if (!stepValid) {
      allValid = false;
    }

    stepResults.push({
      stepIndex: step.stepIndex,
      title: step.title,
      valid: stepValid,
      error: stepError,
    });
  }

  return {
    canExecute: allValid,
    steps: stepResults,
    overallError: allValid ? undefined : 'One or more plan steps failed pre-flight verification.',
  };
}

/**
 * Executes a pre-flighted multi-step financial plan in sequential stages.
 * Strictly guarantees Partial Execution Protection: if an intermediate step fails,
 * reports PARTIAL_FAILURE with completed step IDs and prevents unhandled drift.
 */
export async function executePlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  plan: AIPlan
): Promise<AIPlan> {
  const updatedPlan: AIPlan = {
    ...plan,
    status: 'EXECUTING',
    executedStepsCount: 0,
  };

  for (let i = 0; i < updatedPlan.steps.length; i++) {
    const step = updatedPlan.steps[i];
    step.status = 'EXECUTING';

    const result = await orchestrateAIAction(
      supabase,
      userId,
      `plan-${plan.planId}-step-${step.stepIndex}`,
      step.action
    );

    step.result = result;

    if (result.success) {
      step.status = 'COMPLETED';
      updatedPlan.executedStepsCount++;
    } else {
      step.status = 'FAILED';
      step.error = result.error || result.message;

      if (updatedPlan.executedStepsCount > 0) {
        updatedPlan.status = 'PARTIAL_FAILURE';
        updatedPlan.error = `Plan stopped at Step ${step.stepIndex} (${step.title}): ${step.error}. Previous ${updatedPlan.executedStepsCount} step(s) were successfully completed.`;
      } else {
        updatedPlan.status = 'FAILED';
        updatedPlan.error = `Step ${step.stepIndex} (${step.title}) failed: ${step.error}`;
      }

      return updatedPlan;
    }
  }

  updatedPlan.status = 'COMPLETED';
  return updatedPlan;
}

/**
 * Rolls back completed financial steps of a partially failed or cancelled plan.
 * Reverses posted journal entries in reverse chronological order via authoritative
 * post_reversal_entry procedures. Preserves complete financial history without deletion.
 */
export async function rollbackPlan(
  supabase: SupabaseClient<Database>,
  userId: string,
  plan: AIPlan
): Promise<{
  rolledBackStepsCount: number;
  reversedJournalIds: string[];
  errors?: string[];
}> {
  let rolledBackCount = 0;
  const reversedJournalIds: string[] = [];
  const errors: string[] = [];

  // Iterate in reverse order so downstream steps are reversed before earlier steps
  for (let i = plan.steps.length - 1; i >= 0; i--) {
    const step = plan.steps[i];
    if (step.status === 'COMPLETED' && step.result?.journalEntryId) {
      try {
        const revRes = await reverseFinancialTransaction(supabase, {
          userId,
          journalEntryId: step.result.journalEntryId,
          reason: `Rollback of step ${step.stepIndex} in plan: ${plan.title}`,
          idempotencyKey: `PLAN:ROLLBACK:${plan.planId}:${step.stepIndex}`,
        });

        if (revRes.success && revRes.reversalEntryId) {
          rolledBackCount++;
          reversedJournalIds.push(revRes.reversalEntryId);
          step.status = 'CANCELLED';
        } else {
          errors.push(`Step ${step.stepIndex} reversal failed: ${revRes.error}`);
        }
      } catch (err: any) {
        errors.push(`Step ${step.stepIndex} reversal threw: ${err.message}`);
      }
    }
  }

  plan.status = errors.length > 0 ? 'PARTIAL_FAILURE' : 'ROLLED_BACK';
  return {
    rolledBackStepsCount: rolledBackCount,
    reversedJournalIds,
    errors: errors.length > 0 ? errors : undefined,
  };
}
