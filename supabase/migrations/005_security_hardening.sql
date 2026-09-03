-- 005_security_hardening.sql
-- Fix search_path hijacking vulnerability on SECURITY DEFINER function

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, currency, timezone, onboarding_completed)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', 'INR', 'UTC', false);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
