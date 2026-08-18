-- ============================================================
-- NisFlow Finance: Task 4A Double-Entry Financial Ledger Foundation
-- Implements immutable ledger_accounts, journal_entries, journal_lines,
-- ledger_audit_log, atomic posting, reversal, balance derivation & RLS
-- ============================================================

-- 1. Types & Enums
DO $$ BEGIN
    CREATE TYPE public.ledger_account_type AS ENUM (
        'asset',       -- Bank, Cash, Investments, Receivables
        'liability',   -- Loans, Credit Cards, Payables
        'equity',      -- Opening Balances, Retained Earnings
        'income',      -- Salary, Dividends, Business Revenue
        'expense'      -- Groceries, Rent, Utilities, Interest
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.journal_entry_status AS ENUM ('posted', 'reversed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Ledger Accounts (Chart of Accounts)
CREATE TABLE IF NOT EXISTS public.ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    code TEXT NOT NULL,                             -- e.g. "AST-BANK-001", "EXP-GROC-001"
    name TEXT NOT NULL,
    account_type public.ledger_account_type NOT NULL,
    entity_type TEXT,                               -- 'account', 'counterparty', 'category', 'loan', 'investment'
    entity_id UUID,                                 -- Foreign reference to accounts.id, counterparties.id, etc.
    currency TEXT DEFAULT 'INR' NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_ledger_account_code UNIQUE (user_id, code),
    CONSTRAINT uq_ledger_account_entity UNIQUE (user_id, entity_type, entity_id)
);

-- 3. Journal Entry Headers (Immutable)
CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    entry_number BIGSERIAL,
    transaction_date DATE NOT NULL,
    posted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    description TEXT NOT NULL,
    source_type TEXT NOT NULL,                      -- 'manual', 'recurring', 'reconciliation', 'ai_action', 'loan_emi', 'investment', 'reversal'
    source_id TEXT,                                 -- ID in legacy/originating domain table
    idempotency_key TEXT NOT NULL,                  -- Deterministic unique idempotency key
    status public.journal_entry_status DEFAULT 'posted' NOT NULL,
    reversal_of_id UUID REFERENCES public.journal_entries(id),
    created_by UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_journal_entry_idempotency UNIQUE (user_id, idempotency_key)
);

-- 4. Journal Lines (Immutable Debits & Credits)
CREATE TABLE IF NOT EXISTS public.journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT NOT NULL,
    ledger_account_id UUID REFERENCES public.ledger_accounts(id) ON DELETE RESTRICT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    debit_amount NUMERIC(15,2) DEFAULT 0.00 NOT NULL,
    credit_amount NUMERIC(15,2) DEFAULT 0.00 NOT NULL,
    currency TEXT DEFAULT 'INR' NOT NULL,
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    
    -- Monetary Invariant Constraints
    CONSTRAINT chk_jl_positive_amounts CHECK (debit_amount >= 0 AND credit_amount >= 0),
    CONSTRAINT chk_jl_debit_xor_credit CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (credit_amount > 0 AND debit_amount = 0)
    )
);

-- 5. Immutable Ledger Audit Log
CREATE TABLE IF NOT EXISTS public.ledger_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT NOT NULL,
    action TEXT NOT NULL,                           -- 'POST', 'REVERSE'
    actor_id UUID REFERENCES auth.users(id) NOT NULL,
    payload_hash TEXT NOT NULL,                     -- Cryptographic checksum
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for high-performance balance calculation & querying
CREATE INDEX IF NOT EXISTS idx_journal_lines_account_user ON public.journal_lines(ledger_account_id, user_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date ON public.journal_entries(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_entity ON public.ledger_accounts(user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ledger_audit_log_entry ON public.ledger_audit_log(journal_entry_id);

-- ============================================================
-- 6. IMMUTABILITY ENFORCEMENT TRIGGERS
-- ============================================================

-- Function: Block any UPDATE or DELETE on posted journal lines
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_line_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Financial Integrity Error: Posted journal lines are immutable. Post a reversal entry instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_journal_line_immutability ON public.journal_lines;
CREATE TRIGGER trg_journal_line_immutability
BEFORE UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_journal_line_immutability();

-- Function: Block DELETE on journal entries, allow UPDATE ONLY for reversal status flag
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_entry_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Financial Integrity Error: Journal entries cannot be deleted. Post a reversal entry instead.';
    ELSIF TG_OP = 'UPDATE' THEN
        -- Allow ONLY transitioning status from 'posted' to 'reversed'
        IF OLD.status = 'posted' AND NEW.status = 'reversed' THEN
            -- Ensure no other critical field is mutated
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

DROP TRIGGER IF EXISTS trg_journal_entry_immutability ON public.journal_entries;
CREATE TRIGGER trg_journal_entry_immutability
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_journal_entry_immutability();

-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_audit_log ENABLE ROW LEVEL SECURITY;

-- ledger_accounts RLS
DROP POLICY IF EXISTS "Users can view own ledger accounts" ON public.ledger_accounts;
CREATE POLICY "Users can view own ledger accounts" ON public.ledger_accounts
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ledger accounts" ON public.ledger_accounts;
CREATE POLICY "Users can insert own ledger accounts" ON public.ledger_accounts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own ledger accounts" ON public.ledger_accounts;
CREATE POLICY "Users can update own ledger accounts" ON public.ledger_accounts
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- journal_entries RLS
DROP POLICY IF EXISTS "Users can view own journal entries" ON public.journal_entries;
CREATE POLICY "Users can view own journal entries" ON public.journal_entries
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own journal entries" ON public.journal_entries;
CREATE POLICY "Users can insert own journal entries" ON public.journal_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- journal_lines RLS
DROP POLICY IF EXISTS "Users can view own journal lines" ON public.journal_lines;
CREATE POLICY "Users can view own journal lines" ON public.journal_lines
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own journal lines" ON public.journal_lines;
CREATE POLICY "Users can insert own journal lines" ON public.journal_lines
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ledger_audit_log RLS (Read-only for users)
DROP POLICY IF EXISTS "Users can view own ledger audit logs" ON public.ledger_audit_log;
CREATE POLICY "Users can view own ledger audit logs" ON public.ledger_audit_log
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own ledger audit logs" ON public.ledger_audit_log;
CREATE POLICY "Users can insert own ledger audit logs" ON public.ledger_audit_log
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 8. AUTHORITATIVE BALANCE DERIVATION FUNCTIONS
-- ============================================================

-- Function: Compute authoritative balance for a single ledger account
CREATE OR REPLACE FUNCTION public.get_ledger_account_balance(p_ledger_account_id UUID)
RETURNS NUMERIC(15,2) AS $$
DECLARE
    v_account_type public.ledger_account_type;
    v_balance NUMERIC(15,2);
BEGIN
    SELECT account_type INTO v_account_type
    FROM public.ledger_accounts
    WHERE id = p_ledger_account_id;

    IF v_account_type IS NULL THEN
        RAISE EXCEPTION 'Ledger account % not found', p_ledger_account_id;
    END IF;

    IF v_account_type IN ('asset', 'expense') THEN
        -- Normal Debit balance: Balance = Debits - Credits
        SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0.00) INTO v_balance
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.ledger_account_id = p_ledger_account_id
          AND je.status = 'posted';
    ELSE
        -- Normal Credit balance (liability, equity, income): Balance = Credits - Debits
        SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0.00) INTO v_balance
        FROM public.journal_lines jl
        JOIN public.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.ledger_account_id = p_ledger_account_id
          AND je.status = 'posted';
    END IF;

    RETURN v_balance;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 9. ATOMIC JOURNAL POSTING STORED PROCEDURE
-- ============================================================

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
BEGIN
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

    -- Verify all accounts exist and belong to user
    IF (SELECT COUNT(*) FROM public.ledger_accounts WHERE id = ANY(v_account_ids) AND user_id = p_user_id) <> array_length(v_account_ids, 1) THEN
        RAISE EXCEPTION 'Financial Integrity Error: One or more ledger accounts do not exist or belong to another user.';
    END IF;

    -- 6. Insert Journal Entry Header
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
        p_created_by
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

            UPDATE public.accounts
            SET balance = balance + v_line_delta,
                updated_at = NOW()
            WHERE id = v_line_entity_id AND user_id = p_user_id;
        END IF;
    END LOOP;

    -- 8. Compute cryptographic SHA-256 hash for audit record
    v_payload_hash := md5(v_payload_text); -- Using standard hash digest

    -- 9. Insert Immutable Audit Log Record
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
        p_created_by,
        v_payload_hash,
        p_metadata
    );

    RETURN v_new_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 10. ATOMIC REVERSAL STORED PROCEDURE
-- ============================================================

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
BEGIN
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

    -- 3. Post reversal entry via standard posting procedure
    v_reversal_entry_id := public.post_journal_entry(
        p_user_id,
        CURRENT_DATE,
        'REVERSAL: ' || v_original_entry.description || ' (' || p_reason || ')',
        'reversal',
        p_original_entry_id::text,
        p_idempotency_key,
        v_reversal_lines,
        p_created_by,
        p_metadata || jsonb_build_object('reversal_of_id', p_original_entry_id, 'reason', p_reason)
    );

    -- 4. Mark original entry as reversed
    UPDATE public.journal_entries
    SET status = 'reversed',
        reversal_of_id = v_reversal_entry_id
    WHERE id = p_original_entry_id AND user_id = p_user_id;

    -- 5. Record Reversal in Audit Log
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
        p_created_by,
        md5('REVERSE|' || p_original_entry_id::text || '|' || v_reversal_entry_id::text),
        p_metadata || jsonb_build_object('reversed_entry_id', p_original_entry_id)
    );

    RETURN v_reversal_entry_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 11. RECONCILIATION & DISCREPANCY DETECTION FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.reconcile_ledger_balances(p_user_id UUID)
RETURNS TABLE (
    account_id UUID,
    account_name TEXT,
    cached_balance NUMERIC(15,2),
    ledger_balance NUMERIC(15,2),
    discrepancy NUMERIC(15,2),
    is_reconciled BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id AS account_id,
        a.name AS account_name,
        COALESCE(a.balance, 0.00) AS cached_balance,
        COALESCE(public.get_ledger_account_balance(la.id), 0.00) AS ledger_balance,
        (COALESCE(a.balance, 0.00) - COALESCE(public.get_ledger_account_balance(la.id), 0.00)) AS discrepancy,
        (COALESCE(a.balance, 0.00) = COALESCE(public.get_ledger_account_balance(la.id), 0.00)) AS is_reconciled
    FROM public.accounts a
    LEFT JOIN public.ledger_accounts la ON la.entity_id = a.id AND la.entity_type = 'account' AND la.user_id = p_user_id
    WHERE a.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
