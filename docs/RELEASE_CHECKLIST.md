# NisFlow Finance — Release Checklist

## Pre-Release Gate (MUST ALL PASS)

### Build
- [x] npm run build → exit 0, no TypeScript errors
- [x] npm run lint → 0 errors
- [x] npm test → 570/570 pass, 0 failures

### Security
- [x] .env.local NOT committed (gitignored, zero git history)
- [x] No service-role key exposed client-side
- [x] CRON_SECRET in env, timing-safe comparison
- [x] CSP excludes unsafe-eval in production
- [x] X-Frame-Options: DENY
- [x] HSTS configured (2 years)
- [x] All API routes require authentication (middleware + route-level)

### Database
- [x] All 19 RPCs verified present on live DB
- [x] RLS enabled + FORCE ROW LEVEL SECURITY on all tables
- [x] journal_lines immutability trigger active
- [x] Double-entry CHECK constraint active
- [x] Admin bootstrap guard active (migration 025)

### Schema Alignment (Fixed in this release)
- [x] recurring_transactions: next_due_date (not next_date)
- [x] transaction_categories: correct table for category FK joins (7 locations fixed)
- [x] investments: correct column names (symbol, asset_type, broker, quantity)
- [x] tsconfig: playwright excluded from TS compilation

### Deployment
- [x] Push to main → Vercel auto-deploy triggered
- [ ] Verify Vercel build log shows success
- [ ] Production smoke test (see below)

## Production Smoke Test

### Authentication
- [ ] /login loads without errors
- [ ] Registration flow works
- [ ] Dashboard redirects when unauthenticated
- [ ] Admin panel accessible after bootstrap

### Core Financial Flows
- [ ] Create account → ledger account auto-provisioned
- [ ] Record expense → journal entry posted, balance updated
- [ ] Record income → journal entry posted
- [ ] Transfer between accounts → net worth unchanged
- [ ] AI chat responds (check GEMINI_MODEL=gemini-2.5-flash is set in Vercel env)

### Data Integrity
- [ ] Journal entries appear in ledger audit log
- [ ] Reversal creates linked reversal entry
- [ ] Net worth = Assets - Liabilities (from double-entry)

### Security Headers
- [ ] curl -I https://nisflow-finance.vercel.app shows X-Frame-Options: DENY
- [ ] Content-Security-Policy header present
- [ ] Strict-Transport-Security present

## Post-Release Monitoring

### Watch For (First 24h)
- 503 errors from AI endpoints (check GEMINI_MODEL env var in Vercel)
- RLS permission errors on new account creation
- Recurring transaction cron failures (check CRON_SECRET in Vercel)

### Vercel Environment Variables to Verify
Ensure these are set in Vercel dashboard (Settings → Environment Variables):
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- SUPABASE_SECRET_KEY
- GOOGLE_GENERATIVE_AI_API_KEY
- GEMINI_MODEL=gemini-2.5-flash  ← CRITICAL: was broken, now fixed
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
- CRON_SECRET
- NEXT_PUBLIC_VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY

## Known Remaining Items (v2 Milestones)

### High Priority
- Bank Registry: Indian bank-specific rules, IFSC lookup, account type guidance
- UPI Engine: UPI limits per bank, daily/monthly limits, merchant category codes
- Tax Engine: Versioned rules by FY, AIS/TIS reconciliation architecture
- Account Purpose Advisor: Guidance engine for optimal account usage

### Medium Priority  
- Financial Risk Monitor: Anomaly detection, spending pattern alerts
- Evidence Engine: Document hash verification, retention tracking
- Audit Preparation: Compliance report generation, ITR schedule mapping

### Low Priority
- AIS/TIS Government Data Reconciliation
- XBRL/e-Filing integration hooks
