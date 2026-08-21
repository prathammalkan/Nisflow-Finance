# NISFLOW FINANCE — MASTER REMEDIATION ROADMAP

**Date:** 2026-08-20  
**Status:** Audit Completed — Awaiting Authorization for Execution  
**Prioritization Framework:** P0 (Critical Security/Data Loss) -> P1 (High Impact / Broken Workflow) -> P2 (Medium Integrity / UX Defect) -> P3 (Low / Polish) -> P4 (Maintenance).

---

## Phase 1: Immediate Critical Security & Database Fixes (P1 & Security)

| Item | Title | File(s) | Est. Complexity |
|---|---|---|---|
| **SEC-003** | Fix BOLA/IDOR in `get_ledger_account_balance` | `supabase/migrations/012_security_and_schema_alignment.sql` | 15 mins |
| **SEC-004** | Enforce `p_created_by = auth.uid()` in `post_journal_entry` | `supabase/migrations/012_security_and_schema_alignment.sql` | 15 mins |
| **DB-001** | Add `details JSONB` to `public.audit_logs` | `supabase/migrations/012_security_and_schema_alignment.sql` | 10 mins |
| **DB-002** | Fix Migration 003 FK reference to `transaction_categories` | `supabase/migrations/003_recurring_transactions.sql` | 5 mins |

---

## Phase 2: High-Impact UI & Financial Integrity Remediations (P1 - P2)

| Item | Title | File(s) | Est. Complexity |
|---|---|---|---|
| **UI-003** | Fix missing Add button in `investments/page.tsx` & `loans/page.tsx` (`actions` prop) | `src/app/(dashboard)/investments/page.tsx`, `loans/page.tsx` | 15 mins |
| **FIN-001** | Standardize `account.current_balance` calculation in Accounts overview | `src/app/(dashboard)/accounts/page.tsx` | 10 mins |
| **AI-002** | Fix stale `holdings` and `loan_amount` queries in AI chat context builder | `src/app/api/chat/route.ts` | 15 mins |
| **FIN-003** | Fix loan balance query reversal netting (`('posted', 'reversed')`) | `src/lib/ledger/loans.ts` | 10 mins |

---

## Phase 3: Design System, Accessibility & Mobile Enhancements (P2 - P3)

| Item | Title | File(s) | Est. Complexity |
|---|---|---|---|
| **UI-001** | Implement `@radix-ui/react-slot` in `src/components/ui/button.tsx` for `asChild` | `src/components/ui/button.tsx` | 10 mins |
| **UI-002** | Replace custom header dropdown with Radix `DropdownMenu` | `src/components/layout/header.tsx` | 20 mins |
| **UI-004** | Migrate `UploadDialog` to standard Radix `Dialog` | `src/components/documents/upload-dialog.tsx` | 20 mins |
| **A11Y-001** | Add `aria-label` to all icon-only buttons | `sidebar.tsx`, `header.tsx` | 15 mins |
| **A11Y-002** | Add `role="tablist"` to `TabsList` | `src/components/ui/tabs.tsx` | 5 mins |
| **MOB-001** | Add mobile search trigger button in header | `src/components/layout/header.tsx` | 15 mins |

---

## Phase 4: Performance & Architecture Modernization (P3 - P4)

| Item | Title | File(s) | Est. Complexity |
|---|---|---|---|
| **PERF-001** | Create batch SQL aggregation for People Ledger summary | `supabase/migrations/012_security_and_schema_alignment.sql`, `use-people.ts` | 30 mins |
| **FIN-002** | Add `journal_entry_id` foreign key column to `transactions` table | `supabase/migrations/012_security_and_schema_alignment.sql`, `service.ts` | 25 mins |
| **CODE-001** | Clean up leftover `console.log` statements in API routes | `src/app/api/chat/route.ts`, `service.ts` | 10 mins |

---

## Verification & Testing Gate Checklist

- [ ] Automated Ledger Balance Invariant Test (`npm run test:ledger` or verification script)
- [ ] Multi-tenant isolation verification across two disposable test users
- [ ] Mobile responsive layout check on 375px viewport (iPhone SE)
- [ ] WCAG 2.1 AA keyboard navigation check across all dialogs
- [ ] Clean build verification (`npm run build`)
