-- ==============================================================================
-- NISFLOW FINANCE — FIX NO ACTION FKs BLOCKING auth.users DELETION
-- ==============================================================================
-- PROBLEM: 7 FK constraints from public tables to auth.users had ON DELETE
-- NO ACTION, causing user deletion to fail in Supabase Dashboard and Admin API
-- whenever a user appeared in admin_audit_log, app_access_settings,
-- journal_entries, ledger_audit_log, or user_access_control (approved_by /
-- suspended_by).
--
-- FIX: Change to SET NULL. Audit/log rows are preserved; only the user
-- reference is nulled on deletion. CASCADE FKs (accounts, transactions, etc.)
-- are completely unaffected.
-- ==============================================================================

BEGIN;

ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_actor_user_id_fkey;
ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_actor_user_id_fkey
  FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_target_user_id_fkey;
ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_target_user_id_fkey
  FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.app_access_settings
  DROP CONSTRAINT IF EXISTS app_access_settings_updated_by_fkey;
ALTER TABLE public.app_access_settings
  ADD CONSTRAINT app_access_settings_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_created_by_fkey;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.ledger_audit_log
  DROP CONSTRAINT IF EXISTS ledger_audit_log_actor_id_fkey;
ALTER TABLE public.ledger_audit_log
  ADD CONSTRAINT ledger_audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_access_control
  DROP CONSTRAINT IF EXISTS user_access_control_approved_by_fkey;
ALTER TABLE public.user_access_control
  ADD CONSTRAINT user_access_control_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_access_control
  DROP CONSTRAINT IF EXISTS user_access_control_suspended_by_fkey;
ALTER TABLE public.user_access_control
  ADD CONSTRAINT user_access_control_suspended_by_fkey
  FOREIGN KEY (suspended_by) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMIT;
