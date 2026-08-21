# NISFLOW FINANCE — MASTER FORENSIC SECURITY AUDIT

**Date:** 2026-08-20  
**Auditor:** Application Security & Cloud Architecture Team  
**Scope:** Authentication, Multi-Tenancy RLS, Stored Procedures, Supabase Storage, API Routes, AI Boundary Enforcement, and CSP.

---

## 1. Executive Summary

NisFlow Finance implements strong defensive architecture across authentication, multi-tenancy, rate limiting, and AI capabilities. The double-entry ledger foundations and recent migrations (009, 010, 011) resolve previous high-risk issues including audit log bypass and unauthorized cross-tenant RPC execution. 

A thorough line-by-line audit revealed one remaining P1 authorization gap in `get_ledger_account_balance`, parameter validation needs in `post_journal_entry`, and a schema mismatch in `audit_logs.details`.

---

## 2. Multi-Tenancy & Row-Level Security (RLS)

All 36 database tables across migrations 001–011 have RLS enabled:
- **Direct Tenant Tables (`auth.uid() = user_id`)**: `profiles`, `accounts`, `counterparties`, `ipos`, `investments`, `transactions`, `tags`, `transfers`, `receivables`, `payables`, `loans`, `third_party_funds`, `ipo_applications`, `investment_transactions`, `budgets`, `savings_goals`, `documents`, `bank_statements`, `reconciliations`, `monthly_closings`, `audit_logs`, `automation_rules`, `notifications`, `tax_records`, `split_expenses`, `recurring_transactions`, `net_worth_snapshots`, `ledger_accounts`, `journal_entries`, `journal_lines`, `ledger_audit_log`.
- **Junction Tables (`EXISTS` Subquery Isolation)**: `transaction_tags`, `budget_categories`, `bank_statement_transactions`, `split_expense_shares`.
- **System Tables**: `transaction_categories` permits SELECT for `is_system = true OR auth.uid() = user_id`, while mutations require `auth.uid() = user_id`.

---

## 3. Stored Procedure (RPC) Security

| RPC Function | Security Definer | Caller Auth Enforced | Status / Finding |
|---|---|---|---|
| `post_journal_entry` | YES | YES (`auth.uid() = p_user_id`) | **PASS** (Remediated in 010). Note: `p_created_by` should also be validated against `auth.uid()`. |
| `post_reversal_entry` | YES | YES (`auth.uid() = p_user_id`) | **PASS** (Remediated in 010). |
| `reconcile_ledger_balances` | YES | YES (`auth.uid() = p_user_id`) | **PASS** (Remediated in 010). |
| `get_ledger_account_balance` | YES | **NO** | **P1 VULNERABILITY**: BOLA / IDOR allows authenticated callers to query balance of other tenants' `ledger_account_id`. |
| `preview_user_data_reset` | YES | YES (`auth.uid()` directly) | **PASS** (Migration 011). |
| `reset_user_data` | YES | YES (`auth.uid()` directly) | **PASS** (Migration 011). Requires `'RESET MY DATA'`. |

---

## 4. Storage Security (`documents` bucket)

- **Access Level**: Private bucket (`public = false`).
- **File Size Limit**: 10MB max per document.
- **Allowed MIME Types**: PDF, PNG, JPG, JPEG, WEBP, CSV, XLSX, XLS.
- **RLS Policy**: Path prefix strictly enforced: `(auth.uid())::text = (storage.foldername(name))[1]`.
- **URL Expiry**: Signed URLs generated with 300s TTL.
- **Atomic Cleanup**: Storage deletion rollback on failed metadata creation.

---

## 5. API Routes & Attack Defense

- **`src/app/api/chat/route.ts`**: Requires valid user session via `getUser()`. Rate limited (20 req/min via Upstash Redis). Sanitizes inputs and caps message history to 20 messages.
- **`src/app/api/recurring/execute/route.ts`**: Timing-safe authorization check using `crypto.timingSafeEqual` over `CRON_SECRET` buffers.
- **`src/app/api/account/reset-data/route.ts`**: Multi-stage lifecycle (`PREPARING` -> `DATABASE_PURGING` -> `STORAGE_PURGING` -> `VERIFYING` -> `COMPLETED`). Rate-limited to 5 requests per 10 minutes.

---

## 6. AI Capability Layer & Safety

- **Authority Matrix**: Strictly demarcated into L0 (Read), L1 (Prepare), L2 (Non-Financial Mutation), L3 (Financial Posting), and L4 (High-Risk Destructive).
- **Confirmation Gates**: All L3 and L4 operations require interactive user confirmation cards before execution.
- **Tenant Boundaries**: `entity-resolution.ts` filters every query with `user_id = userId` and throws `SECURITY_VIOLATION` if cross-tenant IDs are supplied.

---

## 7. Security Headers & CSP

- `next.config.ts` configures:
  - `Content-Security-Policy`: Disallows `unsafe-eval` in production, sets `frame-ancestors 'none'`, and whitelists only necessary API endpoints.
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security`: `max-age=63072000; includeSubDomains; preload`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`: Restricts camera, microphone, and geolocation.
