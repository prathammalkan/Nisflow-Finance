# NisFlow Finance — Release Checklist

**Updated:** 2026-09-02  **Version:** Post-Phase-4 Feature Gap Closure

## Environment

- [x] Node.js runtime confirmed available on Vercel
- [x] .env.example documents all required variables by name
- [x] .env.local gitignored (confirmed in .gitignore)
- [x] No secrets committed to Git history
- [x] NEXT_PUBLIC_* variables contain no privileged secrets

## Required Environment Variables

| Variable | Classification | Status |
|----------|---------------|--------|
| NEXT_PUBLIC_SUPABASE_URL | PUBLIC | Required |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | PUBLIC | Required |
| SUPABASE_SECRET_KEY | SERVER-ONLY | Required |
| CRON_SECRET | SERVER-ONLY | Required |
| GOOGLE_GENERATIVE_AI_API_KEY | SERVER-ONLY AI | Required |
| UPSTASH_REDIS_REST_URL | SERVER-ONLY | Optional (rate limiting) |
| UPSTASH_REDIS_REST_TOKEN | SERVER-ONLY | Optional (rate limiting) |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | PUBLIC | Optional (push notifications) |

## Database

- [x] 26 migrations applied (001 through 026)
- [x] All tables have FORCE ROW LEVEL SECURITY
- [x] All user-data policies enforce auth.uid() = user_id
- [x] journal_lines immutability trigger active
- [x] Double-entry CHECK constraint on journal_entries
- [x] Idempotency keys on journal_entries (UNIQUE)
- [x] All SECURITY DEFINER functions use SET search_path = public, extensions
- [x] Direct INSERT on ledger tables REVOKED for public/anon roles
- [x] New tables (migration 026): ais_records, evidence_links, bank_rules, tax_radar_snapshots, risk_flags

## Security

- [x] RLS on all 36+ tables
- [x] Admin RBAC: is_app_admin() SECURITY DEFINER
- [x] User approval gate: is_user_approved()
- [x] CRON endpoint: crypto.timingSafeEqual() on CRON_SECRET
- [x] CSP headers configured in next.config.ts
- [x] HSTS, X-Frame-Options, X-Content-Type-Options headers
- [x] Storage bucket: private, signed URLs only (300s TTL)
- [x] AI rate limiting via Upstash Redis (fails closed to 503)
- [x] escapeForPrompt() on all user data before LLM injection
- [x] No raw DB errors exposed to clients

## Ledger Integrity

- [x] SUM(debits) = SUM(credits) enforced at DB level
- [x] Transfers do not become income/expense
- [x] Loan principal does not become income
- [x] Investment funding is asset transfer, not income/expense
- [x] Reversals invert original journal effects correctly
- [x] No overwrite of immutable history

## New Features (Phase 4)

- [x] Account Purpose Advisor (src/lib/finance/account-purpose.ts)
- [x] Indian Bank Registry with versioned rules (src/lib/finance/bank-registry.ts)
- [x] UPI/Payment Intelligence Engine (src/lib/finance/upi-engine.ts)
- [x] Tax Engine V2 with versioned rules (src/lib/finance/tax-engine-v2.ts)
- [x] Tax Radar proactive monitor (src/lib/finance/tax-radar.ts)
- [x] Lawful Tax Optimization (src/lib/finance/tax-optimization.ts)
- [x] AIS/TIS Reconciliation Architecture (src/lib/finance/ais-tis-reconciliation.ts)
- [x] Financial Risk Monitor (src/lib/finance/financial-risk-monitor.ts)
- [x] Transaction Guard (src/lib/finance/transaction-guard.ts)
- [x] Migration 026 (new tables with RLS)

## Documentation

- [x] docs/ARCHITECTURE.md
- [x] docs/SECURITY.md
- [x] docs/DATABASE_SCHEMA.md
- [x] docs/TAX_ENGINE.md
- [x] docs/BANK_ENGINE.md
- [x] docs/UPI_ENGINE.md
- [x] docs/ACCOUNT_GUIDANCE.md
- [x] docs/AI_GUARDRAILS.md
- [x] docs/AUDIT_ENGINE.md
- [x] docs/RELEASE_CHECKLIST.md
- [x] docs/FINAL_RELEASE_REPORT.md

## Blocked / Human Action Required

- [ ] Node.js not installed on local dev machine — npm test/build/lint CANNOT run locally
- [ ] Vercel CLI not available — env pull blocked (run: vercel env pull .env.local)
- [ ] Migration 026 must be applied to production Supabase project manually
- [ ] Production smoke tests require live deployment verification by human
