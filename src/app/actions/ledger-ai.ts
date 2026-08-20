'use server';

import { createClient } from '@/lib/supabase/server';
import { orchestrateAIAction, type CanonicalAIActionEnvelope, type OrchestratedActionResult } from '@/lib/ledger/ai-orchestrator';
import { preflightPlan, executePlan, rollbackPlan, type AIPlan, type PlanPreflightResult } from '@/lib/ai/plan-orchestrator';

/**
 * Server Action: Confirms and executes an AI action in a trusted server-side context.
 * Strictly verifies the authenticated user from session cookies and delegates to
 * the central AI Action Orchestrator.
 */
export async function executeAIActionServer(
  messageId: string,
  action: CanonicalAIActionEnvelope
): Promise<OrchestratedActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      success: false,
      actionType: action?.actionType || 'unknown',
      message: 'Authentication required',
      errorCode: 'AUTH_REQUIRED',
      error: 'You must be signed in to confirm financial actions.',
      verified: false,
    };
  }

  return orchestrateAIAction(supabase as any, user.id, messageId, action);
}

/**
 * Server Action: Pre-flights all steps of a multi-step financial plan on the server.
 */
export async function preflightPlanServer(plan: AIPlan): Promise<PlanPreflightResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      canExecute: false,
      steps: [],
      overallError: 'You must be signed in to pre-flight financial plans.',
    };
  }

  return preflightPlan(supabase as any, user.id, plan);
}

/**
 * Server Action: Executes a multi-step plan with Partial Execution Protection.
 */
export async function executePlanServer(plan: AIPlan): Promise<AIPlan> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      ...plan,
      status: 'FAILED',
      error: 'You must be signed in to execute financial plans.',
    };
  }

  return executePlan(supabase as any, user.id, plan);
}

/**
 * Server Action: Reverses/rolls back completed steps of a failed or cancelled multi-step plan.
 */
export async function rollbackPlanServer(plan: AIPlan): Promise<{
  rolledBackStepsCount: number;
  reversedJournalIds: string[];
  errors?: string[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return {
      rolledBackStepsCount: 0,
      reversedJournalIds: [],
      errors: ['You must be signed in to rollback financial plans.'],
    };
  }

  return rollbackPlan(supabase as any, user.id, plan);
}
