-- ==============================================================================
-- NISFLOW FINANCE — MIGRATION 023: ADMIN ACCESS CONTROL AND FORCE RLS
-- ==============================================================================

-- ==============================================================================
-- PART 1: FORCE ROW LEVEL SECURITY on ALL tables
-- ==============================================================================

DO $$ 
DECLARE
    t_name text;
    tables text[] := ARRAY[
        'profiles', 'accounts', 'transaction_categories', 'transactions', 
        'counterparties', 'ipos', 'investments', 'tags', 'transaction_tags', 
        'transfers', 'receivables', 'payables', 'loans', 'third_party_funds', 
        'ipo_applications', 'investment_transactions', 'budgets', 
        'budget_categories', 'savings_goals', 'documents', 'bank_statements', 
        'bank_statement_transactions', 'reconciliations', 'monthly_closings', 
        'audit_logs', 'automation_rules', 'notifications', 'tax_records', 
        'split_expenses', 'split_expense_shares', 'ledger_accounts', 
        'journal_entries', 'journal_lines', 'ledger_audit_log', 
        'recurring_transactions', 'net_worth_snapshots'
    ];
BEGIN
    FOREACH t_name IN ARRAY tables LOOP
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t_name) THEN
            EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t_name);
        END IF;
    END LOOP;
END $$;

-- ==============================================================================
-- PART 2: Fix audit_logs INSERT policy
-- ==============================================================================

DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can insert own audit logs" ON public.audit_logs;

CREATE POLICY "Users can insert own audit logs" ON public.audit_logs
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.insert_system_audit_log(
    p_user_id UUID,
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id UUID,
    p_details JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
    VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_details)
    RETURNING id INTO v_log_id;
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- PART 3: Fix profiles reset WHERE clause
-- ==============================================================================

-- Re-create reset_user_data with corrected profile update
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

    -- Step 36: Reset profiles state without deleting identity row (user_id = v_user_id)
    -- FIXED: Using user_id instead of id
    UPDATE public.profiles
    SET onboarding_completed = false,
        updated_at = NOW()
    WHERE user_id = v_user_id;

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

-- ==============================================================================
-- PART 4: Admin Access Control System
-- ==============================================================================

-- 4a. app_access_settings table
CREATE TABLE IF NOT EXISTS public.app_access_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_mode TEXT NOT NULL DEFAULT 'public' CHECK (registration_mode IN ('public', 'approval_required')),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.app_access_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_access_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view app access settings"
    ON public.app_access_settings FOR SELECT
    TO authenticated
    USING (true);

-- Ensure a single default row exists
INSERT INTO public.app_access_settings (registration_mode)
SELECT 'public'
WHERE NOT EXISTS (SELECT 1 FROM public.app_access_settings);

-- 4b. user_access_control table
CREATE TABLE IF NOT EXISTS public.user_access_control (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'suspended')),
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES auth.users(id),
    suspended_at TIMESTAMPTZ,
    suspended_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_access_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_access_control FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own access control status"
    ON public.user_access_control FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- 4c. Admin bootstrap
CREATE TABLE IF NOT EXISTS public.app_admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    granted_by TEXT NOT NULL DEFAULT 'bootstrap' -- 'bootstrap' for initial, or admin user_id
);

ALTER TABLE public.app_admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_admin_users FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users can view admin status"
    ON public.app_admin_users FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM public.app_admin_users WHERE user_id = auth.uid())
    );

CREATE OR REPLACE FUNCTION public.is_app_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.app_admin_users WHERE user_id = p_user_id);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_admin_count INT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    SELECT COUNT(*) INTO v_admin_count FROM public.app_admin_users;
    IF v_admin_count > 0 THEN
        RAISE EXCEPTION 'Admin already exists. Use grant_admin_role() instead.';
    END IF;
    
    INSERT INTO public.app_admin_users (user_id, granted_by)
    VALUES (v_user_id, 'bootstrap');
    
    -- Ensure caller's access is approved
    INSERT INTO public.user_access_control (user_id, status, approved_at, approved_by)
    VALUES (v_user_id, 'approved', NOW(), v_user_id)
    ON CONFLICT (user_id) DO UPDATE 
    SET status = 'approved', approved_at = NOW(), approved_by = v_user_id, updated_at = NOW();
    
    RETURN jsonb_build_object('success', true, 'admin_user_id', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated;

-- 4e. Admin Audit Log (needed before RPCs)
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES auth.users(id) NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('USER_APPROVED', 'USER_SUSPENDED', 'USER_REACTIVATED', 'REGISTRATION_MODE_CHANGED', 'ADMIN_GRANTED', 'ADMIN_REVOKED')),
    target_user_id UUID REFERENCES auth.users(id),
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    result TEXT NOT NULL DEFAULT 'success',
    metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
    ON public.admin_audit_log FOR SELECT
    TO authenticated
    USING (public.is_app_admin(auth.uid()));

-- 4d. Admin RPCs
CREATE OR REPLACE FUNCTION public.approve_user(p_target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_admin_id UUID := auth.uid();
BEGIN
    IF NOT public.is_app_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
    END IF;

    UPDATE public.user_access_control
    SET status = 'approved', approved_at = NOW(), approved_by = v_admin_id, updated_at = NOW()
    WHERE user_id = p_target_user_id;

    INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id)
    VALUES (v_admin_id, 'USER_APPROVED', p_target_user_id);

    RETURN jsonb_build_object('success', true, 'status', 'approved');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.approve_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_user(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.suspend_user(p_target_user_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
    v_admin_id UUID := auth.uid();
BEGIN
    IF NOT public.is_app_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
    END IF;

    IF public.is_app_admin(p_target_user_id) THEN
        RAISE EXCEPTION 'Cannot suspend another admin';
    END IF;

    UPDATE public.user_access_control
    SET status = 'suspended', suspended_at = NOW(), suspended_by = v_admin_id, updated_at = NOW()
    WHERE user_id = p_target_user_id;

    INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id, metadata)
    VALUES (v_admin_id, 'USER_SUSPENDED', p_target_user_id, jsonb_build_object('reason', p_reason));

    RETURN jsonb_build_object('success', true, 'status', 'suspended');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.suspend_user(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suspend_user(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.reactivate_user(p_target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_admin_id UUID := auth.uid();
BEGIN
    IF NOT public.is_app_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
    END IF;

    UPDATE public.user_access_control
    SET status = 'approved', updated_at = NOW()
    WHERE user_id = p_target_user_id AND status = 'suspended';

    INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id)
    VALUES (v_admin_id, 'USER_REACTIVATED', p_target_user_id);

    RETURN jsonb_build_object('success', true, 'status', 'approved');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.reactivate_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reactivate_user(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_registration_mode(p_mode TEXT)
RETURNS JSONB AS $$
DECLARE
    v_admin_id UUID := auth.uid();
BEGIN
    IF NOT public.is_app_admin(v_admin_id) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
    END IF;

    IF p_mode NOT IN ('public', 'approval_required') THEN
        RAISE EXCEPTION 'Invalid mode: must be public or approval_required';
    END IF;

    UPDATE public.app_access_settings
    SET registration_mode = p_mode, updated_at = NOW(), updated_by = v_admin_id;

    INSERT INTO public.admin_audit_log (actor_user_id, action, metadata)
    VALUES (v_admin_id, 'REGISTRATION_MODE_CHANGED', jsonb_build_object('mode', p_mode));

    RETURN jsonb_build_object('success', true, 'mode', p_mode);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.set_registration_mode(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_registration_mode(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_user_list()
RETURNS TABLE (
    user_id UUID,
    status TEXT,
    is_admin BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    IF NOT public.is_app_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
    END IF;

    RETURN QUERY
    SELECT 
        u.id, 
        COALESCE(uac.status, 'approved') as status,
        public.is_app_admin(u.id) as is_admin,
        u.created_at
    FROM auth.users u
    LEFT JOIN public.user_access_control uac ON u.id = uac.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_admin_user_list() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_user_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_access_status()
RETURNS JSONB AS $$
DECLARE
    v_status TEXT;
    v_is_admin BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT status INTO v_status FROM public.user_access_control WHERE user_id = auth.uid();
    v_status := COALESCE(v_status, 'approved');
    v_is_admin := public.is_app_admin(auth.uid());

    RETURN jsonb_build_object(
        'status', v_status,
        'is_admin', v_is_admin
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_current_access_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_access_status() TO authenticated;

-- 4f. RLS Policies for Pending/Suspended User Isolation
CREATE OR REPLACE FUNCTION public.is_user_approved()
RETURNS BOOLEAN AS $$
BEGIN
    -- If no access control record exists, treat as approved (backward compatibility for existing users)
    RETURN COALESCE(
        (SELECT status = 'approved' FROM public.user_access_control WHERE user_id = auth.uid()),
        true  -- No record = approved (handles users created before this migration)
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

DO $$ 
DECLARE
    t_name text;
    tables text[] := ARRAY[
        'accounts', 'transactions', 'transaction_categories', 'counterparties', 
        'ipos', 'investments', 'tags', 'transaction_tags', 'transfers', 
        'receivables', 'payables', 'loans', 'third_party_funds', 
        'ipo_applications', 'investment_transactions', 'budgets', 
        'budget_categories', 'savings_goals', 'documents', 'bank_statements', 
        'bank_statement_transactions', 'reconciliations', 'monthly_closings', 
        'automation_rules', 'tax_records', 'split_expenses', 
        'split_expense_shares', 'ledger_accounts', 'journal_entries', 
        'journal_lines', 'ledger_audit_log', 'recurring_transactions', 
        'net_worth_snapshots'
    ];
BEGIN
    FOREACH t_name IN ARRAY tables LOOP
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = t_name) THEN
            EXECUTE format('DROP POLICY IF EXISTS "approved_users_only_%I" ON public.%I;', t_name, t_name);
            EXECUTE format('
                CREATE POLICY "approved_users_only_%I" ON public.%I
                AS RESTRICTIVE
                FOR ALL
                TO authenticated
                USING (public.is_user_approved());
            ', t_name, t_name);
        END IF;
    END LOOP;
END $$;

-- 4g. Auto-create user_access_control on registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_reg_mode TEXT;
BEGIN
    -- Create profile
    INSERT INTO public.profiles (user_id, display_name, currency, timezone, onboarding_completed)
    VALUES (new.id, new.raw_user_meta_data->>'full_name', 'INR', 'UTC', false);
    
    -- Determine registration mode
    SELECT registration_mode INTO v_reg_mode FROM public.app_access_settings LIMIT 1;
    
    -- Create access control record
    INSERT INTO public.user_access_control (user_id, status, approved_at)
    VALUES (
        new.id,
        CASE WHEN COALESCE(v_reg_mode, 'public') = 'public' THEN 'approved' ELSE 'pending' END,
        CASE WHEN COALESCE(v_reg_mode, 'public') = 'public' THEN NOW() ELSE NULL END
    );
    
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
