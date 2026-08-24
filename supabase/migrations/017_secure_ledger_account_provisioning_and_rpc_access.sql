-- 017_secure_ledger_account_provisioning_and_rpc_access.sql
-- Canonical tenant-bound ledger provisioning and RPC access hardening.

CREATE OR REPLACE FUNCTION public.ensure_ledger_account(
  p_user_id uuid,
  p_code text,
  p_name text,
  p_account_type public.ledger_account_type,
  p_entity_type text,
  p_entity_id uuid,
  p_currency text DEFAULT 'INR'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_existing uuid;
  v_code_existing uuid;
  v_entity_existing uuid;
BEGIN
  IF v_actor IS NULL OR auth.role() <> 'authenticated' THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'Authorization error: target user must match auth.uid().' USING ERRCODE = '42501';
  END IF;
  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RAISE EXCEPTION 'Ledger account code is required.' USING ERRCODE = '22023';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'Ledger account name is required.' USING ERRCODE = '22023';
  END IF;
  IF p_entity_type IS NULL OR btrim(p_entity_type) = '' THEN
    RAISE EXCEPTION 'Ledger account entity_type is required.' USING ERRCODE = '22023';
  END IF;
  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Ledger account entity_id is required.' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_code_existing FROM public.ledger_accounts
  WHERE user_id = v_actor AND code = p_code LIMIT 1;
  SELECT id INTO v_entity_existing FROM public.ledger_accounts
  WHERE user_id = v_actor AND entity_type = p_entity_type AND entity_id = p_entity_id LIMIT 1;

  IF v_code_existing IS NOT NULL AND v_entity_existing IS NOT NULL AND v_code_existing <> v_entity_existing THEN
    RAISE EXCEPTION 'Ledger account identity conflict for code % and entity %.%', p_code, p_entity_type, p_entity_id USING ERRCODE = '23505';
  END IF;

  v_existing := COALESCE(v_code_existing, v_entity_existing);
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  PERFORM set_config('nisflow.allow_ledger_account_admin', 'on', true);
  INSERT INTO public.ledger_accounts (
    user_id, code, name, account_type, entity_type, entity_id, currency, is_active
  ) VALUES (
    v_actor, p_code, p_name, p_account_type, p_entity_type, p_entity_id,
    COALESCE(NULLIF(btrim(p_currency), ''), 'INR'), true
  )
  ON CONFLICT (user_id, code) DO NOTHING
  RETURNING id INTO v_existing;

  IF v_existing IS NULL THEN
    SELECT id INTO v_existing FROM public.ledger_accounts
    WHERE user_id = v_actor AND code = p_code LIMIT 1;
  END IF;
  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'Unable to provision ledger account %.', p_code;
  END IF;
  RETURN v_existing;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('nisflow.allow_ledger_account_admin', 'off', true);
    RAISE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_ledger_account_balance(p_ledger_account_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_account_type public.ledger_account_type;
  v_account_user_id uuid;
  v_balance numeric(15,2);
BEGIN
  IF auth.role() <> 'authenticated' OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication Required: Anonymous callers cannot query ledger account balances.' USING ERRCODE = '42501';
  END IF;
  SELECT account_type, user_id INTO v_account_type, v_account_user_id
  FROM public.ledger_accounts WHERE id = p_ledger_account_id;
  IF v_account_type IS NULL OR v_account_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Ledger account % not found', p_ledger_account_id USING ERRCODE = '42501';
  END IF;

  IF v_account_type IN ('asset', 'expense') THEN
    SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0.00) INTO v_balance
    FROM public.journal_lines jl JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.ledger_account_id = p_ledger_account_id AND jl.user_id = auth.uid()
      AND je.user_id = auth.uid() AND je.status IN ('posted', 'reversed');
  ELSE
    SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0.00) INTO v_balance
    FROM public.journal_lines jl JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.ledger_account_id = p_ledger_account_id AND jl.user_id = auth.uid()
      AND je.user_id = auth.uid() AND je.status IN ('posted', 'reversed');
  END IF;
  RETURN v_balance;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_ledger_account(uuid,text,text,public.ledger_account_type,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_ledger_account(uuid,text,text,public.ledger_account_type,text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_ledger_account_balance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ledger_account_balance(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reconcile_ledger_balances(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_ledger_balances(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
