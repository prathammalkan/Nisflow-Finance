# NisFlow Finance — Architecture

## Overview

NisFlow Finance is a production-grade personal financial operating system built for the Indian market. It is a multi-tenant, server-rendered Next.js 16 application backed by Supabase/PostgreSQL with an immutable double-entry accounting ledger at its core.

## System Layers

`
Client (Browser/PWA)
  |
Vercel Edge (CDN + Middleware)
  |-- Next.js Middleware: session refresh, API 401 guard
  |
Next.js App Router
  |-- Server Components: Supabase SSR auth
  |-- Client Components: React Query hooks
  |-- API Routes: /api/chat, /api/ai/*, /api/account/*, /api/recurring/*
  |-- Server Actions: ledger-ai.ts, reconciliation.ts
  |
Ledger Service Layer (src/lib/ledger/)
  |-- engine.ts: validate + post RPCs
  |-- service.ts: recordFinancialTransaction (all 14 types)
  |-- people.ts, loans.ts, analytics.ts, ai-orchestrator.ts
  |
Supabase / PostgreSQL
  |-- RLS + FORCE ROW LEVEL SECURITY (36+ tables)
  |-- SECURITY DEFINER RPCs with auth.uid() caller validation
  |-- Immutable journal_lines (trigger-enforced)
  |-- SHA-256 audit log on all ledger events
`

## Core Subsystems

### 1. Double-Entry Ledger
- All financial mutations flow through post_journal_entry RPC (SECURITY DEFINER)
- journal_lines are immutable (UPDATE/DELETE blocked by trigger)
- Reversal-only correction pattern via post_reversal_entry
- Idempotency keys prevent duplicate posting under concurrency/retries
- SHA-256 audit hash on every ledger event in ledger_audit_log
- Client-side pre-validation in validateJournalEntry() before RPC call

### 2. AI Financial Guardian
- Model: Gemini 2.5 Flash via @ai-sdk/google
- All user financial data injected inside <user_financial_data> XML boundary
- escapeForPrompt() sanitizes all user strings before LLM context insertion
- AI proposes [ACTION] blocks — user must confirm before any DB write
- Authority levels L0-L4; L4 (destructive) blocked from AI orchestration
- Rate limiting: 20 chat/60s, 60 categorize/60s, 15 insights/hr per user:IP
- Upstash Redis distributed rate limiter; fails closed to 503 on Redis failure

### 3. Security Architecture
- RLS: All 36+ tables have FORCE ROW LEVEL SECURITY
- User approval gate: All policies check is_user_approved(auth.uid())
- Admin RBAC: is_app_admin() SECURITY DEFINER; bootstrap-once pattern
- Search path lock: All SECURITY DEFINER functions SET search_path = public, extensions
- Middleware: updateSession() enforces auth on all routes; API routes return 401 JSON
- CRON auth: crypto.timingSafeEqual timing-safe comparison on CRON_SECRET
- CSP: Strict policy; unsafe-eval excluded in production; frame-ancestors none
- Storage: Private bucket; tenant-scoped paths; signed URLs only (300s TTL)

### 4. Multi-Tenant Isolation
- Every table has user_id column + RLS policy auth.uid() = user_id
- Defense-in-depth: hooks also scope queries with .eq('user_id', user.id)
- IDOR tests cover all entity types
- Composite unique constraints (user_id, id) on parent tables

### 5. Indian Tax Engine
Tax calculation in src/lib/finance/tax-calculator.ts:
- FY 2025-26 Old Regime: 80C cap Rs1.5L, 80D, NPS, HRA, LTA, 87A, surcharge, 4% cess
- FY 2025-26 New Regime: Budget 2024 slabs, Rs75K standard deduction, 87A up to Rs12L

## Deployment
- Platform: Vercel (region: bom1 - Mumbai)
- Database: Supabase (PostgreSQL 15)
- Rate Limiting: Upstash Redis
- AI Provider: Google Generative AI (Gemini 2.5 Flash)
