-- Production reset schema alignment.
-- Keeps the financial ledger immutable except for a transaction-local reset bypass.
-- Removes stale references to legacy loan_payments/loan_repayments and nonexistent transaction columns.

CREATE OR REPLACE FUNCTION public.reset_user_data(p_reset_id text, p_confirmation_phrase text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted jsonb := '{}'::jsonb;
  v_count bigint;
  v_total bigint := 0;
  v_remaining bigint := 0;
BEGIN
  IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN RAISE EXCEPTION 'Authentication required.'; END IF;
  IF p_confirmation_phrase IS DISTINCT FROM 'RESET MY DATA' THEN RAISE EXCEPTION 'Confirmation mismatch.'; END IF;
  IF p_reset_id IS NULL OR length(trim(p_reset_id)) = 0 THEN RAISE EXCEPTION 'Reset identifier required.'; END IF;

  PERFORM set_config('nisflow.allow_data_reset', 'on', true);

  DELETE FROM public.ledger_audit_log WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_deleted=v_deleted||jsonb_build_object('ledger_audit_log',v_count); v_total=v_total+v_count;
  DELETE FROM public.journal_lines WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_deleted=v_deleted||jsonb_build_object('journal_lines',v_count); v_total=v_total+v_count;
  UPDATE public.journal_entries SET reversal_of_id=NULL WHERE user_id=v_user_id;
  DELETE FROM public.journal_entries WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_deleted=v_deleted||jsonb_build_object('journal_entries',v_count); v_total=v_total+v_count;
  DELETE FROM public.ledger_accounts WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_deleted=v_deleted||jsonb_build_object('ledger_accounts',v_count); v_total=v_total+v_count;

  IF to_regclass('public.bank_statement_transactions') IS NOT NULL THEN DELETE FROM public.bank_statement_transactions WHERE statement_id IN (SELECT id FROM public.bank_statements WHERE user_id=v_user_id); GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count; END IF;
  IF to_regclass('public.budget_categories') IS NOT NULL THEN DELETE FROM public.budget_categories WHERE budget_id IN (SELECT id FROM public.budgets WHERE user_id=v_user_id); GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count; END IF;
  IF to_regclass('public.savings_transactions') IS NOT NULL THEN DELETE FROM public.savings_transactions WHERE goal_id IN (SELECT id FROM public.savings_goals WHERE user_id=v_user_id); GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count; END IF;
  IF to_regclass('public.split_expense_shares') IS NOT NULL THEN DELETE FROM public.split_expense_shares WHERE split_expense_id IN (SELECT id FROM public.split_expenses WHERE user_id=v_user_id) OR counterparty_id IN (SELECT id FROM public.counterparties WHERE user_id=v_user_id); GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count; END IF;
  IF to_regclass('public.transaction_tags') IS NOT NULL THEN DELETE FROM public.transaction_tags WHERE transaction_id IN (SELECT id FROM public.transactions WHERE user_id=v_user_id) OR tag_id IN (SELECT id FROM public.tags WHERE user_id=v_user_id); GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count; END IF;

  DELETE FROM public.documents WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.tax_records WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.recurring_transactions WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.transfers WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.investment_transactions WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.ipo_applications WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.payables WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.receivables WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.third_party_funds WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.split_expenses WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.investments WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.ipos WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.loans WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.bank_statements WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.reconciliations WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.transactions WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.tags WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.counterparties WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.savings_goals WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.budgets WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.net_worth_history WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.net_worth_snapshots WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.monthly_closings WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.automation_rules WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.notifications WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.push_subscriptions WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.ai_insights WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.people WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.categories WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.transaction_categories WHERE user_id=v_user_id AND COALESCE(is_system,false)=false; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;
  DELETE FROM public.accounts WHERE user_id=v_user_id; GET DIAGNOSTICS v_count=ROW_COUNT; v_total=v_total+v_count;

  UPDATE public.profiles SET onboarding_completed=false, updated_at=now() WHERE user_id=v_user_id;

  SELECT (SELECT count(*) FROM public.accounts WHERE user_id=v_user_id)+(SELECT count(*) FROM public.transactions WHERE user_id=v_user_id)+(SELECT count(*) FROM public.journal_entries WHERE user_id=v_user_id)+(SELECT count(*) FROM public.journal_lines WHERE user_id=v_user_id)+(SELECT count(*) FROM public.ledger_accounts WHERE user_id=v_user_id)+(SELECT count(*) FROM public.investments WHERE user_id=v_user_id)+(SELECT count(*) FROM public.loans WHERE user_id=v_user_id)+(SELECT count(*) FROM public.receivables WHERE user_id=v_user_id)+(SELECT count(*) FROM public.payables WHERE user_id=v_user_id)+(SELECT count(*) FROM public.people WHERE user_id=v_user_id) INTO v_remaining;
  IF v_remaining>0 THEN RAISE EXCEPTION 'Reset verification failed: % financial records remain.',v_remaining; END IF;

  INSERT INTO public.audit_logs(user_id,action,entity_type,entity_id,details) VALUES(v_user_id,'USER_DATA_RESET_COMPLETED','user_reset',v_user_id,jsonb_build_object('reset_id',p_reset_id,'timestamp',now(),'total_records_purged',v_total));
  RETURN jsonb_build_object('success',true,'resetId',p_reset_id,'totalDeleted',v_total,'deletedCounts',v_deleted,'verified',true,'remainingRecords',0);
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_user_data(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_data(text,text) TO authenticated;
