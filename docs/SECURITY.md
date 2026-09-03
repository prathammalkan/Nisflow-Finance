# NisFlow Finance — Security Reference

## Defense-in-Depth Model

Security is applied at 4 independent layers. Bypass of any one layer is NOT sufficient to compromise data.

### Layer 1: Network / Edge
- Next.js Middleware intercepts ALL requests
- Unauthenticated requests to /api/* → 401 JSON (no redirect, no HTML leakage)
- Unauthenticated requests to web routes → redirect to /login
- Content Security Policy enforced via HTTP headers on all responses
- HSTS with 2-year max-age, includeSubDomains, preload
- X-Frame-Options: DENY (clickjacking prevention)
- X-Content-Type-Options: nosniff

### Layer 2: Application
- Every API route and server action calls supabase.auth.getUser() independently
- All financial mutations return structured errors — no raw DB errors exposed
- AI actions require explicit user confirmation (proposal → confirm flow)
- Rate limiting on all AI endpoints (Upstash Redis, fails closed to 503)
- CRON secret validated with crypto.timingSafeEqual (timing attack resistant)
- 50KB request body limit on chat endpoint
- Zod schema validation on all AI chat messages (max 20 msgs, 2000 chars each)

### Layer 3: Database (RLS)
- FORCE ROW LEVEL SECURITY on all 36+ tables
- All SELECT/INSERT/UPDATE/DELETE policies enforce: auth.uid() = user_id
- Additional approval gate: is_user_approved(auth.uid()) = true
- Admin tables: additional is_app_admin() check
- Direct INSERT on journal_entries, journal_lines, ledger_audit_log is REVOKED
  (all ledger mutations MUST go through SECURITY DEFINER RPCs)

### Layer 4: Financial Integrity
- journal_lines: immutable via PostgreSQL trigger (UPDATE/DELETE blocked)
- journal_entries: status-only updates allowed (posted → reversed only)
- Double-entry enforced: CHECK(total_debit = total_credit) at DB level
- Idempotency keys: duplicate journal entries rejected at DB level
- Reversal-only correction: no overwrite of financial history ever

## RPC Authorization Pattern (All SECURITY DEFINER functions)

Every RPC follows this guard pattern:
1. Validate auth.role() = 'authenticated' (rejects anonymous)
2. Validate auth.uid() = p_user_id parameter (prevents actor spoofing)
3. Validate target entity ownership (is_user_approved, entity.user_id = caller)
4. search_path locked to 'public, extensions' (prevents search path hijacking)

## Credential Storage
- .env.local: gitignored (listed in .gitignore, zero git history)
- Supabase service-role key: only used in createAdminClient(), only called from recurring CRON route
- CRON_SECRET: timing-safe comparison only, never logged
- All other keys: restricted to server-side API routes only

## AI Security Guardrails
- System prompt non-disclosure rule embedded in every request
- User data embedded in XML boundary <user_financial_data>...</user_financial_data>
- XML injection prevented via escapeForPrompt() (HTML entity encoding)
- Database UUIDs NOT exposed to LLM (index-based for categorize endpoint)
- AI cannot autonomously execute L4 (destructive) operations
- All AI financial actions validated server-side before execution
- Prompt injection test suite: 6 test cases in test/security/

## Storage Security
- Bucket: private (public = false)
- Path format: {user_id}/{filename} (enforced by RLS policy)
- Access: signed URLs only, 300s TTL
- Upload limits: 10MB max, PDF/PNG/JPEG/WEBP only
- CSV import: ExcelJS strips formula execution; DDE disarmed via sanitizeImportText()

## Audit Trail
- ledger_audit_log: SHA-256 hash of payload for tamper detection
- audit_logs: user action log (entity, changes, IP)
- Monthly closings: locked state prevents retroactive modification
- All journal entries: immutable with reversal chain for corrections
