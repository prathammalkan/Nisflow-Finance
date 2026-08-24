-- 020_harden_tenant_scoped_foreign_keys.sql
-- Enforce tenant ownership across child -> parent relations where both tables
-- carry user_id. Existing production data was verified clean before validation.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_counterparties_user_id_id') THEN
    ALTER TABLE public.counterparties ADD CONSTRAINT uq_counterparties_user_id_id UNIQUE (user_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_people_user_id_id') THEN
    ALTER TABLE public.people ADD CONSTRAINT uq_people_user_id_id UNIQUE (user_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_ipos_user_id_id') THEN
    ALTER TABLE public.ipos ADD CONSTRAINT uq_ipos_user_id_id UNIQUE (user_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_investments_user_id_id') THEN
    ALTER TABLE public.investments ADD CONSTRAINT uq_investments_user_id_id UNIQUE (user_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='uq_loans_user_id_id') THEN
    ALTER TABLE public.loans ADD CONSTRAINT uq_loans_user_id_id UNIQUE (user_id,id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_documents_transaction_same_user') THEN
    ALTER TABLE public.documents ADD CONSTRAINT fk_documents_transaction_same_user
      FOREIGN KEY (user_id,transaction_id) REFERENCES public.transactions(user_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_ipo_applications_ipo_same_user') THEN
    ALTER TABLE public.ipo_applications ADD CONSTRAINT fk_ipo_applications_ipo_same_user
      FOREIGN KEY (user_id,ipo_id) REFERENCES public.ipos(user_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_ipo_applications_counterparty_same_user') THEN
    ALTER TABLE public.ipo_applications ADD CONSTRAINT fk_ipo_applications_counterparty_same_user
      FOREIGN KEY (user_id,counterparty_id) REFERENCES public.counterparties(user_id,id) ON DELETE SET NULL (counterparty_id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_payables_person_same_user') THEN
    ALTER TABLE public.payables ADD CONSTRAINT fk_payables_person_same_user
      FOREIGN KEY (user_id,person_id) REFERENCES public.people(user_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_receivables_person_same_user') THEN
    ALTER TABLE public.receivables ADD CONSTRAINT fk_receivables_person_same_user
      FOREIGN KEY (user_id,person_id) REFERENCES public.people(user_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_recurring_account_same_user') THEN
    ALTER TABLE public.recurring_transactions ADD CONSTRAINT fk_recurring_account_same_user
      FOREIGN KEY (user_id,account_id) REFERENCES public.accounts(user_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_third_party_funds_account_same_user') THEN
    ALTER TABLE public.third_party_funds ADD CONSTRAINT fk_third_party_funds_account_same_user
      FOREIGN KEY (user_id,account_id) REFERENCES public.accounts(user_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_third_party_funds_person_same_user') THEN
    ALTER TABLE public.third_party_funds ADD CONSTRAINT fk_third_party_funds_person_same_user
      FOREIGN KEY (user_id,person_id) REFERENCES public.people(user_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_tax_records_transaction_same_user') THEN
    ALTER TABLE public.tax_records ADD CONSTRAINT fk_tax_records_transaction_same_user
      FOREIGN KEY (user_id,transaction_id) REFERENCES public.transactions(user_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_bank_statements_account_same_user') THEN
    ALTER TABLE public.bank_statements ADD CONSTRAINT fk_bank_statements_account_same_user
      FOREIGN KEY (user_id,account_id) REFERENCES public.accounts(user_id,id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

ALTER TABLE public.documents VALIDATE CONSTRAINT fk_documents_transaction_same_user;
ALTER TABLE public.ipo_applications VALIDATE CONSTRAINT fk_ipo_applications_ipo_same_user;
ALTER TABLE public.ipo_applications VALIDATE CONSTRAINT fk_ipo_applications_counterparty_same_user;
ALTER TABLE public.payables VALIDATE CONSTRAINT fk_payables_person_same_user;
ALTER TABLE public.receivables VALIDATE CONSTRAINT fk_receivables_person_same_user;
ALTER TABLE public.recurring_transactions VALIDATE CONSTRAINT fk_recurring_account_same_user;
ALTER TABLE public.third_party_funds VALIDATE CONSTRAINT fk_third_party_funds_account_same_user;
ALTER TABLE public.third_party_funds VALIDATE CONSTRAINT fk_third_party_funds_person_same_user;
ALTER TABLE public.tax_records VALIDATE CONSTRAINT fk_tax_records_transaction_same_user;
ALTER TABLE public.bank_statements VALIDATE CONSTRAINT fk_bank_statements_account_same_user;
