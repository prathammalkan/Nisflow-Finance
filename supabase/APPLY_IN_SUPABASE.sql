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

-- DONE. All tables and the categories view are now ready.
