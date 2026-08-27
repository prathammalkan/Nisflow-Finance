-- ==============================================================================
-- NISFLOW FINANCE — MIGRATION 018: PEOPLE LEDGER AGGREGATION RPC
-- ==============================================================================
--
-- Replaces the application-level N+1 pattern in getPeopleAuthoritativeSummary
-- (1 counterparties query + N balance queries per person) with a single
-- SQL aggregation that joins ledger_accounts and journal_lines in one round trip.
--
-- Performance Impact:
--   Before: 1 + N * 2 round trips (N = counterparty count, 2 queries per person)
--   After:  1 round trip
--
-- Security:
--   - SECURITY DEFINER with explicit caller auth check
--   - Anonymous callers rejected
--   - Cross-tenant access rejected (user_id filter on all joins)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_people_ledger_summary(p_user_id UUID)
RETURNS TABLE (
    counterparty_id   UUID,
    counterparty_name TEXT,
    receivable_balance NUMERIC(15,2),
    payable_balance    NUMERIC(15,2)
) AS $$
BEGIN
    -- 1. Reject anonymous / unauthenticated callers
    IF auth.role() = 'anon' OR auth.uid() IS NULL
       OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'anon'
    THEN
        RAISE EXCEPTION 'Authentication Required: Anonymous callers cannot query people ledger summary.';
    END IF;

    -- 2. Tenant isolation
    IF auth.role() = 'authenticated' AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Authorization Error: Caller auth.uid (%) does not match target user_id (%).',
            auth.uid(), p_user_id;
    END IF;

    -- 3. Single-query aggregation:
    --    Join counterparties → ledger_accounts (receivable + payable) → journal_lines
    --    Aggregate SUM(debits - credits) per account type in one pass.
    RETURN QUERY
    WITH
    -- Receivable ledger accounts for this user's counterparties
    recv_accounts AS (
        SELECT la.id AS account_id, la.entity_id AS cp_id
        FROM public.ledger_accounts la
        WHERE la.user_id = p_user_id
          AND la.entity_type = 'counterparty_receivable'
    ),
    -- Payable ledger accounts for this user's counterparties
    pay_accounts AS (
        SELECT la.id AS account_id, la.entity_id AS cp_id
        FROM public.ledger_accounts la
        WHERE la.user_id = p_user_id
          AND la.entity_type = 'counterparty_payable'
    ),
    -- Aggregate journal lines for receivable accounts
    -- Receivable is an 'asset' type: balance = SUM(debits) - SUM(credits)
    recv_balances AS (
        SELECT
            ra.cp_id,
            COALESCE(SUM(
                CASE WHEN je.status IN ('posted', 'reversed')
                     THEN jl.debit_amount - jl.credit_amount
                     ELSE 0
                END
            ), 0.00)::NUMERIC(15,2) AS receivable_balance
        FROM recv_accounts ra
        LEFT JOIN public.journal_lines jl ON jl.ledger_account_id = ra.account_id
                                          AND jl.user_id = p_user_id
        LEFT JOIN public.journal_entries je ON je.id = jl.journal_entry_id
                                            AND je.user_id = p_user_id
        GROUP BY ra.cp_id
    ),
    -- Aggregate journal lines for payable accounts
    -- Payable is a 'liability' type: balance = SUM(credits) - SUM(debits)
    pay_balances AS (
        SELECT
            pa.cp_id,
            COALESCE(SUM(
                CASE WHEN je.status IN ('posted', 'reversed')
                     THEN jl.credit_amount - jl.debit_amount
                     ELSE 0
                END
            ), 0.00)::NUMERIC(15,2) AS payable_balance
        FROM pay_accounts pa
        LEFT JOIN public.journal_lines jl ON jl.ledger_account_id = pa.account_id
                                          AND jl.user_id = p_user_id
        LEFT JOIN public.journal_entries je ON je.id = jl.journal_entry_id
                                            AND je.user_id = p_user_id
        GROUP BY pa.cp_id
    )
    SELECT
        cp.id                                                AS counterparty_id,
        cp.name                                              AS counterparty_name,
        COALESCE(rb.receivable_balance, 0.00)::NUMERIC(15,2) AS receivable_balance,
        COALESCE(pb.payable_balance,    0.00)::NUMERIC(15,2) AS payable_balance
    FROM public.counterparties cp
    LEFT JOIN recv_balances rb ON rb.cp_id = cp.id
    LEFT JOIN pay_balances  pb ON pb.cp_id = cp.id
    WHERE cp.user_id = p_user_id
    ORDER BY cp.name;

END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions;

REVOKE EXECUTE ON FUNCTION public.get_people_ledger_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_people_ledger_summary(UUID) TO authenticated;

-- Ensure entity_type variants used by the people ledger are indexed
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_cp_recv
    ON public.ledger_accounts(user_id, entity_id)
    WHERE entity_type = 'counterparty_receivable';

CREATE INDEX IF NOT EXISTS idx_ledger_accounts_cp_pay
    ON public.ledger_accounts(user_id, entity_id)
    WHERE entity_type = 'counterparty_payable';
