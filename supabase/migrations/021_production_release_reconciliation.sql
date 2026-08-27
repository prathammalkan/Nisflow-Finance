-- ==============================================================================
-- NISFLOW FINANCE — MIGRATION 021: PRODUCTION RELEASE RECONCILIATION & HARDENING
-- ==============================================================================
--
-- Comprehensive Production Release Hotfix & Hardening:
-- 1. Additive column reconciliation for:
--    - public.audit_logs (details JSONB)
--    - public.accounts (balance NUMERIC(15,2), current_balance NUMERIC(15,2))
--    - public.loans (name TEXT, loan_type TEXT, principal_amount NUMERIC(15,2),
--                    remaining_principal NUMERIC(15,2), lender_name TEXT,
--                    tenure_months INT, is_deleted BOOLEAN)
--    - public.transactions (linked_transaction_id UUID, journal_entry_id UUID)
-- 2. Authorization Hardening on get_ledger_account_balance (Caller tenant validation)
-- 3. Corrected preview_user_data_reset() without stale column references
-- 4. Authoritative reset_user_data() with topological purge and idempotency
-- 5. Immutability trigger functions respecting transaction-local bypass
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PART 1: SCHEMA ALIGNMENT (Additive, non-destructive)
-- ------------------------------------------------------------------------------

-- Ensure pgcrypto extension is active
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1.1 audit_logs details JSONB column
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB;

-- 1.2 accounts cached balance parity
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS balance NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS current_balance NUMERIC(15,2) DEFAULT 0.00;

UPDATE public.accounts
SET balance = COALESCE(balance, current_balance, 0.00)
WHERE balance IS NULL;

UPDATE public.accounts
SET current_balance = COALESCE(current_balance, balance, 0.00)
WHERE current_balance IS NULL;

-- 1.3 loans table alignment
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS loan_type TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS principal_amount NUMERIC(15,2);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS remaining_principal NUMERIC(15,2);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS lender_name TEXT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS tenure_months INT;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'principal'
    ) THEN
        EXECUTE 'UPDATE public.loans SET principal_amount = principal WHERE principal_amount IS NULL AND principal IS NOT NULL';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'loans' AND column_name = 'type'
    ) THEN
        EXECUTE 'UPDATE public.loans SET loan_type = type WHERE loan_type IS NULL AND type IS NOT NULL';
    END IF;

    UPDATE public.loans 
    SET remaining_principal = COALESCE(remaining_principal, principal_amount, 0) 
    WHERE remaining_principal IS NULL;
END $$;

-- 1.4 transactions table foreign keys
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_journal_entry_id ON public.transactions(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_transactions_linked_tx_id ON public.transactions(linked_transaction_id);


-- ------------------------------------------------------------------------------
-- PART 2: HARDENED get_ledger_account_balance RPC
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_ledger_account_balance(p_ledger_account_id UUID)
RETURNS NUMERIC(15,2) AS $$
DECLARE
    v_account_type public.ledger_account_type;
    v_account_user_id UUID;
    v_balance NUMERIC(15,2);
BEGIN
    -- 1. Reject anonymous / unauthenticated callers
    IF auth.role() = 'anon' OR auth.uid() IS NULL OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'anon' THEN
        RAISE EXCEPTION 'Authentication Required: Anonymous callers cannot query ledger account balances.';
    END IF;

    -- 2. Fetch ledger account metadata
    SELECT account_type, user_id INTO v_account_type, v_account_user_id
    FROM public.ledger_accounts
    WHERE id = p_ledger_account_id;

    -- 3. Tenant validation: Requested ledger account must exist and belong to caller
    -- Missing and cross-tenant accounts return the identical error to prevent ID enumeration
    IF v_account_type IS NULL OR (auth.role() = 'authenticated' AND v_account_user_id <> auth.uid()) THEN
        RAISE EXCEPTION 'Ledger account % not found', p_ledger_account_id;
    END IF;

    -- 4. Calculate balance across all posted & reversed entries
    IF v_account_type IN ('asset', 'expense') THEN
        -- Normal Debit balance: Balance = Debits - Credits
        SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0.00) INTO v_balance
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.ledger_account_id = p_ledger_account_id
          AND je.status IN ('posted', 'reversed');
    ELSE
        -- Normal Credit balance: Balance = Credits - Debits
        SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0.00) INTO v_balance
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.ledger_account_id = p_ledger_account_id
          AND je.status IN ('posted', 'reversed');
    END IF;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.get_ledger_account_balance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ledger_account_balance(UUID) TO authenticated;


-- ------------------------------------------------------------------------------
-- PART 3: IMMUTABILITY TRIGGER FUNCTIONS WITH TRANSACTION-LOCAL BYPASS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_enforce_journal_line_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Permit DELETE strictly inside the authorized reset_user_data() transaction
    IF current_setting('nisflow.allow_data_reset', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Financial Integrity Error: Posted journal lines are immutable. Post a reversal entry instead.';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.fn_enforce_journal_entry_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Permit DELETE and reversal_of_id NULL update strictly inside authorized reset
    IF current_setting('nisflow.allow_data_reset', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    -- Normal execution path
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Financial Integrity Error: Journal entries cannot be deleted. Post a reversal entry instead.';
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'posted' AND NEW.status = 'reversed' THEN
            IF OLD.id <> NEW.id OR
               OLD.user_id <> NEW.user_id OR
               OLD.transaction_date <> NEW.transaction_date OR
               OLD.description <> NEW.description OR
               OLD.idempotency_key <> NEW.idempotency_key THEN
                RAISE EXCEPTION 'Financial Integrity Error: Only the status of a journal entry may be updated to reversed.';
            END IF;
            RETURN NEW;
        ELSE
            RAISE EXCEPTION 'Financial Integrity Error: Journal entries are immutable once posted.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ------------------------------------------------------------------------------
-- PART 4: AUTHORITATIVE PREVIEW USER DATA RESET RPC
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.preview_user_data_reset()
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_result JSONB;
    v_accounts INT := 0;
    v_transactions INT := 0;
    v_journal_entries INT := 0;
    v_journal_lines INT := 0;
    v_ledger_accounts INT := 0;
    v_counterparties INT := 0;
    v_loans INT := 0;
    v_investments INT := 0;
    v_investment_transactions INT := 0;
    v_receivables INT := 0;
    v_payables INT := 0;
    v_budgets INT := 0;
    v_savings_goals INT := 0;
    v_recurring INT := 0;
    v_documents INT := 0;
    v_bank_statements INT := 0;
    v_reconciliations INT := 0;
    v_ipos INT := 0;
    v_ipo_applications INT := 0;
    v_tags INT := 0;
    v_rules INT := 0;
    v_notifications INT := 0;
    v_tax_records INT := 0;
    v_split_expenses INT := 0;
    v_monthly_closings INT := 0;
    v_snapshots INT := 0;
    v_categories INT := 0;
    v_total INT := 0;
BEGIN
    -- 1. Strictly derive authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
        RAISE EXCEPTION 'Authentication Required: You must be logged in to preview reset counts.';
    END IF;

    -- 2. Gather counts across user-owned tables respecting foreign keys
    SELECT COUNT(*) INTO v_accounts FROM public.accounts WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_transactions FROM public.transactions WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_journal_entries FROM public.journal_entries WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_journal_lines FROM public.journal_lines WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_ledger_accounts FROM public.ledger_accounts WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_counterparties FROM public.counterparties WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_loans FROM public.loans WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_investments FROM public.investments WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_investment_transactions FROM public.investment_transactions WHERE investment_id IN (SELECT id FROM public.investments WHERE user_id = v_user_id);
    SELECT COUNT(*) INTO v_receivables FROM public.receivables WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_payables FROM public.payables WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_budgets FROM public.budgets WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_savings_goals FROM public.savings_goals WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_recurring FROM public.recurring_transactions WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_documents FROM public.documents WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_bank_statements FROM public.bank_statements WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_reconciliations FROM public.reconciliations WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_ipos FROM public.ipos WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_ipo_applications FROM public.ipo_applications WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_tags FROM public.tags WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_rules FROM public.automation_rules WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_notifications FROM public.notifications WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_tax_records FROM public.tax_records WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_split_expenses FROM public.split_expenses WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_monthly_closings FROM public.monthly_closings WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_snapshots FROM public.net_worth_snapshots WHERE user_id = v_user_id;
    SELECT COUNT(*) INTO v_categories FROM public.transaction_categories WHERE user_id = v_user_id AND (is_system = false OR is_system IS NULL);

    v_total := v_accounts + v_transactions + v_journal_entries + v_journal_lines + v_ledger_accounts +
               v_counterparties + v_loans + v_investments + v_investment_transactions + v_receivables +
               v_payables + v_budgets + v_savings_goals + v_recurring + v_documents + v_bank_statements +
               v_reconciliations + v_ipos + v_ipo_applications + v_tags + v_rules + v_notifications +
               v_tax_records + v_split_expenses + v_monthly_closings + v_snapshots + v_categories;

    v_result := jsonb_build_object(
        'totalRecords', v_total,
        'breakdown', jsonb_build_object(
            'accounts', v_accounts,
            'transactions', v_transactions,
            'journal_entries', v_journal_entries,
            'journal_lines', v_journal_lines,
            'ledger_accounts', v_ledger_accounts,
            'counterparties', v_counterparties,
            'loans', v_loans,
            'investments', v_investments,
            'investment_transactions', v_investment_transactions,
            'receivables', v_receivables,
            'payables', v_payables,
            'budgets', v_budgets,
            'savings_goals', v_savings_goals,
            'recurring_transactions', v_recurring,
            'documents', v_documents,
            'bank_statements', v_bank_statements,
            'reconciliations', v_reconciliations,
            'ipos', v_ipos,
            'ipo_applications', v_ipo_applications,
            'tags', v_tags,
            'automation_rules', v_rules,
            'notifications', v_notifications,
            'tax_records', v_tax_records,
            'split_expenses', v_split_expenses,
            'monthly_closings', v_monthly_closings,
            'net_worth_snapshots', v_snapshots,
            'custom_categories', v_categories
        )
    );

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.preview_user_data_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_user_data_reset() TO authenticated;


-- ------------------------------------------------------------------------------
-- PART 5: AUTHORITATIVE RESET USER DATA RPC (Topological Atomic Purge)
-- ------------------------------------------------------------------------------

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
