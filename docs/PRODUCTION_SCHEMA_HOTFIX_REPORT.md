# Production Schema Hotfix Report

**Date:** 2026-08-21  
**Auditor & Production DBA:** Senior Production Software Engineer, Supabase/PostgreSQL DBA, Financial Systems Architect  
**Repository:** `L:\PRATHAM\PROJECTS\NISFLOW FINANCE`  
**Live Target Supabase Instance:** `https://qyjhicibrciqcznsdevk.supabase.co`  
**Deployment Target:** Production  

---

## 1. Incident

During the live production smoke test on the deployed application, when navigating to **Settings → Danger Zone → Reset Financial Data** and submitting the exact confirmation phrase:
```
RESET MY DATA
```
the application failed at the database execution stage and displayed:
```
column "details" does not exist (PostgreSQL error code 42703)
```
No financial data was corrupted or deleted; the stored procedure transaction aborted cleanly.

---

## 2. Root Cause

### Migration State vs. Remote Production Schema Divergence
1. **Migration `001_initial_schema.sql`** created `public.audit_logs` with columns: `id`, `user_id`, `action`, `entity_type`, `entity_id`, `old_data`, `new_data`, `timestamp`, `ip_address`, `user_agent`. It did **not** define `details JSONB`.
2. **Migration `011_user_data_reset.sql`** created the stored procedure `public.reset_user_data(p_reset_id, p_confirmation_phrase)`, which executed an `INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details) VALUES (...)`. However, migration `011` omitted the DDL `ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB;`.
3. **Migration `012_security_and_schema_alignment.sql`** in the repository added the required DDL:
   ```sql
   ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB;
   ```
4. **Migration `013_reset_idempotency.sql`** in the repository updated `public.reset_user_data` to inspect `public.audit_logs.details->>'reset_id'` for idempotency replay detection.
5. **Cause of Failure:** Migrations `012` and `013` were committed to git and validated in the test suite, but had **not yet been applied to the remote live Supabase database project** (`qyjhicibrciqcznsdevk`). Consequently, the live database retained the `011` version of `reset_user_data` that failed when attempting to write to the non-existent `details` column.

---

## 3. Evidence

### Live Database Schema Introspection
A direct non-destructive query against the production Supabase endpoint `https://qyjhicibrciqcznsdevk.supabase.co` confirmed:

```javascript
// Query: select('details') from public.audit_logs
Details Error: {
  code: '42703',
  details: null,
  hint: null,
  message: 'column audit_logs.details does not exist'
}
```

### Supabase CLI Linkage Status
- Project reference: `qyjhicibrciqcznsdevk`
- CLI status: CLI requires Supabase Management API access (`SUPABASE_ACCESS_TOKEN` / `supabase login`) or direct Postgres connection string to execute automated `supabase db push`.
- Repository provides the complete, self-contained, transactional migration script ready for execution: `supabase/APPLY_MIGRATIONS_012_013.sql`.

---

## 4. Changes Made

### 1. Canonical Migration SQL Script (`supabase/APPLY_MIGRATIONS_012_013.sql`)
Bundled migrations `012` and `013` into a single atomic transaction containing:
- `ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB;`
- BOLA-hardened `public.get_ledger_account_balance(UUID)` (enforcing `auth.uid() = ledger_accounts.user_id`)
- Actor-spoofing-hardened `public.post_journal_entry(...)` and `public.post_reversal_entry(...)` (forcing actor strictly to `auth.uid()`)
- Idempotent `public.reset_user_data(TEXT, TEXT)` (with DB-03 audit log lookup)
- Explicit `REVOKE EXECUTE ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;`

### 2. Automated Regression Protection Added
Added test `USER DATA RESET [14]` to `test/user-data-reset.test.ts` asserting:
1. `audit_logs.details JSONB` column is explicitly created by migration DDL.
2. `reset_user_data` queries and writes `details JSONB` correctly.

---

## 5. Production Database Result

### Schema State Comparison
| Column Name | Live Database (Before Fix) | Target Schema (After Migration) |
|---|---|---|
| `public.audit_logs.id` | `UUID` (PK) | `UUID` (PK) |
| `public.audit_logs.user_id` | `UUID` | `UUID` |
| `public.audit_logs.action` | `TEXT` | `TEXT` |
| `public.audit_logs.entity_type` | `TEXT` | `TEXT` |
| `public.audit_logs.entity_id` | `UUID` | `UUID` |
| `public.audit_logs.details` | **MISSING (42703)** | **`JSONB` (Present)** |
| `public.audit_logs.timestamp` | `TIMESTAMPTZ` | `TIMESTAMPTZ` |

---

## 6. Security Impact

1. **Multi-Tenant Isolation:** Preserved 100%. `audit_logs` RLS policy `"Users can view own audit logs"` restricts visibility strictly to `auth.uid() = user_id`.
2. **Zero Financial Mutation:** Applying `ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB;` and stored procedure definitions modifies zero user financial records, balances, or transactions.
3. **No Credential Exposure:** Reset audit records write strictly non-sensitive telemetry (`reset_id`, `timestamp`, `total_records_purged`).

---

## 7. Reset Workflow Verification

### Verified:
- Pre-flight validation, rate limiting, and exact confirmation phrase matching (`'RESET MY DATA'`).
- `anon` caller rejection (`Authentication Required: Anonymous callers cannot reset user data`).
- Preview calculation RPC (`preview_user_data_reset`) structure.
- TypeScript alignment in `src/types/database.ts` (`details: Json | null`).

### Deliberately NOT Executed:
- Destructive reset purge was **NOT executed** on any live production user account.

---

## 8. Regression Tests

Executed: `npm run test:user-reset`
```
✔ FINAL GATE [01-25]: Comprehensive 25-Point Security & Tenant Isolation Gate (9.98ms)
✔ USER DATA RESET [01]: Preview RPC calculates accurate counts across all 35 tables (1.87ms)
✔ USER DATA RESET [02]: Unauthenticated caller cannot preview or execute reset (0.33ms)
✔ USER DATA RESET [03]: Confirmation phrase requires exact case-sensitive match "RESET MY DATA" (1.14ms)
✔ USER DATA RESET [04]: Multi-tenant isolation — User A reset purges 100% of User A data and leaves User B 100% intact (1.32ms)
✔ USER DATA RESET [05]: Client-side reset routine clears NisFlow keys and preserves Supabase auth tokens (0.97ms)
✔ USER DATA RESET [06]: AI Capability Registry defines reset_financial_data as L4_HIGH_RISK_DESTRUCTIVE (0.38ms)
✔ USER DATA RESET [07]: AI cannot execute reset autonomously and directs user to Settings (1.96ms)
✔ USER DATA RESET [08]: Post-reset recreation — user can immediately create accounts and post transactions after reset (0.98ms)
✔ USER DATA RESET [09]: Migration 011 SQL syntax and security definitions validation (0.81ms)
✔ USER DATA RESET [10]: Direct DELETE on journal_lines/journal_entries is strictly blocked outside reset function (1.30ms)
✔ USER DATA RESET [11]: Repeated reset on already clean user is idempotent and succeeds safely (0.86ms)
✔ USER DATA RESET [12]: Audit trail records only non-sensitive event metadata (no financial data or credentials) (0.66ms)
✔ USER DATA RESET [13]: Prompt injection cannot bypass UI confirmation barrier (0.74ms)
✔ USER DATA RESET [14]: Schema Definition Invariant — audit_logs table explicitly specifies details JSONB column (1.86ms)
```
**Result: 15/15 tests passed (0 failures).**

---

## 9. Final Verification

| Verification Gate | Result | Details |
|---|---|---|
| **Full Test Suite** | **PASS** | 419 / 419 tests passed across 37 test files (3043ms) |
| **Security Test Suite** | **PASS** | 38 / 38 tests passed in `npm run test:security` (411ms) |
| **TypeScript Compilation** | **PASS** | `npx tsc --noEmit` completed with 0 errors |
| **ESLint** | **PASS** | `npm run lint` completed with 0 errors |
| **Production Build** | **PASS** | `next build` compiled all 31 routes successfully in 2.4s (Turbopack) |
| **Dependency Audit** | **PASS** | `npm audit` reported 0 vulnerabilities |

---

## 10. Deployment Status

- **Repository Codebase:** 100% aligned, hardened, and verified.
- **Production Migration SQL Script:** Prepared at [`supabase/APPLY_MIGRATIONS_012_013.sql`](file:///L:/PRATHAM/PROJECTS/NISFLOW%20FINANCE/supabase/APPLY_MIGRATIONS_012_013.sql).

---

## 11. Exact Remaining Action

To complete the schema hotfix on your live Supabase project:
1. Open the [Supabase Project Dashboard SQL Editor](https://supabase.com/dashboard/project/qyjhicibrciqcznsdevk/sql/new).
2. Copy and paste the entire contents of [`supabase/APPLY_MIGRATIONS_012_013.sql`](file:///L:/PRATHAM/PROJECTS/NISFLOW%20FINANCE/supabase/APPLY_MIGRATIONS_012_013.sql).
3. Click **Run**.

Once executed, `public.audit_logs.details JSONB` will be present, the idempotent `reset_user_data` RPC will be active, and the reset smoke test is completely safe to retry.
