-- ==============================================================================
-- NISFLOW FINANCE — MIGRATION 008: DROP OBSOLETE LEGACY BALANCE TRIGGER
-- ==============================================================================
--
-- Description:
--   Drops the obsolete `update_account_balance_trigger` and its trigger function
--   `update_account_balance()` from `public.transactions`.
--   The double-entry ledger stored procedure `post_journal_entry()` is now the
--   single authoritative mechanism for updating cached account projections.
--   Removing this legacy trigger eliminates the risk of double balance updates
--   when transactions compatibility projections are created.
-- ==============================================================================

-- 1. Drop trigger if exists
DROP TRIGGER IF EXISTS update_account_balance_trigger ON public.transactions;

-- 2. Drop legacy trigger function if exists
DROP FUNCTION IF EXISTS public.update_account_balance();
