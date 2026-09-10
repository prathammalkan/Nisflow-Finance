-- ==============================================================================
-- NISFLOW FINANCE — MIGRATION 029: FIX bootstrap_first_admin() OVERLOAD AMBIGUITY
-- ==============================================================================
-- PROBLEM:
--   Two overloads of is_user_approved() exist:
--     1. public.is_user_approved()        — no args (migration 023, used by 33 RLS policies)
--     2. public.is_user_approved(UUID)    — one optional arg (migration 027)
--
--   bootstrap_first_admin() calls public.is_user_approved() with no args.
--   PostgreSQL cannot resolve which overload to use → "function is not unique".
--
-- FIX (safe — no policies dropped):
--   Rewrite bootstrap_first_admin() to call is_user_approved(v_user_id) with an
--   explicit UUID argument. PostgreSQL will now unambiguously resolve to the
--   UUID-param version. The 33 RLS policies calling is_user_approved() (no args)
--   are completely unaffected.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.bootstrap_first_admin()
RETURNS JSONB AS $$
DECLARE
    v_user_id     UUID;
    v_admin_count INT;
BEGIN
    -- 1. Must be authenticated
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- 2. Caller must be approved.
    --    Pass v_user_id explicitly to unambiguously call is_user_approved(UUID),
    --    avoiding the "function is not unique" error from the no-arg overload.
    IF NOT public.is_user_approved(v_user_id) THEN
        RAISE EXCEPTION 'Account not approved: your registration is pending admin review.';
    END IF;

    -- 3. Only allowed when no admin exists yet
    SELECT COUNT(*) INTO v_admin_count FROM public.app_admin_users;
    IF v_admin_count > 0 THEN
        RAISE EXCEPTION 'Admin already exists. Use grant_admin_role() instead.';
    END IF;

    -- 4. Grant admin and ensure access record is approved
    INSERT INTO public.app_admin_users (user_id, granted_by)
    VALUES (v_user_id, 'bootstrap');

    INSERT INTO public.user_access_control (user_id, status, approved_at, approved_by)
    VALUES (v_user_id, 'approved', NOW(), v_user_id)
    ON CONFLICT (user_id) DO UPDATE
    SET status = 'approved', approved_at = NOW(), approved_by = v_user_id, updated_at = NOW();

    RETURN jsonb_build_object('success', true, 'admin_user_id', v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.bootstrap_first_admin() TO authenticated;

COMMIT;
