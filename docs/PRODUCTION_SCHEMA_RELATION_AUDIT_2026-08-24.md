# Production Schema & Relation Audit — 2026-08-24

## Scope

Live Supabase project `qyjhicibrciqcznsdevk` was inspected directly across the `public` schema, including tables, columns, RLS, table privileges, policies, foreign keys, triggers, SECURITY DEFINER RPCs, ledger invariants, and tenant-crossing relations. Repository ledger/AI code and existing forensic reports were also reviewed.

## Production defect reproduced from UI evidence

Account creation failed with:

`permission denied for table ledger_accounts`

Root cause: `authenticated` had RLS policies for `ledger_accounts`, but no table-level INSERT privilege. PostgreSQL checks table grants before RLS; therefore the request failed before the existing owner policy could authorize it.

## Remediation applied

### Migration 019
- Granted `INSERT` on `public.ledger_accounts` to `authenticated`.
- Hardened the ledger-account insert trigger so only authenticated owners can provision their own ledger accounts.
- Added tenant checks for account, loan, investment, and counterparty entity references.
- Explicitly revoked direct INSERT from immutable journal/audit tables.

### Migration 017
- Added tenant-bound `ensure_ledger_account(...)` SECURITY DEFINER RPC.
- Hardened `get_ledger_account_balance(uuid)` with `auth.uid()` ownership enforcement.
- Restricted RPC execution to `authenticated`.

### Migration 020
- Added composite `(user_id,id)` uniqueness to parent entities where needed.
- Added and validated tenant-scoped composite foreign keys for documents, IPO applications, payables, receivables, recurring transactions, third-party funds, tax records, and bank statements.
- Existing production data was checked for cross-tenant mismatches before validation; all checked relations returned zero mismatches.

## Live integrity checks

- Orphan journal lines: **0**.
- Unbalanced journal entries: **0**.
- Checked cross-tenant child/parent relations: **0 mismatches**.
- RLS: enabled and forced on all inspected public tables.
- `ledger_accounts`: authenticated INSERT now explicitly granted; owner trigger remains enforced.
- `journal_entries`, `journal_lines`, `ledger_audit_log`: authenticated direct INSERT remains revoked; financial mutation remains RPC-only.
- Canonical financial RPCs are executable by `authenticated` and not by `anon`.

## Remaining schema drift requiring code-level follow-up

The live database contains both `categories` and `transaction_categories`. `categories` currently contains 0 rows while `transaction_categories` contains 29 system rows. This is legacy schema duplication and should be treated as a compatibility migration target rather than silently deleting either relation.

The checked repository audit history also identified older application-level findings (balance-field duality, legacy transaction-to-journal linkage, UI primitives, etc.). Those are separate from the production `42501` blocker and should be remediated in dedicated code changes with regression coverage.

## Release note

The database-side fix for the screenshot's `42501` failure is applied to production and committed to Git. A fresh authenticated account-creation smoke test should be performed after the current Vercel deployment picks up the migration state.
