-- Migration 029: Create atomic delete_user_account RPC
-- Authoritative, transactional permanent deletion of current authenticated user
-- Purges all 35 user financial data tables, access controls, profiles, and auth.users identity.

CREATE OR REPLACE FUNCTION public.delete_user_account(p_confirmation_phrase text)
RETURNS jsonb AS $$
DECLARE
    v_user_id uuid;
    v_reset_result jsonb;
    v_reset_id text;
BEGIN
    -- 1. Must be authenticated
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR auth.role() <> 'authenticated' THEN
        RAISE EXCEPTION 'Authentication Required: Anonymous callers cannot delete an account.';
    END IF;

    -- 2. Strict confirmation phrase check
    IF p_confirmation_phrase IS NULL OR p_confirmation_phrase <> 'DELETE MY ACCOUNT' THEN
        RAISE EXCEPTION 'Confirmation Mismatch: You must provide the exact confirmation phrase ''DELETE MY ACCOUNT''.';
    END IF;

    -- 3. Reset and purge all 35 user financial data tables
    v_reset_id := 'DELETE_ACCOUNT:' || v_user_id::text || ':' || gen_random_uuid()::text;
    v_reset_result := public.reset_user_data(v_reset_id, 'RESET MY DATA');

    IF v_reset_result IS NULL OR (v_reset_result->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Financial data purge failed: %', v_reset_result;
    END IF;

    -- 4. Delete access control and profile
    DELETE FROM public.user_access_control WHERE user_id = v_user_id;
    DELETE FROM public.profiles WHERE id = v_user_id;

    -- 5. Delete identity from auth.users
    DELETE FROM auth.users WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Account and all financial data permanently deleted.',
        'user_id', v_user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions;

REVOKE ALL ON FUNCTION public.delete_user_account(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_user_account(text) TO authenticated;
