import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load env
try {
  (process as any).loadEnvFile(path.join(process.cwd(), '.env.local'));
} catch {
  // Ignore if already loaded
}

const PROD_URL = 'https://nisflow-finance.vercel.app';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runProductionChecks() {
  console.log('=== STARTING PRODUCTION DEPLOYMENT & HTTP SMOKE VERIFICATION ===');
  console.log(`Target: ${PROD_URL}`);

  let failures = 0;
  const assert = (condition: boolean, msg: string) => {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
    } else {
      console.error(`  [FAIL] ${msg}`);
      failures++;
    }
  };

  // ── 1. HTTP Smoke Tests ───────────────────────────────────────────────────
  console.log('\n--- 1. HTTP Route Smoke Tests (Unauthenticated) ---');
  const publicRoutes = ['/', '/login', '/register', '/privacy', '/terms'];
  for (const route of publicRoutes) {
    const res = await fetch(`${PROD_URL}${route}`, { redirect: 'manual' });
    const isSuccess = res.status === 200 || (route === '/' && [200, 307, 308].includes(res.status));
    assert(isSuccess, `GET ${route} returned HTTP ${res.status}`);
    
    if (res.status === 200) {
      const html = await res.text();
      assert(!html.includes('http://localhost'), `GET ${route} does not contain localhost URLs`);
      assert(!html.includes('webpack-internal://'), `GET ${route} does not contain webpack-internal URLs`);
      assert(!html.includes('__NEXT_DATA_DEBUG'), `GET ${route} has no debug data`);
    }
  }

  const protectedRoutes = ['/dashboard', '/accounts', '/transactions', '/settings', '/admin'];
  for (const route of protectedRoutes) {
    const res = await fetch(`${PROD_URL}${route}`, { redirect: 'manual' });
    const location = res.headers.get('location') || '';
    const redirectsToLogin = (res.status === 307 || res.status === 308 || res.status === 302) && location.includes('/login');
    assert(redirectsToLogin, `GET ${route} redirects to /login (status ${res.status}, location: ${location})`);
  }

  // ── 2. Security Headers on Production ───────────────────────────────────────
  console.log('\n--- 2. Security Headers & CSP ---');
  const headRes = await fetch(`${PROD_URL}/login`, { method: 'HEAD' });
  const csp = headRes.headers.get('content-security-policy') || '';
  const xfo = headRes.headers.get('x-frame-options');
  const xcto = headRes.headers.get('x-content-type-options');
  const hsts = headRes.headers.get('strict-transport-security');
  const server = headRes.headers.get('server');

  assert(server?.toLowerCase().includes('vercel'), `Served by Vercel (server: ${server})`);
  assert(xfo === 'DENY', `X-Frame-Options is DENY (${xfo})`);
  assert(xcto === 'nosniff', `X-Content-Type-Options is nosniff (${xcto})`);
  assert(!!hsts && hsts.includes('max-age='), `Strict-Transport-Security is present (${hsts})`);
  assert(csp.includes("frame-ancestors 'none'"), `CSP includes frame-ancestors 'none'`);

  // ── 3. Production Account Deletion API & Edge Protections ─────────────────────
  console.log('\n--- 3. Production Account Deletion API Guardrails ---');
  const getDel = await fetch(`${PROD_URL}/api/account/delete`, { method: 'GET' });
  assert(getDel.status === 405, `GET /api/account/delete returns 405 Method Not Allowed (${getDel.status})`);

  const unauthPostDel = await fetch(`${PROD_URL}/api/account/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmationPhrase: 'DELETE MY ACCOUNT' }),
  });
  assert(unauthPostDel.status === 401, `POST /api/account/delete unauthenticated returns 401 Unauthorized (${unauthPostDel.status})`);

  // ── 4. Disposable Test Account Lifecycle & Permanent Deletion on Production ─
  console.log('\n--- 4. Disposable Test Account Lifecycle & Destruction on Production ---');
  const sbClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const testEmail = `prod-audit-${Date.now()}@nisflow.test`;
  const testPassword = `AuditPass!2026_${Math.random().toString(36).substring(7)}`;

  console.log(`  Creating disposable test user: ${testEmail}`);
  const { data: signupData, error: signupErr } = await sbClient.auth.signUp({
    email: testEmail,
    password: testPassword,
    options: { data: { full_name: 'Production Audit User' } },
  });

  if (signupErr || !signupData.session) {
    console.error('  Failed to sign up disposable test account:', signupErr);
    assert(false, `Disposable test user registration succeeded`);
  } else {
    assert(true, `Disposable test user registered and session obtained`);
    const session = signupData.session;
    const userId = session.user.id;

    // Call production API with wrong confirmation phrase
    const wrongPhraseRes = await fetch(`${PROD_URL}/api/account/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ confirmationPhrase: 'WRONG PHRASE' }),
    });
    assert(wrongPhraseRes.status === 400, `POST /api/account/delete with invalid phrase returns 400 (${wrongPhraseRes.status})`);

    // Call production API with exact phrase 'DELETE MY ACCOUNT'
    console.log('  Triggering permanent account deletion on production endpoint...');
    const deleteRes = await fetch(`${PROD_URL}/api/account/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ confirmationPhrase: 'DELETE MY ACCOUNT' }),
    });

    assert(deleteRes.status === 200, `POST /api/account/delete with exact confirmation phrase returns 200 (${deleteRes.status})`);
    const delBody = await deleteRes.json().catch(() => ({}));
    assert(delBody.success === true, `Response body contains success: true (${JSON.stringify(delBody)})`);

    // Verify session token is invalidated / user identity deleted
    const { data: postDelUserData, error: postDelUserErr } = await sbClient.auth.getUser(session.access_token);
    assert(!postDelUserData?.user || !!postDelUserErr, `Deleted user session token is rejected or user not found (${postDelUserErr?.message || 'User null'})`);

    // Verify via Supabase Admin Client that user identity was completely removed
    if (SUPABASE_SERVICE_ROLE_KEY) {
      const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: adminCheck, error: adminCheckErr } = await adminClient.auth.admin.getUserById(userId);
      assert(!adminCheck?.user || !!adminCheckErr, `Admin API confirms user identity deleted from auth.users`);
    }
  }

  // ── 5. Legal Policy Content Verification ─────────────────────────────────
  console.log('\n--- 5. Legal Policy Text Verification on Production ---');
  const privacyHtml = await (await fetch(`${PROD_URL}/privacy`)).text();
  assert(privacyHtml.includes('PostgreSQL') || privacyHtml.includes('Supabase'), `Privacy Policy mentions Supabase/PostgreSQL`);
  assert(privacyHtml.includes('Row Level Security') || privacyHtml.includes('RLS'), `Privacy Policy mentions Row Level Security`);
  assert(privacyHtml.includes('Gemini') || privacyHtml.includes('Google'), `Privacy Policy mentions Google Gemini`);
  assert(privacyHtml.includes('foundation models') || privacyHtml.includes('training'), `Privacy Policy mentions zero AI model training`);
  assert(privacyHtml.includes('Upstash') || privacyHtml.includes('Rate Limit'), `Privacy Policy mentions Upstash / Rate Limiting`);
  assert(privacyHtml.includes('Permanent Account Deletion') || privacyHtml.includes('Deletion'), `Privacy Policy mentions permanent account deletion`);

  const termsHtml = await (await fetch(`${PROD_URL}/terms`)).text();
  assert(termsHtml.includes('Non-Advisory') || termsHtml.includes('financial advisor'), `Terms contain Non-Advisory / financial advisor disclaimer`);
  assert(termsHtml.includes('Chartered Accountant') || termsHtml.includes('tax'), `Terms contain Chartered Accountant / tax disclaimer`);
  assert(termsHtml.includes('Limitation of Liability'), `Terms contain Limitation of Liability`);

  console.log(`\n=== PRODUCTION VERIFICATION SUMMARY: ${failures === 0 ? 'ALL PASSED' : failures + ' FAILED'} ===`);
  if (failures > 0) process.exit(1);
}

runProductionChecks().catch(err => {
  console.error('Unhandled error during production checks:', err);
  process.exit(1);
});
