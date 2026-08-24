-- 018_fix_reset_schema_connection_contract.sql
-- Aligns the destructive reset RPC with the current production schema.
-- No nonexistent loan_payments/loan_repayments tables, profiles.user_id,
-- or investment_transactions.user_id are referenced.

CREATE OR REPLACE FUNCTION public.reset_user_data(p_reset_id text, p_confirmation_phrase text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted jsonb := '{}'::jsonb;
  v_count bigint := 0;
  v_total bigint := 0;
  v_remaining bigint := 0;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_confirmation_phrase IS DISTINCT FROM 'RESET MY DATA' THEN
    RAISE EXCEPTION 'Confirmation mismatch.' USING ERRCODE = '22023';
  END IF;
  IF p_reset_id IS NULL OR length(btrim(p_reset_id)) = 0 THEN
    RAISE EXCEPTION 'Reset identifier required.' USING ERRCODE = '22023';
  END IF;

  -- Idempotent retry guard.
  IF EXISTS (
    SELECT 1 FROM public.audit_logs
    WHERE user_id = v_user_id
      AND action = 'USER_DATA_RESET_COMPLETED'
      AND details ->> 'reset_id' = p_reset_id
  ) THEN
    RETURN jsonb_build_object('success', true, 'resetId', p_reset_id,
      'totalDeleted', 0, 'deletedCounts', '{}'::jsonb,
      'verified', true, 'remainingRecords', 0, 'idempotentRetry', true);
  END IF;

  PERFORM set_config('nisflow.allow_data_reset', 'on', true);

  -- Child tables without their own user_id.
  IF to_regclass('public.bank_statement_transactions') IS NOT NULL THEN
    DELETE FROM public.bank_statement_transactions
    WHERE statement_id IN (SELECT id FROM public.bank_statements WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
    v_deleted := v_deleted || jsonb_build_object('bank_statement_transactions', v_count);
  END IF;
  IF to_regclass('public.budget_categories') IS NOT NULL THEN
    DELETE FROM public.budget_categories
    WHERE budget_id IN (SELECT id FROM public.budgets WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
    v_deleted := v_deleted || jsonb_build_object('budget_categories', v_count);
  END IF;
  IF to_regclass('public.savings_transactions') IS NOT NULL THEN
    DELETE FROM public.savings_transactions
    WHERE goal_id IN (SELECT id FROM public.savings_goals WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
    v_deleted := v_deleted || jsonb_build_object('savings_transactions', v_count);
  END IF;
  IF to_regclass('public.split_expense_shares') IS NOT NULL THEN
    DELETE FROM public.split_expense_shares
    WHERE split_expense_id IN (SELECT id FROM public.split_expenses WHERE user_id = v_user_id)
       OR counterparty_id IN (SELECT id FROM public.counterparties WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
    v_deleted := v_deleted || jsonb_build_object('split_expense_shares', v_count);
  END IF;
  IF to_regclass('public.transaction_tags') IS NOT NULL THEN
    DELETE FROM public.transaction_tags
    WHERE transaction_id IN (SELECT id FROM public.transactions WHERE user_id = v_user_id)
       OR tag_id IN (SELECT id FROM public.tags WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
    v_deleted := v_deleted || jsonb_build_object('transaction_tags', v_count);
  END IF;
  IF to_regclass('public.investment_transactions') IS NOT NULL THEN
    DELETE FROM public.investment_transactions
    WHERE investment_id IN (SELECT id FROM public.investments WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
    v_deleted := v_deleted || jsonb_build_object('investment_transactions', v_count);
  END IF;

  -- Ledger history is immutable normally. The reset-specific, transaction-local
  -- bypass is retained; normal posting/reversal protections are unchanged.
  DELETE FROM public.journal_lines WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('journal_lines', v_count);

  UPDATE public.journal_entries SET reversal_of_id = NULL WHERE user_id = v_user_id;
  DELETE FROM public.journal_entries WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('journal_entries', v_count);

  DELETE FROM public.ledger_audit_log WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('ledger_audit_log', v_count);

  DELETE FROM public.ledger_accounts WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('ledger_accounts', v_count);

  -- Direct user-owned data.
  DELETE FROM public.documents WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('documents', v_count);
  DELETE FROM public.tax_records WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('tax_records', v_count);
  DELETE FROM public.recurring_transactions WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('recurring_transactions', v_count);
  DELETE FROM public.transfers WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('transfers', v_count);
  DELETE FROM public.ipo_applications WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('ipo_applications', v_count);
  DELETE FROM public.payables WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('payables', v_count);
  DELETE FROM public.receivables WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('receivables', v_count);
  DELETE FROM public.third_party_funds WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('third_party_funds', v_count);
  DELETE FROM public.split_expenses WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('split_expenses', v_count);
  DELETE FROM public.investments WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('investments', v_count);
  DELETE FROM public.ipos WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('ipos', v_count);
  DELETE FROM public.loans WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('loans', v_count);
  DELETE FROM public.bank_statements WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('bank_statements', v_count);
  DELETE FROM public.reconciliations WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('reconciliations', v_count);
  DELETE FROM public.transactions WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('transactions', v_count);
  DELETE FROM public.tags WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('tags', v_count);
  DELETE FROM public.counterparties WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('counterparties', v_count);
  DELETE FROM public.savings_goals WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('savings_goals', v_count);
  DELETE FROM public.budgets WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('budgets', v_count);
  DELETE FROM public.net_worth_history WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('net_worth_history', v_count);
  DELETE FROM public.net_worth_snapshots WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('net_worth_snapshots', v_count);
  DELETE FROM public.monthly_closings WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('monthly_closings', v_count);
  DELETE FROM public.automation_rules WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('automation_rules', v_count);
  DELETE FROM public.notifications WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('notifications', v_count);
  DELETE FROM public.push_subscriptions WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('push_subscriptions', v_count);
  DELETE FROM public.ai_insights WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('ai_insights', v_count);
  DELETE FROM public.people WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('people', v_count);
  DELETE FROM public.categories WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('categories', v_count);
  DELETE FROM public.transaction_categories WHERE user_id = v_user_id AND COALESCE(is_system, false) = false;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('transaction_categories', v_count);
  DELETE FROM public.accounts WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_total := v_total + v_count;
  v_deleted := v_deleted || jsonb_build_object('accounts', v_count);

  -- profiles is keyed by id in this schema; do not assume a profiles.user_id column.

  SELECT
    (SELECT count(*) FROM public.accounts WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.transactions WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.journal_entries WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.journal_lines WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.ledger_accounts WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.investments WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.loans WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.receivables WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.payables WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.people WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.documents WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.bank_statements WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.reconciliations WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.automation_rules WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.notifications WHERE user_id = v_user_id) +
    (SELECT count(*) FROM public.ai_insights WHERE user_id = v_user_id)
  INTO v_remaining;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Reset verification failed: % financial/application records remain.', v_remaining;
  END IF;

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, details)
  VALUES (v_user_id, 'USER_DATA_RESET_COMPLETED', 'user_reset', v_user_id,
          jsonb_build_object('reset_id', p_reset_id, 'timestamp', now(), 'total_records_purged', v_total));

  RETURN jsonb_build_object('success', true, 'resetId', p_reset_id,
    'totalDeleted', v_total, 'deletedCounts', v_deleted,
    'verified', true, 'remainingRecords', 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_user_data(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_user_data(text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
