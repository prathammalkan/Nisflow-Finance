-- 019_restore_authenticated_ledger_account_provisioning.sql
-- Fixes production `permission denied for table ledger_accounts` during account creation.
-- Journal mutations remain RPC-only; authenticated users may only provision their own
-- protected ledger-account projection.

GRANT INSERT ON TABLE public.ledger_accounts TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_enforce_ledger_account_insert_protection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF current_setting('nisflow.allow_ledger_account_admin', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.role() <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required to provision ledger accounts.' USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Ledger account ownership violation.' USING ERRCODE = '42501';
  END IF;

  IF NEW.code IS NULL OR btrim(NEW.code) = '' THEN
    RAISE EXCEPTION 'Ledger account code is required.' USING ERRCODE = '22023';
  END IF;

  IF NEW.entity_type IS NULL OR btrim(NEW.entity_type) = '' OR NEW.entity_id IS NULL THEN
    RAISE EXCEPTION 'Ledger account entity identity is required.' USING ERRCODE = '22023';
  END IF;

  IF NEW.entity_type = 'account'
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts a
       WHERE a.id = NEW.entity_id AND a.user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'Ledger account entity does not belong to the authenticated user.' USING ERRCODE = '42501';
  END IF;

  IF NEW.entity_type IN ('loan','loan_interest')
     AND NEW.entity_id <> '00000000-0000-0000-0000-000000000004'::uuid
     AND NOT EXISTS (
       SELECT 1 FROM public.loans l
       WHERE l.id = NEW.entity_id AND l.user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'Ledger loan entity does not belong to the authenticated user.' USING ERRCODE = '42501';
  END IF;

  IF NEW.entity_type = 'investment'
     AND NEW.entity_id <> '00000000-0000-0000-0000-000000000005'::uuid
     AND NOT EXISTS (
       SELECT 1 FROM public.investments i
       WHERE i.id = NEW.entity_id AND i.user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'Ledger investment entity does not belong to the authenticated user.' USING ERRCODE = '42501';
  END IF;

  IF NEW.entity_type IN ('counterparty','counterparty_receivable','counterparty_payable')
     AND NEW.entity_id <> '00000000-0000-0000-0000-000000000003'::uuid
     AND NOT EXISTS (
       SELECT 1 FROM public.counterparties c
       WHERE c.id = NEW.entity_id AND c.user_id = auth.uid()
     ) THEN
    RAISE EXCEPTION 'Ledger counterparty entity does not belong to the authenticated user.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE INSERT ON TABLE public.journal_entries FROM authenticated;
REVOKE INSERT ON TABLE public.journal_lines FROM authenticated;
REVOKE INSERT ON TABLE public.ledger_audit_log FROM authenticated;

NOTIFY pgrst, 'reload schema';
