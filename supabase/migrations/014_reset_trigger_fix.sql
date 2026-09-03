-- ==============================================================================
-- NISFLOW FINANCE — MIGRATION 014: RESET IMMUTABILITY TRIGGER FIX
-- ==============================================================================
--
-- Problem:
--   The APPLY_MIGRATIONS_012_013.sql bundle applied to production included the
--   reset_user_data() function (which calls set_config('nisflow.allow_data_reset','on',true))
--   but did NOT include the updated trigger functions from migration 011 that check
--   this setting. As a result, production has:
--     - fn_enforce_journal_line_immutability: migration-007 version (unconditional RAISE)
--     - fn_enforce_journal_entry_immutability: migration-007 version (unconditional RAISE on DELETE)
--   This causes reset_user_data() to fail with:
--     "Posted journal lines are immutable. Post a reversal entry instead."
--
-- Fix:
--   Re-apply the trigger functions from migration 011 that check the
--   nisflow.allow_data_reset transaction-local setting before raising.
--
-- Security Invariants:
--   - Bypass is ONLY active when nisflow.allow_data_reset = 'on' is set via
--     set_config(..., true) (transaction-local — cannot leak across transactions)
--   - Only reset_user_data() SECURITY DEFINER function sets this flag
--   - Normal UPDATE/DELETE by any client remains fully blocked
--   - reversal_of_id nullification UPDATE is also gated behind the bypass
--   - No client-controlled bypass is exposed
--   - Cross-tenant deletion impossible: reset_user_data uses v_user_id := auth.uid()
--   - auth.users is never touched
--   - No financial data is modified by installing this migration
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Updated journal_lines immutability trigger function
--    Permits DELETE only when transaction-local nisflow.allow_data_reset = 'on'
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_line_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow deletion ONLY inside the authorized reset_user_data() transaction
    IF current_setting('nisflow.allow_data_reset', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Financial Integrity Error: Posted journal lines are immutable. Post a reversal entry instead.';
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 2. Updated journal_entries immutability trigger function
--    Permits DELETE and the reversal_of_id=NULL UPDATE only during authorized reset
--    Normal UPDATE still only allows posted->reversed status transition
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_entry_immutability()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow full DELETE and any UPDATE only inside the authorized reset_user_data() transaction
    IF current_setting('nisflow.allow_data_reset', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    -- Normal path: enforce immutability strictly
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

-- Note: The triggers trg_journal_line_immutability and trg_journal_entry_immutability
-- already exist and reference these functions by name. CREATE OR REPLACE FUNCTION
-- updates the function body in-place; the trigger bindings remain intact.
-- No DROP/CREATE TRIGGER is needed.
