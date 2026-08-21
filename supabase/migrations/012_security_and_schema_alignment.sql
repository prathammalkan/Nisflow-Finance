-- ==============================================================================
-- NISFLOW FINANCE — MIGRATION 012: SECURITY HARDENING & SCHEMA ALIGNMENT
-- ==============================================================================
--
-- Fixes:
-- 1. [DB-001] Schema Alignment: Add `details JSONB` column to `public.audit_logs`
-- 2. [SEC-003] Authorization Hardening: Fix BOLA in `get_ledger_account_balance`
--    by enforcing `auth.uid() = ledger_accounts.user_id` and uniform not-found responses.
-- 3. [SEC-004] Actor Spoofing Mitigation: Force `created_by` and `actor_id` to `auth.uid()`
--    in `post_journal_entry` and `post_reversal_entry`.
-- 4. RPC Permissions & search_path lockdown.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DB-001: Ensure audit_logs has details JSONB column
-- ------------------------------------------------------------------------------
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS details JSONB;

-- ------------------------------------------------------------------------------
-- 2. SEC-003: Hardened get_ledger_account_balance with caller ownership check
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 3. SEC-004: Hardened post_journal_entry with strict auth.uid() actor derivation
-- ------------------------------------------------------------------------------
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

        v_payload_text := v_payload_text || '[' || v_line.ledger_account_id::text || ',' || v_line.debit_amount::text || ',' || v_line.credit_amount::text || ']';

        -- If ledger account maps to an account entity in public.accounts, update cached balance atomically
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

            -- Synchronize BOTH balance and current_balance projections
            UPDATE public.accounts
            SET balance = COALESCE(balance, 0.00) + v_line_delta,
                current_balance = COALESCE(current_balance, 0.00) + v_line_delta,
                updated_at = NOW()
            WHERE id = v_line_entity_id AND user_id = p_user_id;
        END IF;
    END LOOP;

    -- 8. Compute true cryptographic SHA-256 hash for audit record (64 hex chars)
    v_payload_hash := encode(sha256(v_payload_text::bytea), 'hex');

    -- 9. Insert Immutable Audit Log Record with authoritative actor_id
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
        p_metadata
    );

    RETURN v_new_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 4. SEC-004: Hardened post_reversal_entry with strict auth.uid() actor derivation
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_reversal_entry(
    p_user_id UUID,
    p_original_entry_id UUID,
    p_reason TEXT,
    p_idempotency_key TEXT,
    p_created_by UUID,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
    v_original_entry RECORD;
    v_reversal_lines JSONB := '[]'::jsonb;
    v_line RECORD;
    v_reversal_entry_id UUID;
    v_reversal_hash TEXT;
    v_actor_id UUID;
BEGIN
    -- 0. AUTHENTICATION & CALLER AUTHORIZATION INVARIANTS
    IF auth.role() = 'anon' OR auth.uid() IS NULL OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'anon' THEN
        RAISE EXCEPTION 'Authentication Required: Anonymous callers cannot post reversal entries.';
    END IF;

    IF auth.role() = 'authenticated' AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Authorization Error: Caller auth.uid (%) does not match target user_id (%).',
            auth.uid(), p_user_id;
    END IF;

    -- Authoritatively derive actor strictly from auth.uid()
    v_actor_id := auth.uid();

    -- 1. Fetch original entry and verify ownership
    SELECT * INTO v_original_entry
    FROM public.journal_entries
    WHERE id = p_original_entry_id AND user_id = p_user_id;

    IF v_original_entry IS NULL THEN
        RAISE EXCEPTION 'Financial Integrity Error: Original journal entry % not found or unauthorized.', p_original_entry_id;
    END IF;

    IF v_original_entry.status = 'reversed' THEN
        RAISE EXCEPTION 'Financial Integrity Error: Journal entry % has already been reversed.', p_original_entry_id;
    END IF;

    -- 2. Build inverted journal lines (Debits become Credits, Credits become Debits)
    FOR v_line IN 
        SELECT ledger_account_id, debit_amount, credit_amount, currency, memo
        FROM public.journal_lines
        WHERE journal_entry_id = p_original_entry_id
    LOOP
        v_reversal_lines := v_reversal_lines || jsonb_build_object(
            'ledger_account_id', v_line.ledger_account_id,
            'debit_amount', v_line.credit_amount,   -- INVERTED
            'credit_amount', v_line.debit_amount,   -- INVERTED
            'currency', v_line.currency,
            'memo', 'Reversal: ' || COALESCE(v_line.memo, v_original_entry.description)
        );
    END LOOP;

    -- 3. Post reversal entry via standard posting procedure with authoritative actor
    v_reversal_entry_id := public.post_journal_entry(
        p_user_id,
        CURRENT_DATE,
        'REVERSAL: ' || v_original_entry.description || ' (' || p_reason || ')',
        'reversal',
        p_original_entry_id::text,
        p_idempotency_key,
        v_reversal_lines,
        v_actor_id,
        p_metadata || jsonb_build_object('reversal_of_id', p_original_entry_id, 'reason', p_reason)
    );

    -- 4. Mark original entry as reversed
    UPDATE public.journal_entries
    SET status = 'reversed',
        reversal_of_id = v_reversal_entry_id
    WHERE id = p_original_entry_id AND user_id = p_user_id;

    -- 5. Record Reversal in Audit Log with true SHA-256 hash and authoritative actor
    v_reversal_hash := encode(sha256(('REVERSE|' || p_original_entry_id::text || '|' || v_reversal_entry_id::text)::bytea), 'hex');

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
        p_metadata || jsonb_build_object('reversed_entry_id', p_original_entry_id)
    );

    RETURN v_reversal_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- ------------------------------------------------------------------------------
-- 5. FUNCTION PRIVILEGE LOCKDOWN
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_ledger_account_balance(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ledger_account_balance(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.post_journal_entry(UUID, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_journal_entry(UUID, DATE, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.post_reversal_entry(UUID, UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_reversal_entry(UUID, UUID, TEXT, TEXT, UUID, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reconcile_ledger_balances(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_ledger_balances(UUID) TO authenticated;
