-- 013_reset_idempotency.sql
-- DB-03: Add idempotency guard to reset_user_data RPC.
--
-- Problem: A repeated call to reset_user_data() with the same p_reset_id was accepted without
-- checking whether that reset_id already completed. This created duplicate USER_DATA_RESET_COMPLETED
-- audit records. On a second call, all tables are empty so no data is lost, but the duplicate
-- audit entries are misleading and the behaviour is incorrect.
--
-- Fix: At the start of reset_user_data(), after authentication and confirmation checks, query
-- audit_logs for a completed reset with this user's ID + this reset_id. If found, return a
-- deterministic idempotent success response without re-executing the destructive path.
--
-- Security invariants preserved:
--   - v_user_id := auth.uid() — client cannot override
--   - User A's reset_id cannot be replayed by User B (idempotency check is scoped to auth.uid())
--   - Confirmation phrase 'RESET MY DATA' is still required even on idempotent retry
--   - nisflow.allow_data_reset bypass is NOT set for the idempotent path (no data touched)
--   - auth.users table remains untouched
--   - System categories remain untouched

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
    -- 1. STRICT AUTHENTICATION & CALLER VERIFICATION
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
        RAISE EXCEPTION 'Authentication Required: Anonymous callers cannot reset user data.';
    END IF;

    -- 2. STRICT CONFIRMATION PHRASE VERIFICATION (Exact case match)
    IF p_confirmation_phrase IS NULL OR p_confirmation_phrase <> 'RESET MY DATA' THEN
        RAISE EXCEPTION 'Confirmation Mismatch: You must provide the exact confirmation phrase ''RESET MY DATA''.';
    END IF;

    IF p_reset_id IS NULL OR length(trim(p_reset_id)) = 0 THEN
        RAISE EXCEPTION 'Invalid Reset Identifier: p_reset_id is required for idempotency and auditing.';
    END IF;

    -- DB-03: IDEMPOTENCY GUARD
    -- Check whether this exact (user_id, reset_id) pair has already completed.
    -- Scoped to auth.uid() so User B cannot replay User A's reset_id to obtain any information
    -- about User A's prior resets.
    SELECT details INTO v_prior_reset
    FROM public.audit_logs
    WHERE user_id = v_user_id
      AND action = 'USER_DATA_RESET_COMPLETED'
      AND details->>'reset_id' = p_reset_id
    LIMIT 1;

    IF v_prior_reset IS NOT NULL THEN
        -- Already completed — return idempotent success without re-executing the destructive path.
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

    -- 3. ENABLE SCOPED TRANSACTION-LOCAL IMMUTABILITY TRIGGER BYPASS
    PERFORM set_config('nisflow.allow_data_reset', 'on', true);

    -- 4. TOPOLOGICAL DELETION ORDER (Zero FK Violations)

    -- Step 1: ledger_audit_log (References journal_entries with RESTRICT)
    DELETE FROM public.ledger_audit_log WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('ledger_audit_log', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 2: journal_lines (References journal_entries and ledger_accounts with RESTRICT)
    DELETE FROM public.journal_lines WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('journal_lines', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 3: journal_entries (Break self-reference cycles, then delete)
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

    -- Step 5: bank_statement_transactions (Indirectly owned via bank_statements)
    DELETE FROM public.bank_statement_transactions
    WHERE statement_id IN (
        SELECT id FROM public.bank_statements WHERE user_id = v_user_id
    );
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

    -- Step 8: transactions
    DELETE FROM public.transactions WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('transactions', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 9: receivables
    DELETE FROM public.receivables WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('receivables', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 10: payables
    DELETE FROM public.payables WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('payables', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 11: loan_repayments (if table exists)
    DELETE FROM public.loan_repayments WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('loan_repayments', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 12: loans
    DELETE FROM public.loans WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('loans', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 13: investment_transactions
    DELETE FROM public.investment_transactions WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('investment_transactions', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 14: investments
    DELETE FROM public.investments WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('investments', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 15: counterparties
    DELETE FROM public.counterparties WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('counterparties', v_count);
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

    -- Step 18: documents
    DELETE FROM public.documents WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('documents', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 19: recurring_transactions
    DELETE FROM public.recurring_transactions WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('recurring_transactions', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 20: notifications
    DELETE FROM public.notifications WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('notifications', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 21: net_worth_snapshots
    DELETE FROM public.net_worth_snapshots WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('net_worth_snapshots', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 22: accounts
    DELETE FROM public.accounts WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('accounts', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 23: custom transaction_categories (preserve system categories)
    DELETE FROM public.transaction_categories
    WHERE user_id = v_user_id AND (is_system = false OR is_system IS NULL);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('custom_categories', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 24: audit_logs for this user
    DELETE FROM public.audit_logs WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('audit_logs', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 25: Reset profiles state without deleting identity row
    UPDATE public.profiles
    SET onboarding_completed = false,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    -- 5. STRICT POST-RESET ZERO-RECORD VERIFICATION
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

    SELECT COUNT(*) INTO v_remaining_check FROM public.counterparties WHERE user_id = v_user_id;
    IF v_remaining_check > 0 THEN RAISE EXCEPTION 'Verification Failed: % counterparties remain.', v_remaining_check; END IF;

    SELECT COUNT(*) INTO v_remaining_check FROM public.loans WHERE user_id = v_user_id;
    IF v_remaining_check > 0 THEN RAISE EXCEPTION 'Verification Failed: % loans remain.', v_remaining_check; END IF;

    SELECT COUNT(*) INTO v_remaining_check FROM public.investments WHERE user_id = v_user_id;
    IF v_remaining_check > 0 THEN RAISE EXCEPTION 'Verification Failed: % investments remain.', v_remaining_check; END IF;

    SELECT COUNT(*) INTO v_remaining_check FROM public.transaction_categories WHERE user_id = v_user_id AND (is_system = false OR is_system IS NULL);
    IF v_remaining_check > 0 THEN RAISE EXCEPTION 'Verification Failed: % custom categories remain.', v_remaining_check; END IF;

    -- 6. RECORD SINGLE NON-SENSITIVE AUDIT EVENT TO PROVE DESTRUCTIVE RESET
    -- NOTE: We deleted all audit_logs for this user above; now we insert a fresh completion record.
    -- The idempotency check at the top of this function will find this record on any future call
    -- with the same reset_id, preventing re-execution.
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

-- Re-apply execute grants (preserves existing grant from migration 011)
REVOKE EXECUTE ON FUNCTION public.reset_user_data(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_data(TEXT, TEXT) TO authenticated;
