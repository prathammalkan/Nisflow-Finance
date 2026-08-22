-- ==============================================================================
-- NISFLOW FINANCE — PRODUCTION HOTFIX: RESET IMMUTABILITY TRIGGER FIX
-- Target Project: https://supabase.com/dashboard/project/qyjhicibrciqcznsdevk/sql/new
--
-- Safety:
--   - 100% Non-destructive: only replaces two trigger function bodies
--   - Modifies zero financial records, balances, or user data
--   - Does NOT drop or recreate triggers (bindings preserved automatically)
--   - Does NOT disable RLS or weaken any security policy
--   - Idempotent: safe to run multiple times
--
-- Problem being fixed:
--   reset_user_data() sets nisflow.allow_data_reset = 'on' (transaction-local)
--   but the live trigger functions (from migration 007) unconditionally raise
--   an exception on DELETE — they never check this setting.
--   Result: "Posted journal lines are immutable. Post a reversal entry instead."
--
-- Fix: Update the trigger function bodies to check nisflow.allow_data_reset
--      before raising. Normal immutability enforcement is preserved.
-- ==============================================================================

BEGIN;

-- 1. Update journal_lines immutability trigger function to respect reset bypass
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_line_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('nisflow.allow_data_reset', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Financial Integrity Error: Posted journal lines are immutable. Post a reversal entry instead.';
END;
$$ LANGUAGE plpgsql;

-- 2. Update journal_entries immutability trigger function to respect reset bypass
CREATE OR REPLACE FUNCTION public.fn_enforce_journal_entry_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('nisflow.allow_data_reset', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

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

COMMIT;
