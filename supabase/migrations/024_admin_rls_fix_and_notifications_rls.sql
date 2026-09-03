-- ==============================================================================
-- NISFLOW FINANCE — MIGRATION 024: ADMIN RLS FIX + NOTIFICATIONS RLS
-- ==============================================================================
-- LOW-05/DB-01: Restrict app_admin_users SELECT to own row
-- MED-06/DB-05: Full notifications ownership RLS
-- Adds admin_exists() SECURITY DEFINER boolean RPC

-- PART 1: Fix app_admin_users SELECT policy (LOW-05)
DROP POLICY IF EXISTS "Users can view admin status" ON public.app_admin_users;

CREATE POLICY "Users can view own admin status"
    ON public.app_admin_users FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- PART 2: admin_exists() SECURITY DEFINER RPC (no UUID exposure)
CREATE OR REPLACE FUNCTION public.admin_exists()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.app_admin_users LIMIT 1);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.admin_exists() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_exists() TO authenticated;

-- PART 3: Notifications table full ownership RLS (DB-05)
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Allow notification read" ON public.notifications;
DROP POLICY IF EXISTS "Notifications are private" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;

CREATE POLICY "notifications_select_own"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert_own"
    ON public.notifications FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_delete_own"
    ON public.notifications FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "approved_users_only_notifications" ON public.notifications;
CREATE POLICY "approved_users_only_notifications" ON public.notifications
    AS RESTRICTIVE FOR ALL TO authenticated
    USING (public.is_user_approved());
