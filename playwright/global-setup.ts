import { chromium, FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USER_EMAIL = process.env.TEST_USER_EMAIL || 'e2e-test-user@nisflow.test';
const USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'E2eTestPassword!2026';

/**
 * NisFlow Finance — Playwright Global Setup
 *
 * Signs in the E2E test user via the Supabase API directly (no browser UI),
 * extracts the session tokens, injects them as cookies into a Playwright
 * browser context, then saves the storage state so all authenticated tests
 * can load it instantly.
 */
async function globalSetup(config: FullConfig) {
  // Reuse auth state if less than 23 hours old
  if (fs.existsSync(AUTH_FILE)) {
    const ageMins = (Date.now() - fs.statSync(AUTH_FILE).mtimeMs) / 60000;
    if (ageMins < 23 * 60) {
      console.log(`[globalSetup] Reusing auth state (${Math.round(ageMins)}min old)`);
      return;
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('[globalSetup] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in environment');
  }

  const sb = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── Step 1: Sign in ────────────────────────────────────────────────────────
  console.log('[globalSetup] Signing in test user via API...');
  let { data, error } = await sb.auth.signInWithPassword({
    email: USER_EMAIL,
    password: USER_PASSWORD,
  });

  // ── Step 2: If sign-in failed, try signing up (first run) ─────────────────
  if (error || !data.session) {
    console.log(`[globalSetup] Sign-in failed (${error?.message}), attempting sign-up...`);
    const signup = await sb.auth.signUp({
      email: USER_EMAIL,
      password: USER_PASSWORD,
      options: { data: { full_name: 'E2E Test User' } },
    });
    if (signup.error || !signup.data.session) {
      throw new Error(
        `[globalSetup] Sign-up failed: ${signup.error?.message || 'no session returned'}. ` +
        `Apply supabase/migrations/027_fix_handle_new_user_resilience.sql in Supabase Dashboard first.`
      );
    }
    data = signup.data as typeof data;
    console.log('[globalSetup] Test user registered successfully.');
  }

  const session = data.session!;
  console.log(`[globalSetup] Signed in as ${data.user?.email}`);

  // ── Step 3: Inject session into Playwright browser context ────────────────
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;

  // @supabase/ssr stores the session as a JSON string chunked across cookies.
  // Inject the full session JSON so the SSR client can read it.
  const sessionJson = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  // Navigate to the app first so cookies are set on the right origin
  await page.goto(`${BASE_URL}/login`);

  // Set the Supabase auth cookie via evaluate (works for both cookie formats)
  await page.evaluate(
    ({ name, value }: { name: string; value: string }) => {
      document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
      // Also set in localStorage as fallback
      try { localStorage.setItem(name, value); } catch {}
    },
    { name: cookieName, value: sessionJson }
  );

  // Also set via context.addCookies for SSR cookie reads
  await context.addCookies([
    {
      name: cookieName,
      value: encodeURIComponent(sessionJson),
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  // ── Step 4: Verify dashboard is reachable ─────────────────────────────────
  console.log('[globalSetup] Verifying dashboard access...');
  await page.goto(`${BASE_URL}/dashboard`);

  try {
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    console.log('[globalSetup] Dashboard reached — auth state is valid.');
  } catch {
    // Cookie injection didn't work — fall back to UI login
    console.log('[globalSetup] Cookie injection failed, falling back to UI login...');
    await page.goto(`${BASE_URL}/login`);
    await page.getByLabel(/email/i).fill(USER_EMAIL);
    await page.locator('#password').fill(USER_PASSWORD);
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 30000 });
    console.log('[globalSetup] UI login succeeded.');
  }

  // ── Step 5: Save storage state ────────────────────────────────────────────
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await context.storageState({ path: AUTH_FILE });
  await browser.close();
  console.log(`[globalSetup] Auth state saved → ${AUTH_FILE}`);
}

export default globalSetup;
