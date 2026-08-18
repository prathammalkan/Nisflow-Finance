-- ==============================================================================
-- NISFLOW FINANCE: TASK 4B READ-ONLY DATABASE VERIFICATION SCRIPT
-- Purpose: Inspects and audits the PostgreSQL/Supabase database for ledger schema,
--          constraints, RLS, functions, triggers, row counts, and data integrity.
-- Safety:  100% READ-ONLY (No INSERT, UPDATE, DELETE, DROP, or ALTER operations).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. POSTGRESQL VERSION & SERVER CONTEXT
-- ------------------------------------------------------------------------------
SELECT 
    version() AS postgresql_full_version,
    current_database() AS database_name,
    current_schema() AS active_schema,
    current_user AS connected_user,
    NOW() AS verification_timestamp;

-- ------------------------------------------------------------------------------
-- 2. EXISTENCE OF DOUBLE-ENTRY LEDGER TABLES & ENUMS
-- ------------------------------------------------------------------------------
SELECT 
    table_schema,
    table_name,
    CASE 
        WHEN table_name IN ('ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_audit_log') 
        THEN 'LEDGER_FOUNDATION'
        ELSE 'LEGACY_TABLE'
    END AS table_category,
    (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public' 
  AND table_name IN (
    'ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_audit_log',
    'accounts', 'transactions', 'counterparties', 'receivables', 'payables', 'loans', 'investments'
  )
ORDER BY table_category DESC, table_name ASC;

-- Check custom enums
SELECT 
    t.typname AS enum_name,
    e.enumlabel AS enum_value,
    e.enumsortorder AS sort_order
FROM pg_type t 
JOIN pg_enum e ON t.oid = e.enumtypid  
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' 
  AND t.typname IN ('ledger_account_type', 'journal_entry_status')
ORDER BY enum_name, sort_order;

-- ------------------------------------------------------------------------------
-- 3. LEDGER TABLE COLUMNS & DATA TYPES
-- ------------------------------------------------------------------------------
SELECT 
    table_name,
    column_name,
    data_type,
    character_maximum_length,
    numeric_precision,
    numeric_scale,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_audit_log')
ORDER BY table_name, ordinal_position;

-- ------------------------------------------------------------------------------
-- 4. PRIMARY KEYS, FOREIGN KEYS & UNIQUE CONSTRAINTS
-- ------------------------------------------------------------------------------
SELECT
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS referenced_table_name,
    ccu.column_name AS referenced_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_audit_log')
ORDER BY tc.table_name, tc.constraint_type DESC, tc.constraint_name;

-- ------------------------------------------------------------------------------
-- 5. CHECK CONSTRAINTS (MONETARY INVARIANTS)
-- ------------------------------------------------------------------------------
SELECT 
    tc.table_name,
    tc.constraint_name,
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_audit_log')
ORDER BY tc.table_name, tc.constraint_name;

-- ------------------------------------------------------------------------------
-- 6. IMMUTABILITY TRIGGERS
-- ------------------------------------------------------------------------------
SELECT 
    event_object_table AS target_table,
    trigger_name,
    event_manipulation AS trigger_event,
    action_timing AS timing,
    action_statement AS executed_action
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_audit_log')
ORDER BY event_object_table, trigger_name;

-- ------------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) STATUS & POLICIES
-- ------------------------------------------------------------------------------
SELECT 
    c.relname AS table_name,
    CASE WHEN c.relrowsecurity THEN 'ENABLED' ELSE 'DISABLED' END AS rls_status,
    CASE WHEN c.relforcerowsecurity THEN 'FORCED' ELSE 'STANDARD' END AS rls_enforcement
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_audit_log', 'accounts', 'transactions')
ORDER BY c.relname;

-- RLS Policies Details
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd AS applied_command,
    qual AS using_expression,
    with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_audit_log')
ORDER BY tablename, policyname;

-- ------------------------------------------------------------------------------
-- 8. LEDGER STORED PROCEDURES & SECURITY CONFIGURATION
-- ------------------------------------------------------------------------------
SELECT 
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS function_arguments,
    pg_get_function_result(p.oid) AS return_type,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_type,
    COALESCE(array_to_string(p.proconfig, ', '), 'DEFAULT') AS search_path_configuration
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'post_journal_entry',
    'post_reversal_entry',
    'get_ledger_account_balance',
    'reconcile_ledger_balances'
  )
ORDER BY p.proname;

-- ------------------------------------------------------------------------------
-- 9. RECORD COUNTS (LEDGER VS LEGACY TABLES)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_sql TEXT := '';
BEGIN
    -- Safe dynamic query across available tables
END $$;

SELECT 'ledger_accounts' AS table_name, COUNT(*) AS row_count FROM public.ledger_accounts
UNION ALL
SELECT 'journal_entries', COUNT(*) FROM public.journal_entries
UNION ALL
SELECT 'journal_lines', COUNT(*) FROM public.journal_lines
UNION ALL
SELECT 'ledger_audit_log', COUNT(*) FROM public.ledger_audit_log
UNION ALL
SELECT 'accounts (legacy)', COUNT(*) FROM public.accounts
UNION ALL
SELECT 'transactions (legacy)', COUNT(*) FROM public.transactions
UNION ALL
SELECT 'counterparties (legacy)', COUNT(*) FROM public.counterparties
UNION ALL
SELECT 'receivables (legacy)', COUNT(*) FROM public.receivables
UNION ALL
SELECT 'payables (legacy)', COUNT(*) FROM public.payables
UNION ALL
SELECT 'loans (legacy)', COUNT(*) FROM public.loans
UNION ALL
SELECT 'investments (legacy)', COUNT(*) FROM public.investments;

-- ------------------------------------------------------------------------------
-- 10. INTEGRITY AUDIT: ORPHAN LINES, UNBALANCED ENTRIES, DUPLICATES
-- ------------------------------------------------------------------------------

-- A. Unbalanced Journal Entries (Invariant Check: Debits must equal Credits)
SELECT 
    je.id AS journal_entry_id,
    je.user_id,
    je.transaction_date,
    je.description,
    COALESCE(SUM(jl.debit_amount), 0.00) AS total_debits,
    COALESCE(SUM(jl.credit_amount), 0.00) AS total_credits,
    (COALESCE(SUM(jl.debit_amount), 0.00) - COALESCE(SUM(jl.credit_amount), 0.00)) AS discrepancy
FROM public.journal_entries je
LEFT JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
GROUP BY je.id, je.user_id, je.transaction_date, je.description
HAVING COALESCE(SUM(jl.debit_amount), 0.00) <> COALESCE(SUM(jl.credit_amount), 0.00)
    OR COUNT(jl.id) < 2;

-- B. Orphan Journal Lines (Lines pointing to non-existent entries or accounts)
SELECT 
    jl.id AS orphan_line_id,
    jl.journal_entry_id,
    jl.ledger_account_id,
    jl.debit_amount,
    jl.credit_amount
FROM public.journal_lines jl
LEFT JOIN public.journal_entries je ON je.id = jl.journal_entry_id
LEFT JOIN public.ledger_accounts la ON la.id = jl.ledger_account_id
WHERE je.id IS NULL OR la.id IS NULL;

-- C. Duplicate Idempotency Keys within User Scope
SELECT 
    user_id,
    idempotency_key,
    COUNT(*) AS occurrence_count
FROM public.journal_entries
GROUP BY user_id, idempotency_key
HAVING COUNT(*) > 1;

-- D. Cross-User Tenant Isolation Check (Journal lines belonging to different user than header)
SELECT 
    jl.id AS line_id,
    jl.user_id AS line_user_id,
    je.id AS entry_id,
    je.user_id AS entry_user_id
FROM public.journal_lines jl
JOIN public.journal_entries je ON je.id = jl.journal_entry_id
WHERE jl.user_id <> je.user_id;

-- E. Reversed Entry Chain Integrity (Reversed status without reversal_of_id or vice versa)
SELECT 
    id,
    user_id,
    status,
    reversal_of_id
FROM public.journal_entries
WHERE (status = 'reversed' AND reversal_of_id IS NULL)
   OR (status = 'posted' AND reversal_of_id IS NOT NULL AND source_type <> 'reversal');
