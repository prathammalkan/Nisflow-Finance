-- ============================================================================
-- MIGRATION 026: FEATURE GAP CLOSURE
-- NisFlow Finance — Phase 4 Feature Additions
--
-- Adds:
--   1. bank_rules — versioned Indian bank/NPCI rules
--   2. ais_records — user-imported AIS data for reconciliation
--   3. evidence_links — links documents to financial entities
--   4. tax_radar_snapshots — periodic tax radar captures
--   5. risk_flags — financial risk monitor records
--
-- Security:
--   - All tables have RLS + FORCE ROW LEVEL SECURITY
--   - All policies scope to auth.uid() = user_id
--   - No cross-tenant access
--   - All SECURITY DEFINER functions use SET search_path = public, extensions
-- ============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. BANK RULES TABLE (reference data — admin-managed, user-visible read-only)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.bank_rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id     TEXT NOT NULL UNIQUE,           -- e.g. 'NPCI-UPI-P2P-DAILY-01'
    rule_type   TEXT NOT NULL,                  -- e.g. 'upi_daily_limit'
    bank_id     TEXT,                           -- NULL = RBI/NPCI universal rule
    value       NUMERIC,                        -- numeric value
    value_text  TEXT,                           -- text value if not numeric
    unit        TEXT NOT NULL,                  -- 'INR_per_day', 'INR_per_txn', etc.
    description TEXT NOT NULL,
    conditions  JSONB DEFAULT '[]'::JSONB,
    exceptions  JSONB DEFAULT '[]'::JSONB,
    effective_from DATE NOT NULL,
    effective_to   DATE,                        -- NULL = currently active
    source_authority TEXT NOT NULL,
    source_url  TEXT NOT NULL,
    source_circular TEXT,
    source_section  TEXT,
    is_rbi_npci_rule BOOLEAN NOT NULL DEFAULT false,
    verified_at TIMESTAMPTZ NOT NULL,
    status      TEXT NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'UNVERIFIED', 'SUPERSEDED', 'BANK_SPECIFIC')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS bank_rules_type_idx ON public.bank_rules(rule_type);
CREATE INDEX IF NOT EXISTS bank_rules_bank_id_idx ON public.bank_rules(bank_id);
CREATE INDEX IF NOT EXISTS bank_rules_status_idx ON public.bank_rules(status);

-- RLS: Admin write, authenticated read
ALTER TABLE public.bank_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bank_rules_select" ON public.bank_rules;
CREATE POLICY "bank_rules_select"
    ON public.bank_rules FOR SELECT
    TO authenticated
    USING (true);  -- All authenticated users can read reference data

-- Only admin can write (INSERT/UPDATE/DELETE via service role or admin function)
DROP POLICY IF EXISTS "bank_rules_admin_write" ON public.bank_rules;
CREATE POLICY "bank_rules_admin_write"
    ON public.bank_rules FOR ALL
    TO service_role
    USING (true);

-- -----------------------------------------------------------------------------
-- 2. AIS RECORDS TABLE (user-imported AIS data)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ais_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tax_year            TEXT NOT NULL,              -- 'FY2025-26'
    transaction_type    TEXT NOT NULL,              -- AIS transaction type
    reported_by         TEXT NOT NULL,              -- institution name
    reported_by_pan     TEXT,
    amount              NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    transaction_date    DATE,
    ais_description     TEXT,
    data_source         TEXT NOT NULL,              -- 'bank', 'employer', etc.
    is_user_accepted    BOOLEAN,                    -- NULL = not reviewed, true = accepted, false = disputed
    dispute_reason      TEXT,
    is_from_it_portal   BOOLEAN NOT NULL DEFAULT false,
    is_verified         BOOLEAN NOT NULL DEFAULT false,
    is_resolved         BOOLEAN NOT NULL DEFAULT false,
    resolved_at         TIMESTAMPTZ,
    import_batch_id     UUID,                       -- link multiple AIS records from same import
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ais_records_user_year_idx ON public.ais_records(user_id, tax_year);
CREATE INDEX IF NOT EXISTS ais_records_type_idx ON public.ais_records(transaction_type);

ALTER TABLE public.ais_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ais_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ais_records_user_select" ON public.ais_records;
CREATE POLICY "ais_records_user_select"
    ON public.ais_records FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "ais_records_user_insert" ON public.ais_records;
CREATE POLICY "ais_records_user_insert"
    ON public.ais_records FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ais_records_user_update" ON public.ais_records;
CREATE POLICY "ais_records_user_update"
    ON public.ais_records FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "ais_records_user_delete" ON public.ais_records;
CREATE POLICY "ais_records_user_delete"
    ON public.ais_records FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 3. EVIDENCE LINKS TABLE (link documents to financial entities)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.evidence_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    document_id     UUID NOT NULL,      -- references documents table
    entity_type     TEXT NOT NULL,      -- 'transaction', 'journal', 'loan', 'investment', 'tax_record', 'ais_record'
    entity_id       UUID NOT NULL,
    tax_year        TEXT,               -- 'FY2025-26' if tax-relevant
    tax_classification TEXT,           -- 'deduction_80c', 'tds_certificate', etc.
    audit_relevance TEXT,               -- why this document is relevant for audit
    retention_until DATE,              -- document retention deadline
    is_primary      BOOLEAN NOT NULL DEFAULT false,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE (user_id, document_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS evidence_links_user_entity_idx ON public.evidence_links(user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS evidence_links_document_idx ON public.evidence_links(document_id);
CREATE INDEX IF NOT EXISTS evidence_links_tax_year_idx ON public.evidence_links(user_id, tax_year);

ALTER TABLE public.evidence_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_links FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "evidence_links_user_select" ON public.evidence_links;
CREATE POLICY "evidence_links_user_select"
    ON public.evidence_links FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "evidence_links_user_insert" ON public.evidence_links;
CREATE POLICY "evidence_links_user_insert"
    ON public.evidence_links FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "evidence_links_user_update" ON public.evidence_links;
CREATE POLICY "evidence_links_user_update"
    ON public.evidence_links FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "evidence_links_user_delete" ON public.evidence_links;
CREATE POLICY "evidence_links_user_delete"
    ON public.evidence_links FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 4. TAX RADAR SNAPSHOTS TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tax_radar_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tax_year        TEXT NOT NULL,
    regime          TEXT NOT NULL CHECK (regime IN ('old', 'new')),
    overall_status  TEXT NOT NULL CHECK (overall_status IN ('GREEN', 'YELLOW', 'ORANGE', 'RED')),
    projected_total_tax  NUMERIC(15,2),
    estimated_tax_payable NUMERIC(15,2),
    advance_tax_paid NUMERIC(15,2) DEFAULT 0,
    tds_credit       NUMERIC(15,2) DEFAULT 0,
    flags_json       JSONB DEFAULT '[]'::JSONB,
    optimization_json JSONB DEFAULT '[]'::JSONB,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tax_radar_user_year_idx ON public.tax_radar_snapshots(user_id, tax_year);

ALTER TABLE public.tax_radar_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_radar_snapshots FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tax_radar_user_select" ON public.tax_radar_snapshots;
CREATE POLICY "tax_radar_user_select"
    ON public.tax_radar_snapshots FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "tax_radar_user_insert" ON public.tax_radar_snapshots;
CREATE POLICY "tax_radar_user_insert"
    ON public.tax_radar_snapshots FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tax_radar_user_delete" ON public.tax_radar_snapshots;
CREATE POLICY "tax_radar_user_delete"
    ON public.tax_radar_snapshots FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 5. RISK FLAGS TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.risk_flags (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    flag_id         TEXT NOT NULL,           -- unique flag code
    risk_category   TEXT NOT NULL,
    risk_level      TEXT NOT NULL CHECK (risk_level IN ('NORMAL', 'REVIEW', 'HIGH_RISK')),
    title           TEXT NOT NULL,
    explanation     TEXT NOT NULL,
    observation     TEXT NOT NULL,
    recommended_action TEXT NOT NULL,
    regulatory_context TEXT,
    related_entity_type TEXT,
    related_entity_id   UUID,
    amount_in_rs    NUMERIC(15,2),
    is_resolved     BOOLEAN NOT NULL DEFAULT false,
    resolved_at     TIMESTAMPTZ,
    resolution_note TEXT,
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS risk_flags_user_idx ON public.risk_flags(user_id);
CREATE INDEX IF NOT EXISTS risk_flags_level_idx ON public.risk_flags(user_id, risk_level);
CREATE INDEX IF NOT EXISTS risk_flags_resolved_idx ON public.risk_flags(user_id, is_resolved);
CREATE INDEX IF NOT EXISTS risk_flags_entity_idx ON public.risk_flags(user_id, related_entity_type, related_entity_id);

ALTER TABLE public.risk_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_flags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "risk_flags_user_select" ON public.risk_flags;
CREATE POLICY "risk_flags_user_select"
    ON public.risk_flags FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "risk_flags_user_insert" ON public.risk_flags;
CREATE POLICY "risk_flags_user_insert"
    ON public.risk_flags FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "risk_flags_user_update" ON public.risk_flags;
CREATE POLICY "risk_flags_user_update"
    ON public.risk_flags FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "risk_flags_user_delete" ON public.risk_flags;
CREATE POLICY "risk_flags_user_delete"
    ON public.risk_flags FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- 6. UPDATED_AT TRIGGER
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ais_records_updated_at') THEN
        CREATE TRIGGER ais_records_updated_at
            BEFORE UPDATE ON public.ais_records
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'bank_rules_updated_at') THEN
        CREATE TRIGGER bank_rules_updated_at
            BEFORE UPDATE ON public.bank_rules
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION 026
-- ============================================================================
