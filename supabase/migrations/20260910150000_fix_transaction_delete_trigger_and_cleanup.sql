-- Fix prevent_completed_transaction_delete: allow bypass for CASCADE user
-- deletion and data-reset context. Then purge stuck IDOR test users.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_completed_transaction_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS 
BEGIN
    IF current_setting('nisflow.allow_data_reset', true) = 'on' THEN
        RETURN OLD;
    END IF;
    IF pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    IF OLD.status = 'completed' THEN
        RAISE EXCEPTION
            'Completed financial transactions cannot be deleted; use a reversal';
    END IF;
    RETURN OLD;
END;
;

ALTER TABLE public.transactions DISABLE TRIGGER USER;
UPDATE public.transactions
   SET linked_transaction_id = NULL, journal_entry_id = NULL
 WHERE user_id IN (
   '1a56ac8b-55ad-43fb-bb64-c870a813e936',
   'e70bb8b0-0c1b-4876-ad6d-cae2cf43bc03'
 );
ALTER TABLE public.transactions ENABLE TRIGGER USER;
DELETE FROM auth.users
WHERE id IN (
  '1a56ac8b-55ad-43fb-bb64-c870a813e936',
  'e70bb8b0-0c1b-4876-ad6d-cae2cf43bc03'
)
AND email LIKE 'idor-a-%@nisflow-audit.invalid';

COMMIT;
