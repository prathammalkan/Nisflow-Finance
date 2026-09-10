-- ==============================================================================
-- NISFLOW FINANCE — PRODUCTION DATA RESET SCRIPT (OPTION B)
-- ==============================================================================
--
-- PURPOSE : Data-only reset. Removes ALL application/user/test financial data.
--           Preserves schema, RLS, triggers, functions, grants, indexes,
--           constraints, migration history, bank_rules reference data, and
--           system transaction categories (is_system = true).
--
-- OPTION  : B — Financial data purged. Admin bootstrap also cleared.
--           Auth users must be deleted separately via Supabase Dashboard
--           AFTER running this script.
--
-- EXECUTION: Supabase Dashboard → SQL Editor (runs as service_role)
--
-- SAFETY  :
--   - Single transaction — all-or-nothing
--   - nisflow.allow_data_reset bypass scoped to this transaction only
--   - Strict FK topological deletion order — zero FK violations
--   - Self-referential FKs NULLed before deletion
--   - Conditionally-present tables guarded with to_regclass()
--   - Post-deletion integrity verification raises EXCEPTION on failure
--
-- AFTER RUNNING THIS SCRIPT:
--   1. Review NOTICE output and verify all counts
--   2. Go to Supabase Dashboard → Authentication → Users → delete all users
--   3. First person to sign up claims admin via bootstrap_first_admin()
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- PHASE 0: PRE-RESET ROW COUNTS
-- ==============================================================================
DO $$
DECLARE
    v_counts JSONB;
BEGIN
    SELECT jsonb_build_object(
        'accounts',           (SELECT COUNT(*) FROM public.accounts),
        'transactions',       (SELECT COUNT(*) FROM public.transactions),
        'journal_entries',    (SELECT COUNT(*) FROM public.journal_entries),
        'journal_lines',      (SELECT COUNT(*) FROM public.journal_lines),
        'ledger_accounts',    (SELECT COUNT(*) FROM public.ledger_accounts),
        'ledger_audit_log',   (SELECT COUNT(*) FROM public.ledger_audit_log),
        'counterparties',     (SELECT COUNT(*) FROM public.counterparties),
        'loans',              (SELECT COUNT(*) FROM public.loans),
        'investments',        (SELECT COUNT(*) FROM public.investments),
        'receivables',        (SELECT COUNT(*) FROM public.receivables),
        'payables',           (SELECT COUNT(*) FROM public.payables),
        'ipos',               (SELECT COUNT(*) FROM public.ipos),
        'notifications',      (SELECT COUNT(*) FROM public.notifications),
        'audit_logs',         (SELECT COUNT(*) FROM public.audit_logs),
        'ais_records',        (SELECT COUNT(*) FROM public.ais_records),
        'risk_flags',         (SELECT COUNT(*) FROM public.risk_flags),
        'tax_radar_snapshots',(SELECT COUNT(*) FROM public.tax_radar_snapshots),
        'evidence_links',     (SELECT COUNT(*) FROM public.evidence_links),
        'push_subscriptions', (SELECT COUNT(*) FROM public.push_subscriptions),
        'profiles_total',     (SELECT COUNT(*) FROM public.profiles),
        'system_categories',  (SELECT COUNT(*) FROM public.transaction_categories WHERE is_system = true),
        'bank_rules',         (SELECT COUNT(*) FROM public.bank_rules),
        'app_admin_users',    (SELECT COUNT(*) FROM public.app_admin_users),
        'admin_audit_log',    (SELECT COUNT(*) FROM public.admin_audit_log)
    ) INTO v_counts;

    RAISE NOTICE '=== PRE-RESET ROW COUNTS === %', v_counts::text;
END $$;

-- ==============================================================================
-- PHASE 1: DISABLE IMMUTABILITY TRIGGERS + SET BYPASS FLAG
-- ==============================================================================
-- Some immutability triggers check the GUC setting 'nisflow.allow_data_reset'.
-- Others (e.g. fn_enforce_ledger_audit_log_immutability) do not check the GUC
-- and will block deletes regardless. We disable ALL triggers on the affected
-- ledger tables for the duration of this transaction, then re-enable them.
-- ALTER TABLE ... DISABLE TRIGGER requires table owner / superuser — the
-- Supabase Dashboard SQL Editor runs as service_role which has this privilege.
--
-- The GUC is still set for belt-and-suspenders coverage of any trigger that
-- does check it.

-- 1a. Transaction-local GUC bypass (for triggers that check it)
SELECT set_config('nisflow.allow_data_reset', 'on', true);

-- 1b. Disable USER-DEFINED triggers only on the three immutable ledger tables.
--     USER keyword skips system FK constraint triggers (RI_ConstraintTrigger_*)
--     which cannot be disabled without session_replication_role.
ALTER TABLE public.ledger_audit_log DISABLE TRIGGER USER;
ALTER TABLE public.journal_lines    DISABLE TRIGGER USER;
ALTER TABLE public.journal_entries  DISABLE TRIGGER USER;


-- ==============================================================================
-- PHASE 2: DATA DELETION — STRICT TOPOLOGICAL ORDER
-- ==============================================================================

-- Step 1: ledger_audit_log
-- (references journal_entries — must precede it)
DELETE FROM public.ledger_audit_log;

-- Step 2: journal_lines
-- (references journal_entries, ledger_accounts — must precede both)
DELETE FROM public.journal_lines;

-- Step 3: journal_entries
-- Self-referential FK: reversal_of_id → must NULL before delete
UPDATE public.journal_entries SET reversal_of_id = NULL;
DELETE FROM public.journal_entries;

-- Step 4: ledger_accounts
DELETE FROM public.ledger_accounts;

-- Step 5: bank_statement_transactions
-- (references bank_statements — must precede it)
DELETE FROM public.bank_statement_transactions;

-- Step 6: evidence_links
-- (references documents — must precede documents)
DELETE FROM public.evidence_links;

-- Step 7: tax_records
-- (references documents — must precede documents)
DELETE FROM public.tax_records;

-- Step 8: documents
DELETE FROM public.documents;

-- Step 9: split_expense_shares
-- (references split_expenses, counterparties — must precede both)
DELETE FROM public.split_expense_shares;

-- Step 10: split_expenses
-- (references accounts, transactions — must precede both)
DELETE FROM public.split_expenses;

-- Step 11: transaction_tags
-- (references transactions, tags — must precede both)
DELETE FROM public.transaction_tags;

-- Step 12: transfers
-- (references transactions — must precede transactions)
DELETE FROM public.transfers;

-- Step 13: budget_categories
-- (references budgets, transaction_categories — must precede budgets)
DELETE FROM public.budget_categories;

-- Step 14: bank_statements
-- (bank_statement_transactions already deleted in Step 5)
DELETE FROM public.bank_statements;

-- Step 15: reconciliations
DELETE FROM public.reconciliations;

-- Step 16: ais_records
DELETE FROM public.ais_records;

-- Step 17: tax_radar_snapshots
DELETE FROM public.tax_radar_snapshots;

-- Step 18: risk_flags
DELETE FROM public.risk_flags;

-- Step 19: push_subscriptions
DELETE FROM public.push_subscriptions;

-- Step 20: recurring_transactions
DELETE FROM public.recurring_transactions;

-- Step 21: automation_rules
DELETE FROM public.automation_rules;

-- Step 22: notifications
DELETE FROM public.notifications;

-- Step 23: net_worth_snapshots
DELETE FROM public.net_worth_snapshots;

-- Step 24: monthly_closings
DELETE FROM public.monthly_closings;

-- Step 25: budgets
-- (budget_categories already deleted in Step 13)
DELETE FROM public.budgets;

-- Step 26: savings_goals
DELETE FROM public.savings_goals;

-- Step 27: receivables
DELETE FROM public.receivables;

-- Step 28: payables
DELETE FROM public.payables;

-- Step 29: third_party_funds
DELETE FROM public.third_party_funds;

-- Step 30: investment_transactions
DELETE FROM public.investment_transactions;

-- Step 31: ipo_applications
DELETE FROM public.ipo_applications;

-- Step 32: loans
DELETE FROM public.loans;

-- Step 33: investments
-- (investment_transactions already deleted in Step 30)
DELETE FROM public.investments;

-- Step 34: ipos
-- (ipo_applications already deleted in Step 31)
DELETE FROM public.ipos;

-- Step 35: transactions
-- NULL self-ref and ledger FK first
UPDATE public.transactions SET linked_transaction_id = NULL, journal_entry_id = NULL;
DELETE FROM public.transactions;

-- Step 36: tags
-- (transaction_tags already deleted in Step 11)
DELETE FROM public.tags;

-- Step 37: counterparties
-- (all child tables already deleted above)
DELETE FROM public.counterparties;

-- Step 38: accounts
-- (all child tables already deleted above)
DELETE FROM public.accounts;

-- Step 39: user-created categories only (PRESERVE is_system = true)
DELETE FROM public.transaction_categories
WHERE is_system = false OR is_system IS NULL;

-- Step 40: audit_logs (app-level events — full clear for fresh start)
DELETE FROM public.audit_logs;

-- ==============================================================================
-- CONDITIONALLY-PRESENT TABLES (may or may not exist in production)
-- ==============================================================================
DO $$
BEGIN
    IF to_regclass('public.net_worth_history') IS NOT NULL THEN
        DELETE FROM public.net_worth_history;
        RAISE NOTICE 'Deleted: net_worth_history';
    ELSE
        RAISE NOTICE 'Skipped: net_worth_history (table does not exist)';
    END IF;

    IF to_regclass('public.ai_insights') IS NOT NULL THEN
        DELETE FROM public.ai_insights;
        RAISE NOTICE 'Deleted: ai_insights';
    ELSE
        RAISE NOTICE 'Skipped: ai_insights (table does not exist)';
    END IF;

    IF to_regclass('public.people') IS NOT NULL THEN
        DELETE FROM public.people;
        RAISE NOTICE 'Deleted: people';
    ELSE
        RAISE NOTICE 'Skipped: people (table does not exist)';
    END IF;

    IF to_regclass('public.categories') IS NOT NULL THEN
        DELETE FROM public.categories;
        RAISE NOTICE 'Deleted: categories';
    ELSE
        RAISE NOTICE 'Skipped: categories (table does not exist)';
    END IF;

    IF to_regclass('public.savings_transactions') IS NOT NULL THEN
        DELETE FROM public.savings_transactions;
        RAISE NOTICE 'Deleted: savings_transactions';
    ELSE
        RAISE NOTICE 'Skipped: savings_transactions (table does not exist)';
    END IF;
END $$;

-- ==============================================================================
-- RE-ENABLE IMMUTABILITY TRIGGERS
-- ==============================================================================
-- Restore full immutability protection on ledger tables now that all
-- financial data has been deleted. From this point forward, the ledger is
-- once again append-only and journal entries are immutable.

ALTER TABLE public.ledger_audit_log ENABLE TRIGGER USER;
ALTER TABLE public.journal_lines    ENABLE TRIGGER USER;
ALTER TABLE public.journal_entries  ENABLE TRIGGER USER;

-- ==============================================================================
-- PHASE 3: ADMIN BOOTSTRAP RESET (Option B — user confirmed)
-- ==============================================================================
-- Clears admin designation and admin action log.
-- app_access_settings is PRESERVED (it is configuration, not user data).
-- user_access_control rows will cascade-delete via ON DELETE CASCADE
-- when auth users are deleted through the Supabase Dashboard.

DELETE FROM public.admin_audit_log;
DELETE FROM public.app_admin_users;

-- ==============================================================================
-- PHASE 4: PROFILES RESET
-- ==============================================================================
-- Profile rows survive (they reference auth.users — cascade deletes them
-- when auth users are removed via the Dashboard in the next step).
-- Reset onboarding state in case any users are not immediately deleted.

UPDATE public.profiles
SET onboarding_completed = false,
    updated_at = NOW();

-- ==============================================================================
-- PHASE 5: ENSURE app_access_settings HAS DEFAULT ROW
-- ==============================================================================
-- If the table is empty for any reason, re-seed the default configuration.

INSERT INTO public.app_access_settings (registration_mode)
SELECT 'public'
WHERE NOT EXISTS (SELECT 1 FROM public.app_access_settings);

-- ==============================================================================
-- PHASE 6: POST-DELETION INTEGRITY VERIFICATION
-- ==============================================================================
DO $$
DECLARE
    v_remaining BIGINT;
    v_failures  TEXT := '';
BEGIN
    -- ---- Financial records — all must be 0 ----
    SELECT COUNT(*) INTO v_remaining FROM public.accounts;
    IF v_remaining > 0 THEN v_failures := v_failures || 'accounts(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.transactions;
    IF v_remaining > 0 THEN v_failures := v_failures || 'transactions(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.journal_entries;
    IF v_remaining > 0 THEN v_failures := v_failures || 'journal_entries(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.journal_lines;
    IF v_remaining > 0 THEN v_failures := v_failures || 'journal_lines(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.ledger_accounts;
    IF v_remaining > 0 THEN v_failures := v_failures || 'ledger_accounts(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.ledger_audit_log;
    IF v_remaining > 0 THEN v_failures := v_failures || 'ledger_audit_log(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.investments;
    IF v_remaining > 0 THEN v_failures := v_failures || 'investments(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.loans;
    IF v_remaining > 0 THEN v_failures := v_failures || 'loans(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.receivables;
    IF v_remaining > 0 THEN v_failures := v_failures || 'receivables(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.payables;
    IF v_remaining > 0 THEN v_failures := v_failures || 'payables(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.counterparties;
    IF v_remaining > 0 THEN v_failures := v_failures || 'counterparties(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.ipos;
    IF v_remaining > 0 THEN v_failures := v_failures || 'ipos(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.ais_records;
    IF v_remaining > 0 THEN v_failures := v_failures || 'ais_records(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.risk_flags;
    IF v_remaining > 0 THEN v_failures := v_failures || 'risk_flags(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.tax_radar_snapshots;
    IF v_remaining > 0 THEN v_failures := v_failures || 'tax_radar_snapshots(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.evidence_links;
    IF v_remaining > 0 THEN v_failures := v_failures || 'evidence_links(' || v_remaining || ') '; END IF;

    SELECT COUNT(*) INTO v_remaining FROM public.app_admin_users;
    IF v_remaining > 0 THEN v_failures := v_failures || 'app_admin_users(' || v_remaining || ') '; END IF;

    -- Raise if any financial records remain
    IF length(v_failures) > 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — Records remain after reset: [%]', v_failures;
    END IF;

    -- ---- Reference / config data — must still have rows ----
    SELECT COUNT(*) INTO v_remaining FROM public.transaction_categories WHERE is_system = true;
    IF v_remaining = 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — System categories were deleted! Expected > 0.';
    END IF;
    RAISE NOTICE '✓ System categories preserved: %', v_remaining;

    SELECT COUNT(*) INTO v_remaining FROM public.app_access_settings;
    IF v_remaining = 0 THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — app_access_settings is empty!';
    END IF;
    RAISE NOTICE '✓ app_access_settings rows: %', v_remaining;

    SELECT COUNT(*) INTO v_remaining FROM public.bank_rules;
    RAISE NOTICE '✓ bank_rules preserved: %', v_remaining;

    -- ---- Trigger existence ----
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_journal_line_immutability') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — trg_journal_line_immutability MISSING.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_journal_entry_immutability') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — trg_journal_entry_immutability MISSING.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_account_balance_trigger') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — update_account_balance_trigger MISSING.';
    END IF;
    RAISE NOTICE '✓ Triggers intact: trg_journal_line_immutability, trg_journal_entry_immutability, update_account_balance_trigger';

    -- ---- Function existence ----
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='post_journal_entry') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — post_journal_entry MISSING.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='bootstrap_first_admin') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — bootstrap_first_admin MISSING.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_app_admin') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — is_app_admin MISSING.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reset_user_data') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — reset_user_data MISSING.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='is_user_approved') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — is_user_approved MISSING.';
    END IF;
    RAISE NOTICE '✓ Functions intact: post_journal_entry, bootstrap_first_admin, is_app_admin, reset_user_data, is_user_approved';

    -- ---- RLS policies ----
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='accounts') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — RLS policies for accounts MISSING.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='journal_entries') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — RLS policies for journal_entries MISSING.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='app_admin_users') THEN
        RAISE EXCEPTION 'INTEGRITY CHECK FAILED — RLS policies for app_admin_users MISSING.';
    END IF;
    RAISE NOTICE '✓ RLS policies intact on accounts, journal_entries, app_admin_users';

    RAISE NOTICE '=== ALL INTEGRITY CHECKS PASSED. RESET SUCCESSFUL. ===';
END $$;

-- ==============================================================================
-- PHASE 7: POST-RESET NOTICE COUNTS
-- ==============================================================================
DO $$
DECLARE v_counts JSONB;
BEGIN
    SELECT jsonb_build_object(
        'accounts',            (SELECT COUNT(*) FROM public.accounts),
        'transactions',        (SELECT COUNT(*) FROM public.transactions),
        'journal_entries',     (SELECT COUNT(*) FROM public.journal_entries),
        'journal_lines',       (SELECT COUNT(*) FROM public.journal_lines),
        'ledger_accounts',     (SELECT COUNT(*) FROM public.ledger_accounts),
        'counterparties',      (SELECT COUNT(*) FROM public.counterparties),
        'investments',         (SELECT COUNT(*) FROM public.investments),
        'loans',               (SELECT COUNT(*) FROM public.loans),
        'app_admin_users',     (SELECT COUNT(*) FROM public.app_admin_users),
        'system_categories',   (SELECT COUNT(*) FROM public.transaction_categories WHERE is_system = true),
        'bank_rules',          (SELECT COUNT(*) FROM public.bank_rules),
        'app_access_settings', (SELECT COUNT(*) FROM public.app_access_settings)
    ) INTO v_counts;
    RAISE NOTICE '=== POST-RESET ROW COUNTS === %', v_counts::text;
END $$;

-- ==============================================================================
-- COMMIT — if all verifications above passed, commit the reset
-- ==============================================================================
COMMIT;

-- ==============================================================================
-- POST-COMMIT STANDALONE VERIFICATION QUERIES
-- Run these individually after the transaction commits.
-- ==============================================================================

-- 1. ALL financial tables — expect 0
SELECT table_name, row_count
FROM (VALUES
    ('accounts',                  (SELECT COUNT(*) FROM public.accounts)),
    ('transactions',               (SELECT COUNT(*) FROM public.transactions)),
    ('journal_entries',            (SELECT COUNT(*) FROM public.journal_entries)),
    ('journal_lines',              (SELECT COUNT(*) FROM public.journal_lines)),
    ('ledger_accounts',            (SELECT COUNT(*) FROM public.ledger_accounts)),
    ('ledger_audit_log',           (SELECT COUNT(*) FROM public.ledger_audit_log)),
    ('counterparties',             (SELECT COUNT(*) FROM public.counterparties)),
    ('investments',                (SELECT COUNT(*) FROM public.investments)),
    ('investment_transactions',    (SELECT COUNT(*) FROM public.investment_transactions)),
    ('loans',                      (SELECT COUNT(*) FROM public.loans)),
    ('ipos',                       (SELECT COUNT(*) FROM public.ipos)),
    ('ipo_applications',           (SELECT COUNT(*) FROM public.ipo_applications)),
    ('receivables',                (SELECT COUNT(*) FROM public.receivables)),
    ('payables',                   (SELECT COUNT(*) FROM public.payables)),
    ('third_party_funds',          (SELECT COUNT(*) FROM public.third_party_funds)),
    ('transfers',                  (SELECT COUNT(*) FROM public.transfers)),
    ('transaction_tags',           (SELECT COUNT(*) FROM public.transaction_tags)),
    ('tags',                       (SELECT COUNT(*) FROM public.tags)),
    ('budgets',                    (SELECT COUNT(*) FROM public.budgets)),
    ('budget_categories',          (SELECT COUNT(*) FROM public.budget_categories)),
    ('savings_goals',              (SELECT COUNT(*) FROM public.savings_goals)),
    ('recurring_transactions',     (SELECT COUNT(*) FROM public.recurring_transactions)),
    ('documents',                  (SELECT COUNT(*) FROM public.documents)),
    ('evidence_links',             (SELECT COUNT(*) FROM public.evidence_links)),
    ('bank_statements',            (SELECT COUNT(*) FROM public.bank_statements)),
    ('bank_statement_transactions',(SELECT COUNT(*) FROM public.bank_statement_transactions)),
    ('reconciliations',            (SELECT COUNT(*) FROM public.reconciliations)),
    ('tax_records',                (SELECT COUNT(*) FROM public.tax_records)),
    ('tax_radar_snapshots',        (SELECT COUNT(*) FROM public.tax_radar_snapshots)),
    ('ais_records',                (SELECT COUNT(*) FROM public.ais_records)),
    ('risk_flags',                 (SELECT COUNT(*) FROM public.risk_flags)),
    ('push_subscriptions',         (SELECT COUNT(*) FROM public.push_subscriptions)),
    ('monthly_closings',           (SELECT COUNT(*) FROM public.monthly_closings)),
    ('net_worth_snapshots',        (SELECT COUNT(*) FROM public.net_worth_snapshots)),
    ('split_expenses',             (SELECT COUNT(*) FROM public.split_expenses)),
    ('split_expense_shares',       (SELECT COUNT(*) FROM public.split_expense_shares)),
    ('notifications',              (SELECT COUNT(*) FROM public.notifications)),
    ('automation_rules',           (SELECT COUNT(*) FROM public.automation_rules)),
    ('audit_logs',                 (SELECT COUNT(*) FROM public.audit_logs)),
    ('admin_audit_log',            (SELECT COUNT(*) FROM public.admin_audit_log)),
    ('app_admin_users',            (SELECT COUNT(*) FROM public.app_admin_users))
) AS t(table_name, row_count)
ORDER BY table_name;

-- 2. Reference / config — must be > 0
SELECT
    'system_categories'   AS check_item, COUNT(*) AS count, '> 0 expected' AS requirement
    FROM public.transaction_categories WHERE is_system = true
UNION ALL
SELECT 'bank_rules',   COUNT(*), 'preserved (admin-managed reference data)'
    FROM public.bank_rules
UNION ALL
SELECT 'app_access_settings', COUNT(*), '= 1 expected'
    FROM public.app_access_settings;

-- 3. RLS policies (spot-check)
SELECT tablename, COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- 4. Triggers
SELECT tgname AS trigger_name, relname AS table_name
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT tgisinternal
ORDER BY tgname;

-- 5. Key functions
SELECT proname AS function_name, prosecdef AS is_security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
      'post_journal_entry','post_reversal_entry','get_ledger_account_balance',
      'reconcile_ledger_balances','reset_user_data','preview_user_data_reset',
      'bootstrap_first_admin','is_app_admin','approve_user','suspend_user',
      'get_admin_user_list','grant_admin_role','revoke_admin_role',
      'handle_new_user','is_user_approved','get_people_ledger_summary',
      'fn_enforce_journal_line_immutability','fn_enforce_journal_entry_immutability'
  )
ORDER BY proname;
