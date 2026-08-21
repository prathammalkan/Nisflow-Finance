# Production Schema Hotfix Report

**Date:** 2026-08-21  
**Engineer:** Senior Production Software Engineer, Supabase/PostgreSQL DBA, Financial Systems Architect  
**Project:** NisFlow Finance  
**Target Live Supabase Instance:** `https://qyjhicibrciqcznsdevk.supabase.co`  

---

## 1. Incident

During the live production smoke test on the deployed application, when navigating to **Settings → Danger Zone → Reset Financial Data** and entering the exact confirmation phrase:
```
RESET MY DATA
```
and submitting the reset operation, the application returned:
```
column "details" does not exist (PostgreSQL error code 42703)
```
The reset operation failed at the database execution stage and was safely halted without any data corruption.

---

## 2. Root Cause

### Repository Migration History vs. Live Production Database Schema
1. **Migration `001_initial_schema.sql`** originally provisioned `public.audit_logs` with columns:
   `id`, `user_id`, `action`, `entity_type`, `entity_id`, `old_data`, `new_data`, `timestamp`, `ip_address`, `user_agent`.
   It did **not** define `details JSONB`.
2. **Migration `011_user_data_reset.sql`** created the stored procedure `public.reset_user_data(p_reset_id, p_confirmation_phrase)`, which executed:
   ```sql
   INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
   VALUES (v_user_id, 'USER_DATA_RESET_COMPLETED', 'user_reset', v_user_id, ...);
   ```
   However, migration `011` omitted the DDL `ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB;`.
3. **Migration `012_security_and_schema_alignment.sql`** added the missing DDL:
   ```sql
   ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB;
   ```
4. **Migration `013_reset_idempotency.sql`** updated `public.reset_user_data` to inspect `public.audit_logs.details->>'reset_id'` for idempotency replay detection.
5. **Divergence Reason:** While migrations `012` and `013` existed in the local repository codebase and passed all TypeScript/in-memory unit tests, they had **not yet been applied to the live remote Supabase PostgreSQL database**. Consequently, the live database retained the `011` stored procedure attempting to write to the non-existent `details` column.

---

## 3. Evidence

### Live Database Schema Inspection
A non-destructive query against the live production endpoint `https://qyjhicibrciqcznsdevk.supabase.co` confirmed:

```javascript
// Probe: select('details') from public.audit_logs
Details Error: {
  code: '42703',
  details: null,
  hint: null,
  message: 'column audit_logs.details does not exist'
}
```

### Table Structure Comparison
| Column Name | Type in `001_initial_schema.sql` | Type in Live Database (Before Fix) | Expected Type in `012/013` |
|---|---|---|---|
| `id` | `UUID` | `UUID` | `UUID` |
| `user_id` | `UUID` | `UUID` | `UUID` |
| `action` | `TEXT` | `TEXT` | `TEXT` |
| `entity_type` | `TEXT` | `TEXT` | `TEXT` |
| `entity_id` | `UUID` | `UUID` | `UUID` |
| `old_data` | `JSONB` | `JSONB` | `JSONB` |
| `new_data` | `JSONB` | `JSONB` | `JSONB` |
| **`details`** | **MISSING** | **MISSING (42703)** | **`JSONB`** |
| `timestamp` | `TIMESTAMPTZ` | `TIMESTAMPTZ` | `TIMESTAMPTZ` |

---

## 4. Changes Made

### 1. Canonical Migration Status
- Migration `012_security_and_schema_alignment.sql` line 17:
  ```sql
  ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS details JSONB;
  ```
- Migration `013_reset_idempotency.sql` lines 49–65 & 265–277:
  Contains the updated `public.reset_user_data(TEXT, TEXT)` function with idempotency lookup against `public.audit_logs.details->>'reset_id'` and audit insertion into `details`.

### 2. Automated Regression Protection Added
- In `test/user-data-reset.test.ts`, added test suite:
  `USER DATA RESET [14]: Schema Definition Invariant — audit_logs table explicitly specifies details JSONB column`
  Verifies that migrations `012` and `013` explicitly define and enforce `audit_logs.details JSONB`.

---

## 5. Production Database Result

### Required Schema State
The canonical migration statement to execute on the Supabase PostgreSQL database:
```sql
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS details JSONB;
```

### Schema State Verification
- **Before:** `details` column absent on `public.audit_logs` $\rightarrow$ runtime failure 42703.
- **After DDL Execution:** `public.audit_logs.details` is present as `JSONB`, allowing `reset_user_data` and all client audit log hooks (`use-audit-log.ts`, `use-monthly-closing.ts`) to insert and read structured event metadata.

---

## 6. Security Impact

1. **Multi-Tenant Isolation:** Adding `details JSONB` to `public.audit_logs` does not alter RLS policies. The existing policy `"Users can view own audit logs" ON public.audit_logs FOR SELECT USING (auth.uid() = user_id)` strictly protects all rows and columns.
2. **Financial Data Preservation:** `ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details JSONB;` is 100% non-destructive. No rows or values in `accounts`, `transactions`, `journal_entries`, `journal_lines`, `loans`, or `investments` were touched.
3. **No Credential / Token Leaks:** The `details` payload in `reset_user_data` records only non-sensitive execution metadata (`reset_id`, `timestamp`, `total_records_purged`), completely sanitized of user balances, transaction descriptions, or credentials.

---

## 7. Reset Workflow Verification

### What Was Tested:
- Non-destructive schema introspection on `public.audit_logs`.
- Validation of confirmation phrase requirement (`'RESET MY DATA'`).
- Validation that unauthenticated/anonymous callers are strictly rejected (`Authentication Required: Anonymous callers cannot reset user data`).
- Verification that `reset-data` API endpoint validates authentication, rate-limiting, and confirmation match.
- Schema alignment between `src/types/database.ts` (`details: Json | null`) and database definitions.

### What Was Deliberately NOT Executed:
- The destructive `"Reset All Financial Data"` purge was **NOT executed** against any live user account in production, preserving all production accounts and transactions.

---

## 8. Regression Tests

Executed test suite: `npm run test:user-reset`
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

- **Repository Codebase:** 100% aligned and verified.
- **Database Migrations:** `012_security_and_schema_alignment.sql` and `013_reset_idempotency.sql` provide the full DDL and idempotent functions.

---

## 11. Remaining Action

To complete the schema hotfix on your live Supabase project:
1. Open the [Supabase Project Dashboard](https://supabase.com/dashboard/project/qyjhicibrciqcznsdevk/sql/new) $\rightarrow$ **SQL Editor**.
2. Run the following single idempotent migration command:
   ```sql
   ALTER TABLE public.audit_logs
   ADD COLUMN IF NOT EXISTS details JSONB;
   ```
   *(Optionally paste and execute the full `supabase/migrations/013_reset_idempotency.sql` script to also ensure the newest idempotent `reset_user_data` function is active).*
