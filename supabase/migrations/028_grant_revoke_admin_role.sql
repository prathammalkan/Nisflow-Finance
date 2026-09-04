-- ==============================================================================
-- NISFLOW FINANCE — MIGRATION 028: GRANT / REVOKE ADMIN ROLE + AUDIT LOG RPC
-- ==============================================================================
-- Closes P0 gap: no mechanism existed to promote a second admin after bootstrap
-- or to demote any admin without direct DB access.
--
-- New RPCs (all SECURITY DEFINER, granted only to `authenticated`):
--   grant_admin_role(p_target_user_id)  — admin-only promotion
--   revoke_admin_role(p_target_user_id) — admin-only demotion (cannot self-demote)
--   get_admin_audit_log(p_limit)        — admin-only audit trail read
--
-- Extends get_admin_user_list() to return `email` from auth.users.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. grant_admin_role
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.grant_admin_role(p_target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_actor_id UUID := auth.uid();
BEGIN
    -- Caller must be authenticated
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Caller must be an existing admin
    IF NOT public.is_app_admin(v_actor_id) THEN
        RAISE EXCEPTION 'Unauthorized: only an admin can grant admin role';
    END IF;

    -- Target must not already be an admin
    IF public.is_app_admin(p_target_user_id) THEN
        RAISE EXCEPTION 'User is already an admin';
    END IF;

    -- Target must exist in auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
        RAISE EXCEPTION 'Target user does not exist';
    END IF;

    -- Grant admin
    INSERT INTO public.app_admin_users (user_id, granted_by)
    VALUES (p_target_user_id, v_actor_id::text);

    -- Ensure target user is approved (cannot be admin while pending/suspended)
    INSERT INTO public.user_access_control (user_id, status, approved_at, approved_by)
    VALUES (p_target_user_id, 'approved', NOW(), v_actor_id)
    ON CONFLICT (user_id) DO UPDATE
        SET status = 'approved', approved_at = NOW(), approved_by = v_actor_id, updated_at = NOW();

    -- Audit
    INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id)
    VALUES (v_actor_id, 'ADMIN_GRANTED', p_target_user_id);

    RETURN jsonb_build_object('success', true, 'target_user_id', p_target_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.grant_admin_role(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.grant_admin_role(UUID) TO authenticated;

-- ==============================================================================
-- 2. revoke_admin_role
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.revoke_admin_role(p_target_user_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_actor_id UUID := auth.uid();
BEGIN
    -- Caller must be authenticated
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Caller must be an existing admin
    IF NOT public.is_app_admin(v_actor_id) THEN
        RAISE EXCEPTION 'Unauthorized: only an admin can revoke admin role';
    END IF;

    -- Admins cannot revoke their own role (prevents full lockout)
    IF v_actor_id = p_target_user_id THEN
        RAISE EXCEPTION 'Self-demotion not allowed: an admin cannot revoke their own admin role';
    END IF;

    -- Target must actually be an admin
    IF NOT public.is_app_admin(p_target_user_id) THEN
        RAISE EXCEPTION 'Target user is not an admin';
    END IF;

    -- Revoke
    DELETE FROM public.app_admin_users WHERE user_id = p_target_user_id;

    -- Audit
    INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id)
    VALUES (v_actor_id, 'ADMIN_REVOKED', p_target_user_id);

    RETURN jsonb_build_object('success', true, 'target_user_id', p_target_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.revoke_admin_role(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.revoke_admin_role(UUID) TO authenticated;

-- ==============================================================================
-- 3. get_admin_audit_log
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.get_admin_audit_log(p_limit INT DEFAULT 50)
RETURNS TABLE (
    id             UUID,
    actor_user_id  UUID,
    actor_email    TEXT,
    action         TEXT,
    target_user_id UUID,
    target_email   TEXT,
    logged_at      TIMESTAMPTZ,
    result         TEXT,
    metadata       JSONB
) AS $$
BEGIN
    IF NOT public.is_app_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: admin only';
    END IF;

    RETURN QUERY
    SELECT
        al.id,
        al.actor_user_id,
        actor_u.email       AS actor_email,
        al.action,
        al.target_user_id,
        target_u.email      AS target_email,
        al.timestamp        AS logged_at,
        al.result,
        al.metadata
    FROM public.admin_audit_log al
    LEFT JOIN auth.users actor_u  ON actor_u.id  = al.actor_user_id
    LEFT JOIN auth.users target_u ON target_u.id = al.target_user_id
    ORDER BY al.timestamp DESC
    LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_admin_audit_log(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_admin_audit_log(INT) TO authenticated;

-- ==============================================================================
-- 4. Extend get_admin_user_list to also return email
-- ==============================================================================
DROP FUNCTION IF EXISTS public.get_admin_user_list();

CREATE OR REPLACE FUNCTION public.get_admin_user_list()
RETURNS TABLE (
    user_id    UUID,
    email      TEXT,
    status     TEXT,
    is_admin   BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    IF NOT public.is_app_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Caller is not an admin';
    END IF;

    RETURN QUERY
    SELECT
        u.id                              AS user_id,
        u.email                           AS email,
        COALESCE(uac.status, 'approved')  AS status,
        public.is_app_admin(u.id)         AS is_admin,
        u.created_at                      AS created_at
    FROM auth.users u
    LEFT JOIN public.user_access_control uac ON u.id = uac.user_id
    ORDER BY u.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_admin_user_list() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_admin_user_list() TO authenticated;

COMMIT;
