# NisFlow Finance — Database Schema Reference

**Last Updated:** 2026-09-02  
**PostgreSQL Version:** 15 (Supabase)  
**Migration Count:** 26 (migrations 001–026)

> **IMPORTANT:** This document reflects the implemented schema as of Migration 026.
> Do not document planned functionality as implemented.

---

## Schema Overview

All tables reside in the `public` schema.
All tables have `FORCE ROW LEVEL SECURITY` enabled.
All user-data tables include `user_id UUID NOT NULL REFERENCES auth.users(id)`.

---

## Core Ledger Tables

### `journal_entries`
Immutable header for each double-entry posting.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | auth.users |
| entry_date | DATE | |
| description | TEXT | |
| entry_type | TEXT | expense, income, transfer, etc. |
| status | TEXT | posted, reversed |
| idempotency_key | TEXT UNIQUE | Prevents duplicate postings |
| reversal_of | UUID | FK to original entry if reversal |
| source_type | TEXT | ai, manual, recurring, etc. |
| source_id | UUID | |
| created_at | TIMESTAMPTZ | |

**Constraints:** `status IN ('posted', 'reversed')`  
**RLS:** SELECT/INSERT by owner only. UPDATE limited to status changes.  
**NOTE:** Direct INSERT revoked — all postings go through `post_journal_entry` RPC.

---

### `journal_lines`
Immutable individual debit/credit lines. UPDATE and DELETE blocked by trigger.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| entry_id | UUID FK | journal_entries |
| user_id | UUID FK | auth.users |
| ledger_account_id | UUID FK | ledger_accounts |
| side | TEXT | debit / credit |
| amount | NUMERIC(15,2) | CHECK > 0 |
| created_at | TIMESTAMPTZ | |

**Immutability Trigger:** `prevent_journal_line_modification` — blocks any UPDATE or DELETE.

---

### `ledger_accounts`
Canonical chart of accounts for each user.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| code | TEXT | e.g. `ASSET:BANK:HDFC_SAVINGS` |
| name | TEXT | |
| account_type | TEXT | asset, liability, equity, income, expense |
| entity_type | TEXT | bank, person, loan, investment, category |
| entity_id | UUID | Links to domain entity |
| currency | TEXT | Default INR |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

**Unique:** `(user_id, code)`

---

### `ledger_audit_log`
SHA-256 tamper-evidence log for all ledger events.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| event_type | TEXT | |
| journal_entry_id | UUID | |
| payload_hash | TEXT | SHA-256 of payload |
| payload_summary | JSONB | |
| created_at | TIMESTAMPTZ | |

---

## Account / Transaction Tables

### `accounts`
User financial accounts (bank, cash, credit card, investment, wallet).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| name | TEXT | |
| type | TEXT | bank, cash, credit, investment, wallet |
| institution | TEXT | |
| color | TEXT | |
| is_active | BOOLEAN | |
| ledger_account_id | UUID FK | |
| created_at | TIMESTAMPTZ | |

---

### `transactions`
Individual financial transactions linked to ledger entries.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| account_id | UUID FK | |
| amount | NUMERIC(15,2) | |
| type | TEXT | expense, income, transfer |
| description | TEXT | |
| date | DATE | |
| category_id | UUID FK | |
| counterparty_id | UUID FK | |
| journal_entry_id | UUID FK | |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |

---

## People / Counterparty Tables

### `people`
Named counterparties (friends, family, business contacts).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| name | TEXT | |
| phone | TEXT | |
| email | TEXT | |
| relationship | TEXT | |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |

---

### `receivables` / `payables`
Money owed to/from the user.

---

## Loan Tables

### `loans`
Loan facility metadata.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| name | TEXT | |
| lender | TEXT | |
| principal | NUMERIC(15,2) | |
| interest_rate | NUMERIC(5,2) | |
| emi_amount | NUMERIC(15,2) | |
| start_date | DATE | |
| end_date | DATE | |
| loan_account_id | UUID FK | ledger_accounts |
| created_at | TIMESTAMPTZ | |

---

## Investment Tables

### `investments`
Investment holdings and transactions.

---

## New Tables (Migration 026)

### `ais_records`
User-imported AIS (Annual Information Statement) data from IT Portal.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| tax_year | TEXT | e.g. 'FY2025-26' |
| transaction_type | TEXT | salary, interest_fd, etc. |
| reported_by | TEXT | Institution name |
| amount | NUMERIC(15,2) | |
| is_user_accepted | BOOLEAN | NULL=unreviewed, true=accepted, false=disputed |
| is_verified | BOOLEAN | From IT Portal or manual entry |
| created_at | TIMESTAMPTZ | |

**RLS:** All CRUD by owner only.

---

### `evidence_links`
Links uploaded documents to financial entities (transactions, loans, tax records).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| document_id | UUID | References documents table |
| entity_type | TEXT | transaction, loan, ais_record, etc. |
| entity_id | UUID | |
| tax_year | TEXT | |
| tax_classification | TEXT | deduction_80c, tds_certificate, etc. |
| audit_relevance | TEXT | |
| retention_until | DATE | |

**Unique:** `(user_id, document_id, entity_type, entity_id)`

---

### `bank_rules`
Versioned Indian bank and NPCI/RBI rule registry (admin-managed, user-readable).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| rule_id | TEXT UNIQUE | e.g. 'NPCI-UPI-P2P-DAILY-01' |
| rule_type | TEXT | upi_daily_limit, rtgs_minimum, etc. |
| bank_id | TEXT | NULL = universal RBI/NPCI rule |
| value | NUMERIC | |
| unit | TEXT | INR_per_day, percent_pa, etc. |
| is_rbi_npci_rule | BOOLEAN | |
| verified_at | TIMESTAMPTZ | |
| status | TEXT | ACTIVE, UNVERIFIED, SUPERSEDED |

---

### `tax_radar_snapshots`
Point-in-time tax radar reports.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| tax_year | TEXT | |
| regime | TEXT | old / new |
| overall_status | TEXT | GREEN/YELLOW/ORANGE/RED |
| projected_total_tax | NUMERIC | |
| flags_json | JSONB | Array of RadarFlag objects |
| optimization_json | JSONB | Array of optimization recommendations |

---

### `risk_flags`
Detected financial risk flags with explanations.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | |
| flag_id | TEXT | Unique flag code |
| risk_level | TEXT | NORMAL/REVIEW/HIGH_RISK |
| title | TEXT | |
| explanation | TEXT | Deterministic explanation |
| recommended_action | TEXT | |
| is_resolved | BOOLEAN | |

---

## RLS Summary

All 36+ tables: `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY`

Policies enforce:
1. `auth.uid() = user_id` on all user data tables
2. `is_user_approved(auth.uid()) = true` via application-level approval gate
3. Admin tables additionally check `is_app_admin()`
4. `bank_rules` table: SELECT for authenticated, write for service_role only

---

## Key RPCs (SECURITY DEFINER)

| RPC | Purpose |
|-----|---------|
| `post_journal_entry` | Only valid way to create ledger entries |
| `post_reversal_entry` | Only valid way to reverse entries |
| `provision_ledger_account` | Create ledger account for entity |
| `get_user_balances` | Read-only balance query |
| `reset_user_financial_data` | Idempotent data reset |

All RPCs validate `auth.uid() = p_user_id` and use `SET search_path = public, extensions`.
