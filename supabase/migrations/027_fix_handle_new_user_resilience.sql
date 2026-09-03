-- =============================================================================
-- MIGRATION 027: FIX handle_new_user TRIGGER FOR PRODUCTION SCHEMA
-- =============================================================================
-- Production profiles table actual schema:
--   id (uuid PK = auth.users.id), full_name, avatar_url, currency, created_at
-- (NOT user_id, display_name, timezone, onboarding_completed as in local migrations)
--
-- This migration fixes the trigger to match production reality, also adds
-- BEGIN/EXCEPTION guards so it can never block user creation.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_reg_mode TEXT := 'public';
BEGIN
    -- Insert profile (production schema: id, full_name, currency)
    INSERT INTO public.profiles (id, full_name, currency)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', ''),
        'INR'
    )
    ON CONFLICT (id) DO NOTHING;

    -- Safely read registration mode
    BEGIN
        SELECT registration_mode INTO v_reg_mode
        FROM public.app_access_settings LIMIT 1;
    EXCEPTION WHEN OTHERS THEN v_reg_mode := 'public'; END;

    -- Safely create access control record
    BEGIN
        INSERT INTO public.user_access_control (user_id, status, approved_at)
        VALUES (
            new.id,
            CASE WHEN COALESCE(v_reg_mode, 'public') = 'public' THEN 'approved' ELSE 'pending' END,
            CASE WHEN COALESCE(v_reg_mode, 'public') = 'public' THEN NOW() ELSE NULL END
        )
        ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_user_approved(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.user_access_control WHERE user_id = p_user_id AND status = 'approved');
EXCEPTION WHEN OTHERS THEN RETURN true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_app_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.app_admin_users WHERE user_id = p_user_id);
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

COMMIT;
