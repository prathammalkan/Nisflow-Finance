-- ==============================================================================
-- NISFLOW FINANCE — CANONICAL PRODUCTION MIGRATIONS BUNDLE (012 & 013)
-- Execute this entire file in Supabase Dashboard > SQL Editor
-- Target Project: https://supabase.com/dashboard/project/qyjhicibrciqcznsdevk/sql/new
--
-- Safety & Invariants:
--   - 100% Non-destructive: Does NOT alter existing user accounts, balances, or transactions
--   - Preserves RLS, foreign keys, and multi-tenant isolation
--   - Adds missing public.audit_logs.details JSONB column
--   - Updates reset_user_data with DB-03 idempotency guard
--   - Hardens get_ledger_account_balance (BOLA fix) & post_journal_entry (actor spoofing fix)
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. MIGRATION 012: SCHEMA ALIGNMENT & SECURITY HARDENING
-- ==============================================================================

-- 1.1 DB-001: Ensure audit_logs has details JSONB column
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS details JSONB;

-- 1.2 SEC-003: Hardened get_ledger_account_balance with caller ownership check
CREATE OR REPLACE FUNCTION public.get_ledger_account_balance(p_ledger_account_id UUID)
RETURNS NUMERIC(15,2) AS $$
DECLARE
    v_account_type public.ledger_account_type;
    v_account_user_id UUID;
    v_balance NUMERIC(15,2);
BEGIN
    -- 1. Reject anonymous callers
    IF auth.role() = 'anon' OR auth.uid() IS NULL OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'anon' THEN
        RAISE EXCEPTION 'Authentication Required: Anonymous callers cannot query ledger account balances.';
    END IF;

    -- 2. Fetch ledger account metadata
    SELECT account_type, user_id INTO v_account_type, v_account_user_id
    FROM public.ledger_accounts
    WHERE id = p_ledger_account_id;

    -- 3. Invariant: Requested ledger account must exist and belong to caller
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

-- 1.3 SEC-004: Hardened post_journal_entry with strict auth.uid() actor derivation
CREATE OR REPLACE FUNCTION public.post_journal_entry(
    p_user_id UUID,
    p_transaction_date DATE,
    p_description TEXT,
    p_source_type TEXT,
    p_source_id TEXT,
    p_idempotency_key TEXT,
    p_lines JSONB,
    p_created_by UUID,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_existing_entry_id UUID;
    v_new_entry_id UUID;
    v_total_debit NUMERIC(15,2) := 0.00;
    v_total_credit NUMERIC(15,2) := 0.00;
    v_line_count INT;
    v_line RECORD;
    v_account_ids UUID[] := ARRAY[]::UUID[];
    v_payload_text TEXT := '';
    v_payload_hash TEXT;
    v_line_account_type public.ledger_account_type;
    v_line_entity_type TEXT;
    v_line_entity_id UUID;
    v_line_delta NUMERIC(15,2);
    v_actor_id UUID;
BEGIN
    -- 0. AUTHENTICATION & CALLER AUTHORIZATION INVARIANTS
    IF auth.role() = 'anon' OR auth.uid() IS NULL OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'anon' THEN
        RAISE EXCEPTION 'Authentication Required: Anonymous callers cannot post journal entries.';
    END IF;

    IF auth.role() = 'authenticated' AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Authorization Error: Caller auth.uid (%) does not match target user_id (%).',
            auth.uid(), p_user_id;
    END IF;

    -- Authoritatively derive actor strictly from auth.uid() (ignores client-supplied p_created_by)
    v_actor_id := auth.uid();

    -- 1. Idempotency Check: Return existing entry ID if already posted
    SELECT id INTO v_existing_entry_id
    FROM public.journal_entries
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

    IF v_existing_entry_id IS NOT NULL THEN
        RETURN v_existing_entry_id;
    END IF;

    -- 2. Validate Line Count (Double entry mandates >= 2 lines)
    v_line_count := jsonb_array_length(p_lines);
    IF v_line_count < 2 THEN
        RAISE EXCEPTION 'Financial Integrity Error: A journal entry must have at least 2 lines (found %).', v_line_count;
    END IF;

    -- 3. Extract and lock all involved ledger accounts in sorted order to prevent deadlocks
    FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
        ledger_account_id UUID,
        debit_amount NUMERIC(15,2),
        credit_amount NUMERIC(15,2),
        currency TEXT,
        memo TEXT
    )
    LOOP
        v_account_ids := array_append(v_account_ids, v_line.ledger_account_id);
        
        -- Validate line values
        IF v_line.debit_amount < 0 OR v_line.credit_amount < 0 THEN
            RAISE EXCEPTION 'Financial Integrity Error: Debit and credit amounts must be non-negative.';
        END IF;
        
        IF (v_line.debit_amount = 0 AND v_line.credit_amount = 0) OR
           (v_line.debit_amount > 0 AND v_line.credit_amount > 0) THEN
            RAISE EXCEPTION 'Financial Integrity Error: Each line must have strictly positive debit OR credit, not both or neither.';
        END IF;

        v_total_debit := v_total_debit + v_line.debit_amount;
        v_total_credit := v_total_credit + v_line.credit_amount;
    END LOOP;

    -- 4. Balancing Invariant Check: SUM(Debits) === SUM(Credits)
    IF v_total_debit <> v_total_credit THEN
        RAISE EXCEPTION 'Financial Integrity Error: Unbalanced journal entry. Total Debits (%) must equal Total Credits (%). Discrepancy: %',
            v_total_debit, v_total_credit, (v_total_debit - v_total_credit);
    END IF;

    IF v_total_debit <= 0 THEN
        RAISE EXCEPTION 'Financial Integrity Error: Total journal amount must be strictly greater than zero.';
    END IF;

    -- 5. Lock affected ledger accounts (SELECT ... FOR UPDATE) and verify ownership
    PERFORM id FROM public.ledger_accounts
    WHERE id = ANY(v_account_ids) AND user_id = p_user_id
    ORDER BY id
    FOR UPDATE;

    -- Verify all accounts exist and belong to target user
    IF (SELECT COUNT(*) FROM public.ledger_accounts WHERE id = ANY(v_account_ids) AND user_id = p_user_id) <> array_length(v_account_ids, 1) THEN
        RAISE EXCEPTION 'Financial Integrity Error: One or more ledger accounts do not exist or belong to another user.';
    END IF;

    -- 6. Insert Journal Entry Header with authoritative actor_id
    INSERT INTO public.journal_entries (
        user_id,
        transaction_date,
        description,
        source_type,
        source_id,
        idempotency_key,
        status,
        created_by
    ) VALUES (
        p_user_id,
        p_transaction_date,
        p_description,
        p_source_type,
        p_source_id,
        p_idempotency_key,
        'posted',
        v_actor_id
    ) RETURNING id INTO v_new_entry_id;

    -- 7. Insert Journal Lines & update cached balances for account entities
    v_payload_text := v_new_entry_id::text || '|' || p_transaction_date::text || '|' || v_total_debit::text || ':';

    FOR v_line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
        ledger_account_id UUID,
        debit_amount NUMERIC(15,2),
        credit_amount NUMERIC(15,2),
        currency TEXT,
        memo TEXT
    )
    LOOP
        INSERT INTO public.journal_lines (
            journal_entry_id,
            ledger_account_id,
            user_id,
            debit_amount,
            credit_amount,
            currency,
            memo
        ) VALUES (
            v_new_entry_id,
            v_line.ledger_account_id,
            p_user_id,
            v_line.debit_amount,
            v_line.credit_amount,
            COALESCE(v_line.currency, 'INR'),
            v_line.memo
        );

        -- Synchronize cached balance on accounts table if this is a mapped account entity
        SELECT account_type, entity_type, entity_id
        INTO v_line_account_type, v_line_entity_type, v_line_entity_id
        FROM public.ledger_accounts
        WHERE id = v_line.ledger_account_id;

        IF v_line_entity_type = 'account' AND v_line_entity_id IS NOT NULL THEN
            IF v_line_account_type = 'asset' THEN
                v_line_delta := v_line.debit_amount - v_line.credit_amount;
            ELSE
                v_line_delta := v_line.credit_amount - v_line.debit_amount;
            END IF;

            UPDATE public.accounts
            SET current_balance = COALESCE(current_balance, 0.00) + v_line_delta,
                updated_at = NOW()
            WHERE id = v_line_entity_id AND user_id = p_user_id;
        END IF;

        v_payload_text := v_payload_text || '[' || v_line.ledger_account_id::text || ',' || v_line.debit_amount::text || ',' || v_line.credit_amount::text || ']';
    END LOOP;

    -- 8. Record cryptographic SHA-256 ledger audit log entry
    v_payload_hash := encode(digest(v_payload_text, 'sha256'), 'hex');

    INSERT INTO public.ledger_audit_log (
        user_id,
        journal_entry_id,
        action,
        actor_id,
        payload_hash,
        metadata
    ) VALUES (
        p_user_id,
        v_new_entry_id,
        'POST',
        v_actor_id,
        v_payload_hash,
        jsonb_build_object(
            'source_type', p_source_type,
            'source_id', p_source_id,
            'idempotency_key', p_idempotency_key,
            'line_count', v_line_count,
            'total_amount', v_total_debit,
            'caller_role', auth.role(),
            'metadata', p_metadata
        )
    );

    RETURN v_new_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- 1.4 SEC-004: Hardened post_reversal_entry with strict auth.uid() actor derivation
CREATE OR REPLACE FUNCTION public.post_reversal_entry(
    p_user_id UUID,
    p_original_entry_id UUID,
    p_reversal_date DATE,
    p_reason TEXT,
    p_idempotency_key TEXT,
    p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
    v_orig public.journal_entries%ROWTYPE;
    v_reversal_entry_id UUID;
    v_orig_lines JSONB := '[]'::jsonb;
    v_line RECORD;
    v_inverted_debit NUMERIC(15,2);
    v_inverted_credit NUMERIC(15,2);
    v_existing_reversal_id UUID;
    v_actor_id UUID;
BEGIN
    -- 0. AUTHENTICATION & CALLER AUTHORIZATION INVARIANTS
    IF auth.role() = 'anon' OR auth.uid() IS NULL OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'anon' THEN
        RAISE EXCEPTION 'Authentication Required: Anonymous callers cannot reverse journal entries.';
    END IF;

    IF auth.role() = 'authenticated' AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Authorization Error: Caller auth.uid (%) does not match target user_id (%).',
            auth.uid(), p_user_id;
    END IF;

    -- Authoritatively derive actor strictly from auth.uid()
    v_actor_id := auth.uid();

    -- 1. Fetch and validate original journal entry
    SELECT * INTO v_orig
    FROM public.journal_entries
    WHERE id = p_original_entry_id AND user_id = p_user_id;

    IF v_orig.id IS NULL THEN
        RAISE EXCEPTION 'Financial Integrity Error: Original journal entry % not found.', p_original_entry_id;
    END IF;

    IF v_orig.status = 'reversed' THEN
        RAISE EXCEPTION 'Financial Integrity Error: Journal entry % is already reversed.', p_original_entry_id;
    END IF;

    IF v_orig.status <> 'posted' THEN
        RAISE EXCEPTION 'Financial Integrity Error: Only posted journal entries may be reversed (current status: %).', v_orig.status;
    END IF;

    -- 2. Idempotency Check
    SELECT id INTO v_existing_reversal_id
    FROM public.journal_entries
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

    IF v_existing_reversal_id IS NOT NULL THEN
        RETURN v_existing_reversal_id;
    END IF;

    -- 3. Construct inverted journal lines (Debits become Credits, Credits become Debits)
    FOR v_line IN
        SELECT * FROM public.journal_lines
        WHERE journal_entry_id = p_original_entry_id AND user_id = p_user_id
    LOOP
        v_inverted_debit := v_line.credit_amount;
        v_inverted_credit := v_line.debit_amount;

        v_orig_lines := v_orig_lines || jsonb_build_object(
            'ledger_account_id', v_line.ledger_account_id,
            'debit_amount', v_inverted_debit,
            'credit_amount', v_inverted_credit,
            'currency', v_line.currency,
            'memo', 'REVERSAL: ' || COALESCE(v_line.memo, v_orig.description)
        );
    END LOOP;

    -- 4. Post reversal entry using hardened post_journal_entry
    v_reversal_entry_id := public.post_journal_entry(
        p_user_id,
        p_reversal_date,
        'REVERSAL of [' || v_orig.entry_number || ']: ' || p_reason,
        'reversal',
        v_orig.id::text,
        p_idempotency_key,
        v_orig_lines,
        v_actor_id,
        jsonb_build_object(
            'original_entry_id', v_orig.id,
            'original_entry_number', v_orig.entry_number,
            'reversal_reason', p_reason
        )
    );

    -- 5. Mark original entry as reversed and link reversal entry
    UPDATE public.journal_entries
    SET status = 'reversed',
        reversal_of_id = v_reversal_entry_id
    WHERE id = p_original_entry_id AND user_id = p_user_id;

    -- 6. Record audit log event for reversal
    INSERT INTO public.ledger_audit_log (
        user_id,
        journal_entry_id,
        action,
        actor_id,
        payload_hash,
        metadata
    ) VALUES (
        p_user_id,
        v_reversal_entry_id,
        'REVERSE',
        v_actor_id,
        v_reversal_hash,
        jsonb_build_object(
            'original_entry_id', v_orig.id,
            'original_entry_number', v_orig.entry_number,
            'reversal_entry_id', v_reversal_entry_id,
            'reversal_reason', p_reason
        )
    );

    RETURN v_reversal_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;


-- ==============================================================================
-- 2. MIGRATION 013: IDEMPOTENT USER DATA RESET PROCEDURE
-- ==============================================================================

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
    -- Scoped to auth.uid() so User B cannot replay User A's reset_id.
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

    -- Step 5: bank_statement_transactions (References bank_statements)
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

    -- Step 8: split_expense_shares (References split_expenses)
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

    -- Step 10: transaction_tags (References transactions)
    DELETE FROM public.transaction_tags
    WHERE transaction_id IN (SELECT id FROM public.transactions WHERE user_id = v_user_id);
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

    -- Step 14: loan_payments (References loans)
    DELETE FROM public.loan_payments WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('loan_payments', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 15: loans
    DELETE FROM public.loans WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('loans', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 16: investment_transactions (References investments)
    DELETE FROM public.investment_transactions WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('investment_transactions', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 17: investments
    DELETE FROM public.investments WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('investments', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 18: ipo_applications
    DELETE FROM public.ipo_applications WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('ipo_applications', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 19: debt_repayments (References receivables and payables)
    DELETE FROM public.debt_repayments WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('debt_repayments', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 20: receivables
    DELETE FROM public.receivables WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('receivables', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 21: payables
    DELETE FROM public.payables WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('payables', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 22: counterparties
    DELETE FROM public.counterparties WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('counterparties', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 23: transactions
    DELETE FROM public.transactions WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('transactions', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 24: audit_logs for this user
    DELETE FROM public.audit_logs WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('audit_logs', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 25: savings_goals
    DELETE FROM public.savings_goals WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('savings_goals', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 26: budgets
    DELETE FROM public.budgets WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('budgets', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 27: recurring_transactions
    DELETE FROM public.recurring_transactions WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('recurring_transactions', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 28: tags
    DELETE FROM public.tags WHERE user_id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('tags', v_count);
    v_total_deleted := v_total_deleted + v_count;

    -- Step 29: transaction_categories (ONLY user-owned non-system categories)
    DELETE FROM public.transaction_categories WHERE user_id = v_user_id AND is_system = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object('transaction_categories', v_count);
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

    -- 5. RESET USER PROFILE ONBOARDING FLAG
    UPDATE public.profiles
    SET onboarding_completed = false,
        updated_at = NOW()
    WHERE user_id = v_user_id;

    -- 6. POST-RESET INTEGRITY VERIFICATION
    SELECT (
        (SELECT COUNT(*) FROM public.accounts WHERE user_id = v_user_id) +
        (SELECT COUNT(*) FROM public.transactions WHERE user_id = v_user_id) +
        (SELECT COUNT(*) FROM public.journal_entries WHERE user_id = v_user_id) +
        (SELECT COUNT(*) FROM public.journal_lines WHERE user_id = v_user_id) +
        (SELECT COUNT(*) FROM public.ledger_accounts WHERE user_id = v_user_id) +
        (SELECT COUNT(*) FROM public.loans WHERE user_id = v_user_id) +
        (SELECT COUNT(*) FROM public.investments WHERE user_id = v_user_id) +
        (SELECT COUNT(*) FROM public.receivables WHERE user_id = v_user_id) +
        (SELECT COUNT(*) FROM public.payables WHERE user_id = v_user_id) +
        (SELECT COUNT(*) FROM public.counterparties WHERE user_id = v_user_id) +
        (SELECT COUNT(*) FROM public.bank_statements WHERE user_id = v_user_id)
    ) INTO v_remaining_check;

    IF v_remaining_check > 0 THEN
        RAISE EXCEPTION 'Reset Verification Failed: % user records remained after deletion.', v_remaining_check;
    END IF;

    -- 7. RECORD SINGLE CLEAN COMPLETION AUDIT LOG ENTRY
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
        'resetId', p_reset_id,
        'totalDeleted', v_total_deleted,
        'deletedCounts', v_deleted_counts,
        'verified', true,
        'remainingRecords', 0
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;


-- ==============================================================================
-- 3. PERMISSIONS & GRANTS LOCKDOWN
-- ==============================================================================

REVOKE EXECUTE ON FUNCTION public.get_ledger_account_balance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ledger_account_balance(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.post_journal_entry(UUID, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(UUID, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.post_reversal_entry(UUID, UUID, DATE, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_reversal_entry(UUID, UUID, DATE, TEXT, TEXT, UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reset_user_data(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_user_data(TEXT, TEXT) TO authenticated;

COMMIT;
