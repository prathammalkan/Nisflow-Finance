-- =============================================================================
-- NISFLOW FINANCE - E2E SETUP SQL (Production Schema Corrected)
-- Profiles actual schema: id (uuid PK), full_name, avatar_url, currency, created_at
-- =============================================================================

BEGIN;

-- ─── Fix handle_new_user trigger to match actual production schema ─────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    v_reg_mode TEXT := 'public';
BEGIN
    -- Insert profile using actual production column names
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

    -- Safely insert access control record
    BEGIN
        INSERT INTO public.user_access_control (user_id, status, approved_at)
        VALUES (
            new.id,
            CASE WHEN COALESCE(v_reg_mode,'public') = 'public' THEN 'approved' ELSE 'pending' END,
            CASE WHEN COALESCE(v_reg_mode,'public') = 'public' THEN NOW() ELSE NULL END
        )
        ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Reattach trigger (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;

-- =============================================================================
-- CREATE E2E TEST USER
-- =============================================================================
DO $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'e2e-test-user@nisflow.test';

    IF v_user_id IS NULL THEN
        INSERT INTO auth.users (
            instance_id, id, aud, role, email,
            encrypted_password, email_confirmed_at,
            created_at, updated_at,
            confirmation_token, recovery_token,
            raw_app_meta_data, raw_user_meta_data, is_super_admin
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            gen_random_uuid(), 'authenticated', 'authenticated',
            'e2e-test-user@nisflow.test',
            crypt('E2eTestPassword!2026', gen_salt('bf')),
            NOW(), NOW(), NOW(), '', '',
            '{"provider":"email","providers":["email"]}',
            '{"full_name":"E2E Test User"}', false
        ) RETURNING id INTO v_user_id;
        RAISE NOTICE 'Test user created: %', v_user_id;
    ELSE
        UPDATE auth.users SET
            encrypted_password = crypt('E2eTestPassword!2026', gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
            updated_at = NOW()
        WHERE id = v_user_id;
        RAISE NOTICE 'Test user already exists, password reset: %', v_user_id;
    END IF;

    -- Ensure profile row (actual column names)
    INSERT INTO public.profiles (id, full_name, currency)
    VALUES (v_user_id, 'E2E Test User', 'INR')
    ON CONFLICT (id) DO NOTHING;

    -- Ensure approved access control
    INSERT INTO public.user_access_control (user_id, status, approved_at)
    VALUES (v_user_id, 'approved', NOW())
    ON CONFLICT (user_id) DO UPDATE SET status = 'approved', approved_at = NOW();

    RAISE NOTICE 'E2E test user fully provisioned: %', v_user_id;
END;
$$;
