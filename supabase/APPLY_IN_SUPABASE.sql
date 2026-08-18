-- ============================================================
-- NisFlow Finance — COMPLETE SUPABASE SETUP
-- Run this entire file in Supabase Dashboard > SQL Editor
-- ============================================================

-- STEP 1: Run migrations 001, 002 (paste content of those files first)
-- If you have already run 001 and 002, skip to STEP 2.
-- The error "relation categories does not exist" means you have NOT run them yet.

-- STEP 2: Create a VIEW so that all app code querying 'categories'
--         works correctly against the 'transaction_categories' table.
-- This is the core fix for: ERROR: 42P01: relation "public.categories" does not exist

CREATE OR REPLACE VIEW public.categories AS
SELECT
  id,
  user_id,
  name,
  type,
  icon,
  color,
  is_system,
  parent_id,
  sort_order,
  created_at,
  updated_at
FROM public.transaction_categories;

-- Grant access to authenticated users
GRANT SELECT ON public.categories TO authenticated;
GRANT SELECT ON public.categories TO anon;

-- STEP 3: Apply new migrations for Phase 1 features

-- Migration 003: Recurring Transactions
CREATE TABLE IF NOT EXISTS public.recurring_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES public.transaction_categories(id) ON DELETE SET NULL,
  counterparty_id UUID REFERENCES public.counterparties(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  ownership TEXT NOT NULL DEFAULT 'personal' CHECK (ownership IN ('personal','third_party')),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly','quarterly','yearly')),
  start_date DATE NOT NULL,
  end_date DATE,
  next_due_date DATE NOT NULL,
  last_created_date DATE,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  auto_create BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own recurring transactions" ON public.recurring_transactions;
CREATE POLICY "Users can manage their own recurring transactions"
  ON public.recurring_transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_recurring_user ON public.recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_next_due ON public.recurring_transactions(next_due_date) WHERE is_active = true;

-- Migration 004: Net Worth History
CREATE TABLE IF NOT EXISTS public.net_worth_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  period TEXT NOT NULL,
  personal_cash DECIMAL(15,2) NOT NULL DEFAULT 0,
  savings DECIMAL(15,2) NOT NULL DEFAULT 0,
  investments DECIMAL(15,2) NOT NULL DEFAULT 0,
  receivables DECIMAL(15,2) NOT NULL DEFAULT 0,
  payables DECIMAL(15,2) NOT NULL DEFAULT 0,
  third_party_held DECIMAL(15,2) NOT NULL DEFAULT 0,
  net_worth DECIMAL(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, period)
);

ALTER TABLE public.net_worth_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own snapshots" ON public.net_worth_snapshots;
CREATE POLICY "Users can manage their own snapshots"
  ON public.net_worth_snapshots FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_user_period ON public.net_worth_snapshots(user_id, period);

-- STEP 4: Tax records table
CREATE TABLE IF NOT EXISTS public.tax_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  financial_year TEXT NOT NULL,
  category TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('income','deduction','capital_gain','investment_income')),
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  documents TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tax_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own tax records" ON public.tax_records;
CREATE POLICY "Users can manage their own tax records"
  ON public.tax_records FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_tax_records_user_fy ON public.tax_records(user_id, financial_year);

-- ============================================================
-- 5. STORAGE SECURITY (Task 3C)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    false,
    10485760,
    ARRAY[
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own documents in storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own documents to storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own documents in storage" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own documents from storage" ON storage.objects;

CREATE POLICY "Users can view own documents in storage"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload own documents to storage"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own documents in storage"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
    bucket_id = 'documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own documents from storage"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'documents' AND
    (auth.uid())::text = (storage.foldername(name))[1]
);

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS entity_id UUID;

-- ============================================================
-- 6. DOUBLE-ENTRY FINANCIAL LEDGER FOUNDATION (Task 4A)
-- ============================================================

DO $$ BEGIN
    CREATE TYPE public.ledger_account_type AS ENUM (
        'asset',
        'liability',
        'equity',
        'income',
        'expense'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.journal_entry_status AS ENUM ('posted', 'reversed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    account_type public.ledger_account_type NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    currency TEXT DEFAULT 'INR' NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_ledger_account_code UNIQUE (user_id, code),
    CONSTRAINT uq_ledger_account_entity UNIQUE (user_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    entry_number BIGSERIAL,
    transaction_date DATE NOT NULL,
    posted_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    description TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT,
    idempotency_key TEXT NOT NULL,
    status public.journal_entry_status DEFAULT 'posted' NOT NULL,
    reversal_of_id UUID REFERENCES public.journal_entries(id),
    created_by UUID REFERENCES auth.users(id) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_journal_entry_idempotency UNIQUE (user_id, idempotency_key)
);

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
    CONSTRAINT chk_jl_positive_amounts CHECK (debit_amount >= 0 AND credit_amount >= 0),
    CONSTRAINT chk_jl_debit_xor_credit CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (credit_amount > 0 AND debit_amount = 0)
    )
);

CREATE TABLE IF NOT EXISTS public.ledger_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE RESTRICT NOT NULL,
    action TEXT NOT NULL,
    actor_id UUID REFERENCES auth.users(id) NOT NULL,
    payload_hash TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account_user ON public.journal_lines(ledger_account_id, user_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_entry ON public.journal_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user_date ON public.journal_entries(user_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_entity ON public.ledger_accounts(user_id, entity_type, entity_id);

ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ledger accounts" ON public.ledger_accounts;
CREATE POLICY "Users can view own ledger accounts" ON public.ledger_accounts FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own ledger accounts" ON public.ledger_accounts;
CREATE POLICY "Users can insert own ledger accounts" ON public.ledger_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own ledger accounts" ON public.ledger_accounts;
CREATE POLICY "Users can update own ledger accounts" ON public.ledger_accounts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own journal entries" ON public.journal_entries;
CREATE POLICY "Users can view own journal entries" ON public.journal_entries FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own journal entries" ON public.journal_entries;
CREATE POLICY "Users can insert own journal entries" ON public.journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own journal lines" ON public.journal_lines;
CREATE POLICY "Users can view own journal lines" ON public.journal_lines FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own journal lines" ON public.journal_lines;
CREATE POLICY "Users can insert own journal lines" ON public.journal_lines FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own ledger audit logs" ON public.ledger_audit_log;
CREATE POLICY "Users can view own ledger audit logs" ON public.ledger_audit_log FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own ledger audit logs" ON public.ledger_audit_log;
CREATE POLICY "Users can insert own ledger audit logs" ON public.ledger_audit_log FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ==============================================================================
-- SECTION 7: DROP OBSOLETE LEGACY BALANCE TRIGGER
-- ==============================================================================
DROP TRIGGER IF EXISTS update_account_balance_trigger ON public.transactions;
DROP FUNCTION IF EXISTS public.update_account_balance();

-- DONE. All tables, categories view, storage security, double-entry ledger, and clean triggers are ready.

