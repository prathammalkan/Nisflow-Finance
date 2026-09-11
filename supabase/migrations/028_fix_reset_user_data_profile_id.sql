-- Migration 028: Fix reset_user_data() profile column reference
-- Problem: reset_user_data() used WHERE user_id = v_user_id on public.profiles.
-- In public.profiles, the primary key referencing auth.users(id) is named 'id', not 'user_id'.
-- Fix: Update Step 36 to WHERE id = v_user_id.

CREATE OR REPLACE FUNCTION public.reset_user_data(
    p_reset_id TEXT,
    p_confirmation_phrase TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_deleted_counts JSONB := '{}'::jsonb;
    v_count INT;
    v_total_deleted INT := 0;
    v_remaining_check INT;
    v_prior_reset JSONB;
BEGIN
    -- 1. Strict Authentication & Caller Derivation
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
        RAISE EXCEPTION 'Authentication Required: Anonymous callers cannot reset user data.';
    END IF;

    -- 2. Strict Confirmation Phrase Validation (Exact case match)
    IF p_confirmation_phrase IS NULL OR p_confirmation_phrase <> 'RESET MY DATA' THEN
        RAISE EXCEPTION 'Confirmation Mismatch: You must provide the exact confirmation phrase ''RESET MY DATA''.';
    END IF;

    IF p_reset_id IS NULL OR length(trim(p_reset_id)) = 0 THEN
        RAISE EXCEPTION 'Invalid Reset Identifier: p_reset_id is required for idempotency and auditing.';
    END IF;

    -- 3. Idempotency Guard (Scoped to auth.uid())
    SELECT details INTO v_prior_reset
    FROM public.audit_logs
    WHERE user_id = v_user_id
      AND action = 'USER_DATA_RESET_COMPLETED'
      AND details->>'reset_id' = p_reset_id
    LIMIT 1;

    IF v_prior_reset IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'idempotent', true,
            'resetId', p_reset_id,
            'totalDeleted', 0,
            'deletedCounts', '{}'::jsonb,
            'verified', true,
            'message', 'Reset already completed for this reset_id. No changes made.'
        );
    END IF;

    -- 4. Enable Scoped Transaction-Local Immutability Bypass
    PERFORM set_config('nisflow.allow_data_reset', 'on', true);

    -- 5. Topological Deletion Order (Zero FK Violations)

    -- Step 1: ledger_audit_log
    DELETE FROM public.ledger_audit_log WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('ledger_audit_log', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 2: journal_lines
    DELETE FROM public.journal_lines WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('journal_lines', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 3: journal_entries
    UPDATE public.journal_entries SET reversal_of_id = NULL WHERE user_id = v_user_id;
    DELETE FROM public.journal_entries WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('journal_entries', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 4: ledger_accounts
    DELETE FROM public.ledger_accounts WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('ledger_accounts', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 5: bank_statement_transactions
    DELETE FROM public.bank_statement_transactions
    WHERE statement_id IN (SELECT id FROM public.bank_statements WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('bank_statement_transactions', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 6: bank_statements
    DELETE FROM public.bank_statements WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('bank_statements', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 7: reconciliations
    DELETE FROM public.reconciliations WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('reconciliations', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 8: split_expense_shares
    DELETE FROM public.split_expense_shares
    WHERE split_expense_id IN (SELECT id FROM public.split_expenses WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('split_expense_shares', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 9: split_expenses
    DELETE FROM public.split_expenses WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('split_expenses', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 10: transaction_tags
    DELETE FROM public.transaction_tags
    WHERE transaction_id IN (SELECT id FROM public.transactions WHERE user_id = v_user_id)
       OR tag_id IN (SELECT id FROM public.tags WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('transaction_tags', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 11: transfers
    DELETE FROM public.transfers WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('transfers', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 12: tax_records
    DELETE FROM public.tax_records WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('tax_records', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 13: documents
    DELETE FROM public.documents WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('documents', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 14: recurring_transactions
    DELETE FROM public.recurring_transactions WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('recurring_transactions', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 15: budget_categories
    DELETE FROM public.budget_categories
    WHERE budget_id IN (SELECT id FROM public.budgets WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('budget_categories', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 16: budgets
    DELETE FROM public.budgets WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('budgets', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 17: savings_goals
    DELETE FROM public.savings_goals WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('savings_goals', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 18: receivables
    DELETE FROM public.receivables WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('receivables', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 19: payables
    DELETE FROM public.payables WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('payables', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 20: loans
    DELETE FROM public.loans WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('loans', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 21: third_party_funds
    DELETE FROM public.third_party_funds WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('third_party_funds', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 22: investment_transactions
    DELETE FROM public.investment_transactions
    WHERE investment_id IN (SELECT id FROM public.investments WHERE user_id = v_user_id);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('investment_transactions', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 23: investments
    DELETE FROM public.investments WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('investments', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 24: ipo_applications
    DELETE FROM public.ipo_applications WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('ipo_applications', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 25: ipos
    DELETE FROM public.ipos WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('ipos', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 26: transactions
    UPDATE public.transactions SET linked_transaction_id = NULL, journal_entry_id = NULL WHERE user_id = v_user_id;
    DELETE FROM public.transactions WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('transactions', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 27: counterparties
    DELETE FROM public.counterparties WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('counterparties', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 28: tags
    DELETE FROM public.tags WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('tags', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 29: transaction_categories (preserve system categories)
    DELETE FROM public.transaction_categories
    WHERE user_id = v_user_id AND (is_system = false OR is_system IS NULL);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('custom_categories', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 30: automation_rules
    DELETE FROM public.automation_rules WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('automation_rules', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 31: notifications
    DELETE FROM public.notifications WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('notifications', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 32: net_worth_snapshots
    DELETE FROM public.net_worth_snapshots WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('net_worth_snapshots', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 33: monthly_closings
    DELETE FROM public.monthly_closings WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('monthly_closings', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 34: accounts
    DELETE FROM public.accounts WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('accounts', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 35: historical audit_logs for user
    DELETE FROM public.audit_logs WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('audit_logs', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 36: Reset profiles state without deleting identity row (id = v_user_id)
    UPDATE public.profiles
    SET onboarding_completed = false,
        updated_at = NOW()
    WHERE id = v_user_id;

    -- 6. Strict Post-Reset Verification
    SELECT COUNT(*) INTO v_remaining_check FROM public.accounts WHERE user_id = v_user_id;
    IF v_remaining_check > 0 THEN RAISE EXCEPTION 'Verification Failed: % accounts remain.', v_remaining_check; END IF;

    SELECT COUNT(*) INTO v_remaining_check FROM public.ledger_accounts WHERE user_id = v_user_id;
    IF v_remaining_check > 0 THEN RAISE EXCEPTION 'Verification Failed: % ledger_accounts remain.', v_remaining_check; END IF;

    SELECT COUNT(*) INTO v_remaining_check FROM public.journal_entries WHERE user_id = v_user_id;
    IF v_remaining_check > 0 THEN RAISE EXCEPTION 'Verification Failed: % journal_entries remain.', v_remaining_check; END IF;

    SELECT COUNT(*) INTO v_remaining_check FROM public.journal_lines WHERE user_id = v_user_id;
    IF v_remaining_check > 0 THEN RAISE EXCEPTION 'Verification Failed: % journal_lines remain.', v_remaining_check; END IF;

    SELECT COUNT(*) INTO v_remaining_check FROM public.transactions WHERE user_id = v_user_id;
    IF v_remaining_check > 0 THEN RAISE EXCEPTION 'Verification Failed: % transactions remain.', v_remaining_check; END IF;

    -- 7. Record Single Non-Sensitive Audit Completion Event
    INSERT INTO public.audit_logs (
        user_id,
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        v_user_id,
        'USER_DATA_RESET_COMPLETED',
        'user_reset',
        v_user_id,
        jsonb_build_object(
            'reset_id', p_reset_id,
            'timestamp', NOW(),
            'total_records_purged', v_total_deleted
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'idempotent', false,
        'resetId', p_reset_id,
        'totalDeleted', v_total_deleted,
        'deletedCounts', v_deleted_counts,
        'verified', true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.reset_user_data(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_data(TEXT, TEXT) TO authenticated;
