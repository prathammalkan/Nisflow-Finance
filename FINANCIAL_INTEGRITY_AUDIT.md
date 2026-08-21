# NISFLOW FINANCE — FINANCIAL INTEGRITY & DOUBLE-ENTRY LEDGER AUDIT

**Date:** 2026-08-20  
**Auditor:** Financial Systems Engineer & Database Architect  
**Scope:** Double-Entry Invariants, Ledger Immutability, Reversal Mechanics, Precision Arithmetic, Schema Consistency, and Reconciliation.

---

## 1. Double-Entry Accounting Invariants

NisFlow Finance models all financial movements through a strict double-entry ledger foundation (`007_double_entry_ledger.sql`):
- **Fundamental Invariant**: $\sum \text{Debits} = \sum \text{Credits}$ enforced both client-side via Decimal.js and inside the `post_journal_entry` PostgreSQL RPC.
- **Positive Amounts**: Every journal line enforces `debit_amount >= 0`, `credit_amount >= 0`, and `(debit_amount > 0 OR credit_amount > 0)`.
- **Chart of Accounts**: Standard account categories (`asset`, `liability`, `equity`, `income`, `expense`).
- **Normal Balances**:
  - Assets & Expenses: $\text{Balance} = \sum \text{Debits} - \sum \text{Credits}$
  - Liabilities, Equity & Income: $\text{Balance} = \sum \text{Credits} - \sum \text{Debits}$

---

## 2. Immutability & Audit Trail

- **PostgreSQL Triggers**:
  - `trg_journal_line_immutability`: Blocks `UPDATE` and `DELETE` on `public.journal_lines`.
  - `trg_journal_entry_immutability`: Blocks `UPDATE` (except status transition from `'posted'` to `'reversed'`) and `DELETE` on `public.journal_entries`.
- **Cryptographic Audit Trail**:
  - `ledger_audit_log` records SHA-256 hashes of transaction payloads via `pgcrypto`.
- **Reversals**:
  - Implemented via `post_reversal_entry` which creates symmetric inverse journal lines and marks original entries as `'reversed'`. Double-reversals are rejected at the database level.

---

## 3. Balance Projections vs Authoritative Ledger

- **Authoritative Balance Source**: `journal_lines` aggregated by `ledger_account_id`.
- **Cached Projections**: `accounts.current_balance` is updated synchronously by `post_journal_entry` and `post_reversal_entry`.
- **Reconciliation Engine**: `reconcile_ledger_balances(p_user_id)` continuously compares cached balances against derived ledger balances, reporting any discrepancies.

---

## 4. Key Financial Integrity Findings

### 4.1 [P1 - High] Balance Field Inconsistency in Accounts Overview
- **File:** `src/app/(dashboard)/accounts/page.tsx` (Line 29)
- **Finding:** Calculates total net worth using `account.balance` while cards render `account.current_balance`.
- **Fix:** Standardize on `account.current_balance ?? account.balance ?? 0` or derive directly from ledger balance RPC.

### 4.2 [P2 - Medium] Legacy Transactions Link to Double-Entry Ledger
- **File:** `src/lib/ledger/service.ts` & `src/lib/hooks/use-transactions.ts`
- **Finding:** The linkage between legacy `transactions` table rows and `journal_entries` is stored as `[Ledger: <uuid>]` inside the `notes` column. If a user edits notes, this regex link is broken, preventing automated reversal on transaction deletion.
- **Fix:** Add a dedicated column `transactions.journal_entry_id UUID REFERENCES journal_entries(id)`.

### 4.3 [P2 - Medium] Loan Balance Query Reversal Netting
- **File:** `src/lib/ledger/loans.ts` (Line 296)
- **Finding:** `getLoanAuthoritativeBalance` filters `journal_entries.status = 'posted'`. When an entry is reversed, its status becomes `'reversed'` while the reversal entry is `'posted'`. Excluding the original entry causes loan balance distortion.
- **Fix:** Include both `'posted'` and `'reversed'` entries so the debit and credit lines cancel symmetrically to zero.

---

## 5. Precision & Currency Handling

- **Decimal.js**: Configured with `precision: 28, rounding: Decimal.ROUND_HALF_UP`.
- **Currency Formatter**: `formatINR` in `src/lib/finance/money.ts` cleanly formats Indian Rupee numbers (Lakhs and Crores grouping: `12,34,567.89`).
- **Rounding Strategy**: Sub-paise values are rounded to 2 decimal places at transaction boundary before ledger posting.
