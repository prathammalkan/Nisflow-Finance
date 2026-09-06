-- ==============================================================================
-- NISFLOW FINANCE — SCHEMA ALIGNMENT: MISSING COLUMNS
-- ==============================================================================
-- Adds columns that exist in migrations 001 / 021 but are absent from the
-- live database due to schema drift. All statements are additive and
-- idempotent (IF NOT EXISTS).
-- Applied to live DB: 2026-09-06 via Supabase MCP apply_migration.
-- ==============================================================================

-- 1. profiles.onboarding_completed
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- 2. profiles.updated_at
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

UPDATE public.profiles
    SET updated_at = created_at
    WHERE updated_at IS NULL OR updated_at = timezone('utc'::text, now());

-- 3. transactions.linked_transaction_id
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS linked_transaction_id UUID
        REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_linked_tx_id
    ON public.transactions(linked_transaction_id);

-- 4. transactions.journal_entry_id
ALTER TABLE public.transactions
    ADD COLUMN IF NOT EXISTS journal_entry_id UUID
        REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_journal_entry_id
    ON public.transactions(journal_entry_id);

NOTIFY pgrst, 'reload schema';
