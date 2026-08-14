-- 001_initial_schema.sql
-- NisFlow Finance Initial Schema

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. FUNCTIONS & TRIGGERS
-- ==========================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to auto-create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, currency, timezone, onboarding_completed)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'INR', 'UTC', false);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users (Need to run this carefully, Supabase allows this)
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger function to update account balance
CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'confirmed' OR NEW.status = 'reconciled' THEN
            IF NEW.direction = 'in' THEN
                UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
            ELSIF NEW.direction = 'out' THEN
                UPDATE public.accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.account_id;
            END IF;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status = 'confirmed' OR OLD.status = 'reconciled' THEN
            IF OLD.direction = 'in' THEN
                UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
            ELSIF OLD.direction = 'out' THEN
                UPDATE public.accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.account_id;
            END IF;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Revert OLD
        IF OLD.status = 'confirmed' OR OLD.status = 'reconciled' THEN
            IF OLD.direction = 'in' THEN
                UPDATE public.accounts SET current_balance = current_balance - OLD.amount WHERE id = OLD.account_id;
            ELSIF OLD.direction = 'out' THEN
                UPDATE public.accounts SET current_balance = current_balance + OLD.amount WHERE id = OLD.account_id;
            END IF;
        END IF;
        -- Apply NEW
        IF (NEW.status = 'confirmed' OR NEW.status = 'reconciled') AND (NEW.is_deleted = false) THEN
            IF NEW.direction = 'in' THEN
                UPDATE public.accounts SET current_balance = current_balance + NEW.amount WHERE id = NEW.account_id;
            ELSIF NEW.direction = 'out' THEN
                UPDATE public.accounts SET current_balance = current_balance - NEW.amount WHERE id = NEW.account_id;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger function for receivables/payables remaining update
-- (A bit complex without linking table, but assuming we can track it via related_transaction_id or triggers on transactions)
-- Omitting the detailed PLPGSQL for receivable remaining to keep it simpler, but will add stub
CREATE OR REPLACE FUNCTION public.update_receivable_payable_remaining()
RETURNS TRIGGER AS $$
BEGIN
    -- Update logic here
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 2. TABLES
-- ==========================================

-- 1. profiles
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
    display_name TEXT,
    currency TEXT DEFAULT 'INR' CHECK (char_length(currency) = 3),
    timezone TEXT DEFAULT 'UTC',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. accounts
CREATE TABLE public.accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    purpose TEXT,
    institution TEXT,
    account_number_last4 TEXT,
    opening_balance NUMERIC(15,2) DEFAULT 0.00,
    current_balance NUMERIC(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    color TEXT,
    icon TEXT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. transaction_categories
CREATE TABLE public.transaction_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES public.transaction_categories(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('income', 'expense', 'both', 'transfer', 'investment')),
    icon TEXT,
    color TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. counterparties (need this before transactions for foreign key)
CREATE TABLE public.counterparties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    relationship TEXT,
    phone TEXT,
    email TEXT,
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. ipos (need this before transactions)
CREATE TABLE public.ipos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    company TEXT,
    open_date DATE,
    close_date DATE,
    listing_date DATE,
    price_band_low NUMERIC(15,2),
    price_band_high NUMERIC(15,2),
    lot_size INT,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. investments (need this before transactions)
CREATE TABLE public.investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    asset_type TEXT CHECK (asset_type IN ('stock','mf','etf','ipo','fd','bond','other')),
    symbol TEXT,
    quantity NUMERIC(15,4) DEFAULT 0,
    purchase_date DATE,
    purchase_price NUMERIC(15,2),
    total_invested NUMERIC(15,2) DEFAULT 0,
    current_value NUMERIC(15,2) DEFAULT 0,
    current_price NUMERIC(15,2),
    last_price_update TIMESTAMPTZ,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    broker TEXT,
    demat_account TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. transactions
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    time TIME,
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    direction TEXT CHECK (direction IN ('in', 'out')),
    transaction_type TEXT,
    category_id UUID REFERENCES public.transaction_categories(id) ON DELETE SET NULL,
    subcategory_id UUID REFERENCES public.transaction_categories(id) ON DELETE SET NULL,
    description TEXT,
    counterparty_id UUID REFERENCES public.counterparties(id) ON DELETE SET NULL,
    ownership TEXT CHECK (ownership IN ('personal', 'third_party')),
    payment_method TEXT,
    upi_reference TEXT,
    bank_reference TEXT,
    linked_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    related_person_id UUID REFERENCES public.counterparties(id) ON DELETE SET NULL,
    related_ipo_id UUID REFERENCES public.ipos(id) ON DELETE SET NULL,
    related_investment_id UUID REFERENCES public.investments(id) ON DELETE SET NULL,
    notes TEXT,
    reconciliation_status TEXT DEFAULT 'unreconciled',
    status TEXT CHECK (status IN ('draft', 'pending', 'confirmed', 'reconciled', 'needs_review', 'voided')) DEFAULT 'confirmed',
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for account balance on transactions
CREATE TRIGGER update_account_balance_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE PROCEDURE public.update_account_balance();

-- 6. tags
CREATE TABLE public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. transaction_tags
CREATE TABLE public.transaction_tags (
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
);

-- 7. transfers
CREATE TABLE public.transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    from_transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
    to_transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
    amount NUMERIC(15,2) NOT NULL,
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. receivables
CREATE TABLE public.receivables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    counterparty_id UUID REFERENCES public.counterparties(id) ON DELETE CASCADE NOT NULL,
    original_amount NUMERIC(15,2) NOT NULL,
    amount_received NUMERIC(15,2) DEFAULT 0.00,
    remaining NUMERIC(15,2) GENERATED ALWAYS AS (original_amount - amount_received) STORED,
    due_date DATE,
    reason TEXT,
    status TEXT,
    related_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. payables
CREATE TABLE public.payables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    counterparty_id UUID REFERENCES public.counterparties(id) ON DELETE CASCADE NOT NULL,
    original_amount NUMERIC(15,2) NOT NULL,
    amount_paid NUMERIC(15,2) DEFAULT 0.00,
    remaining NUMERIC(15,2) GENERATED ALWAYS AS (original_amount - amount_paid) STORED,
    due_date DATE,
    reason TEXT,
    status TEXT,
    related_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. loans
CREATE TABLE public.loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    counterparty_id UUID REFERENCES public.counterparties(id) ON DELETE CASCADE NOT NULL,
    type TEXT CHECK (type IN ('given', 'received')),
    principal NUMERIC(15,2) NOT NULL,
    interest_rate NUMERIC(5,2),
    amount_repaid NUMERIC(15,2) DEFAULT 0.00,
    remaining NUMERIC(15,2) GENERATED ALWAYS AS (principal - amount_repaid) STORED,
    start_date DATE,
    due_date DATE,
    status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. third_party_funds
CREATE TABLE public.third_party_funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    counterparty_id UUID REFERENCES public.counterparties(id) ON DELETE CASCADE NOT NULL,
    amount_received NUMERIC(15,2) NOT NULL,
    purpose TEXT,
    date_received DATE,
    amount_used NUMERIC(15,2) DEFAULT 0.00,
    amount_refunded NUMERIC(15,2) DEFAULT 0.00,
    amount_returned NUMERIC(15,2) DEFAULT 0.00,
    outstanding NUMERIC(15,2) GENERATED ALWAYS AS (amount_received - amount_used - amount_refunded - amount_returned) STORED,
    status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. ipo_applications
CREATE TABLE public.ipo_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    ipo_id UUID REFERENCES public.ipos(id) ON DELETE CASCADE NOT NULL,
    applicant_name TEXT,
    fund_owner TEXT CHECK (fund_owner IN ('personal', 'third_party')),
    counterparty_id UUID REFERENCES public.counterparties(id) ON DELETE SET NULL,
    funding_source_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    application_amount NUMERIC(15,2) NOT NULL,
    application_date DATE,
    broker TEXT,
    demat_account TEXT,
    upi_mandate_id TEXT,
    application_number TEXT,
    category TEXT CHECK (category IN ('retail', 'hni', 'shni')),
    allotment_status TEXT,
    shares_allotted INT DEFAULT 0,
    amount_debited NUMERIC(15,2) DEFAULT 0.00,
    refund_amount NUMERIC(15,2) DEFAULT 0.00,
    refund_date DATE,
    refund_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    sale_proceeds NUMERIC(15,2) DEFAULT 0.00,
    charges NUMERIC(15,2) DEFAULT 0.00,
    amount_returned NUMERIC(15,2) DEFAULT 0.00,
    date_returned DATE,
    outstanding_amount NUMERIC(15,2) DEFAULT 0.00,
    status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. investment_transactions
CREATE TABLE public.investment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    investment_id UUID REFERENCES public.investments(id) ON DELETE CASCADE NOT NULL,
    type TEXT CHECK (type IN ('buy', 'sell', 'dividend', 'split', 'bonus')),
    date DATE NOT NULL,
    quantity NUMERIC(15,4),
    price NUMERIC(15,2),
    amount NUMERIC(15,2),
    fees NUMERIC(15,2) DEFAULT 0.00,
    taxes NUMERIC(15,2) DEFAULT 0.00,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. budgets
CREATE TABLE public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    month INT CHECK (month BETWEEN 1 AND 12),
    year INT,
    total_budget NUMERIC(15,2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, month, year)
);

-- 18. budget_categories
CREATE TABLE public.budget_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID REFERENCES public.budgets(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES public.transaction_categories(id) ON DELETE CASCADE NOT NULL,
    allocated_amount NUMERIC(15,2) DEFAULT 0.00,
    spent_amount NUMERIC(15,2) DEFAULT 0.00,
    UNIQUE (budget_id, category_id)
);

-- 19. savings_goals
CREATE TABLE public.savings_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    target_amount NUMERIC(15,2) NOT NULL,
    current_amount NUMERIC(15,2) DEFAULT 0.00,
    deadline DATE,
    monthly_contribution NUMERIC(15,2) DEFAULT 0.00,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    icon TEXT,
    color TEXT,
    status TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 20. documents
CREATE TABLE public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    file_size BIGINT,
    entity_type TEXT CHECK (entity_type IN ('transaction', 'ipo', 'investment', 'account', 'counterparty', 'tax')),
    entity_id UUID,
    description TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 21. bank_statements
CREATE TABLE public.bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
    file_path TEXT,
    file_name TEXT,
    period_start DATE,
    period_end DATE,
    opening_balance NUMERIC(15,2),
    closing_balance NUMERIC(15,2),
    imported_at TIMESTAMPTZ,
    status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 22. bank_statement_transactions
CREATE TABLE public.bank_statement_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID REFERENCES public.bank_statements(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    description TEXT,
    amount NUMERIC(15,2) NOT NULL,
    direction TEXT CHECK (direction IN ('in', 'out')),
    balance NUMERIC(15,2),
    reference TEXT,
    is_matched BOOLEAN DEFAULT FALSE,
    matched_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    is_duplicate BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 23. reconciliations
CREATE TABLE public.reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    statement_balance NUMERIC(15,2),
    ledger_balance NUMERIC(15,2),
    difference NUMERIC(15,2),
    status TEXT,
    matched_count INT DEFAULT 0,
    unmatched_count INT DEFAULT 0,
    notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 24. monthly_closings
CREATE TABLE public.monthly_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    month INT CHECK (month BETWEEN 1 AND 12),
    year INT,
    status TEXT CHECK (status IN ('open', 'closed')),
    closed_at TIMESTAMPTZ,
    reopened_at TIMESTAMPTZ,
    reopen_reason TEXT,
    checklist JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, month, year)
);

-- 25. audit_logs
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 26. automation_rules
CREATE TABLE public.automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    priority INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 27. notifications
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 28. tax_records
CREATE TABLE public.tax_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    financial_year TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(15,2) NOT NULL,
    category TEXT,
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 29. split_expenses
CREATE TABLE public.split_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    description TEXT,
    total_amount NUMERIC(15,2) NOT NULL,
    date DATE NOT NULL,
    category_id UUID REFERENCES public.transaction_categories(id) ON DELETE SET NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 30. split_expense_shares
CREATE TABLE public.split_expense_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    split_expense_id UUID REFERENCES public.split_expenses(id) ON DELETE CASCADE NOT NULL,
    counterparty_id UUID REFERENCES public.counterparties(id) ON DELETE CASCADE NOT NULL,
    share_amount NUMERIC(15,2) NOT NULL,
    is_paid BOOLEAN DEFAULT FALSE,
    payment_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. INDEXES
-- ==========================================

-- Add indexes on frequently queried columns (user_id, date, account_id, etc.)
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);
CREATE INDEX idx_accounts_user_id ON public.accounts(user_id);
CREATE INDEX idx_transaction_categories_user_id ON public.transaction_categories(user_id);
CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_date ON public.transactions(date);
CREATE INDEX idx_transactions_account_id ON public.transactions(account_id);
CREATE INDEX idx_transactions_category_id ON public.transactions(category_id);
CREATE INDEX idx_receivables_user_id ON public.receivables(user_id);
CREATE INDEX idx_payables_user_id ON public.payables(user_id);
CREATE INDEX idx_ipos_user_id ON public.ipos(user_id);
CREATE INDEX idx_investments_user_id ON public.investments(user_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON public.audit_logs(timestamp);

-- ==========================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ==========================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counterparties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaction_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.third_party_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ipo_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;
-- audit_logs has specific requirement: DO NOT restrict inserts from triggers
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_expense_shares ENABLE ROW LEVEL SECURITY;

-- Helper to create policies
-- For all tables with user_id:
DO $$
DECLARE
    t_name text;
    tables_with_user_id text[] := ARRAY[
        'profiles', 'accounts', 'transaction_categories', 'transactions', 'counterparties',
        'ipos', 'investments', 'tags', 'transfers', 'receivables', 'payables',
        'loans', 'third_party_funds', 'ipo_applications', 'investment_transactions',
        'budgets', 'savings_goals', 'documents', 'bank_statements',
        'reconciliations', 'monthly_closings', 'automation_rules', 'notifications',
        'tax_records', 'split_expenses'
    ];
BEGIN
    FOREACH t_name IN ARRAY tables_with_user_id
    LOOP
        EXECUTE format('CREATE POLICY "Users can view their own %s" ON public.%I FOR SELECT USING (auth.uid() = user_id)', t_name, t_name);
        EXECUTE format('CREATE POLICY "Users can insert their own %s" ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id)', t_name, t_name);
        EXECUTE format('CREATE POLICY "Users can update their own %s" ON public.%I FOR UPDATE USING (auth.uid() = user_id)', t_name, t_name);
        EXECUTE format('CREATE POLICY "Users can delete their own %s" ON public.%I FOR DELETE USING (auth.uid() = user_id)', t_name, t_name);
    END LOOP;
END
$$;

-- Policy for system transaction categories
CREATE POLICY "Users can view system transaction categories" ON public.transaction_categories
    FOR SELECT USING (is_system = true OR auth.uid() = user_id);

-- Policies for tables without direct user_id (using JOINs or linked IDs)
-- transaction_tags
CREATE POLICY "Users can view own transaction tags" ON public.transaction_tags
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can insert own transaction tags" ON public.transaction_tags
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can update own transaction tags" ON public.transaction_tags
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid()));
CREATE POLICY "Users can delete own transaction tags" ON public.transaction_tags
    FOR DELETE USING (EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = transaction_id AND t.user_id = auth.uid()));

-- budget_categories
CREATE POLICY "Users can view own budget categories" ON public.budget_categories
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND b.user_id = auth.uid()));
CREATE POLICY "Users can insert own budget categories" ON public.budget_categories
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND b.user_id = auth.uid()));
CREATE POLICY "Users can update own budget categories" ON public.budget_categories
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND b.user_id = auth.uid()));
CREATE POLICY "Users can delete own budget categories" ON public.budget_categories
    FOR DELETE USING (EXISTS (SELECT 1 FROM public.budgets b WHERE b.id = budget_id AND b.user_id = auth.uid()));

-- bank_statement_transactions
CREATE POLICY "Users can view own statement txns" ON public.bank_statement_transactions
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.bank_statements bs WHERE bs.id = statement_id AND bs.user_id = auth.uid()));
CREATE POLICY "Users can insert own statement txns" ON public.bank_statement_transactions
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.bank_statements bs WHERE bs.id = statement_id AND bs.user_id = auth.uid()));
CREATE POLICY "Users can update own statement txns" ON public.bank_statement_transactions
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.bank_statements bs WHERE bs.id = statement_id AND bs.user_id = auth.uid()));
CREATE POLICY "Users can delete own statement txns" ON public.bank_statement_transactions
    FOR DELETE USING (EXISTS (SELECT 1 FROM public.bank_statements bs WHERE bs.id = statement_id AND bs.user_id = auth.uid()));

-- split_expense_shares
CREATE POLICY "Users can view own split shares" ON public.split_expense_shares
    FOR SELECT USING (EXISTS (SELECT 1 FROM public.split_expenses se WHERE se.id = split_expense_id AND se.user_id = auth.uid()));
CREATE POLICY "Users can insert own split shares" ON public.split_expense_shares
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.split_expenses se WHERE se.id = split_expense_id AND se.user_id = auth.uid()));
CREATE POLICY "Users can update own split shares" ON public.split_expense_shares
    FOR UPDATE USING (EXISTS (SELECT 1 FROM public.split_expenses se WHERE se.id = split_expense_id AND se.user_id = auth.uid()));
CREATE POLICY "Users can delete own split shares" ON public.split_expense_shares
    FOR DELETE USING (EXISTS (SELECT 1 FROM public.split_expenses se WHERE se.id = split_expense_id AND se.user_id = auth.uid()));

-- Audit logs specific policies: SELECT is user only, INSERT is public (from triggers)
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "System can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (true); -- Allow triggers to insert regardless of user context
