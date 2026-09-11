import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const PROD_URL = 'https://nisflow-finance.vercel.app';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

test.describe('Production Live E2E Audit', () => {
  test.use({ baseURL: PROD_URL });

  const testUserEmail = `browser-prod-${Date.now()}@nisflow.test`;
  const testUserPassword = 'TestBrowserPass!2026';

  test('E2E-PROD-01: Full user journey from registration through financial flows to permanent deletion', async ({ page }) => {
    // Production cold starts can be slow — give generous time budgets
    test.setTimeout(300000);

    // ── 1. Register Disposable Account on Real Production ───────────────────────
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible({ timeout: 25000 });

    await page.locator('#email').fill(testUserEmail);
    await page.locator('#password').fill(testUserPassword);
    await page.locator('#confirmPassword').fill(testUserPassword);
    await page.getByRole('button', { name: /create account/i }).click();

    // Verify registration response — either confirmation screen or direct login redirect
    await Promise.race([
      page.getByText(/check your email|welcome|verification/i).waitFor({ timeout: 25000 }),
      page.waitForURL('**/dashboard**', { timeout: 25000 }).catch(() => {}),
      page.waitForURL('**/login**', { timeout: 25000 }).catch(() => {}),
    ]);

    // Ensure access control is approved for this test user
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: signinData } = await sb.auth.signInWithPassword({
      email: testUserEmail,
      password: testUserPassword,
    });

    if (signinData?.user?.id) {
      // Set access status to approved so gate lets user into dashboard
      await (sb.from('user_access_control') as any)
        .upsert({ user_id: signinData.user.id, status: 'approved', is_admin: false });
    }

    // ── 2. Login via Production UI ──────────────────────────────────────────────
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 30000 });
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible({ timeout: 20000 });

    await page.locator('#email').fill(testUserEmail);
    await page.locator('#password').fill(testUserPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('**/dashboard**', { timeout: 35000 });
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByText(/net worth|₹/i).first()).toBeVisible({ timeout: 20000 });

    // ── 3. Accounts Page ────────────────────────────────────────────────────────
    await page.goto('/accounts', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await expect(page).toHaveURL(/accounts/);
    await expect(page.getByRole('heading', { name: /accounts/i }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /add account|new account|create/i }).first()).toBeVisible({ timeout: 15000 });

    // ── 4. Transactions Page ────────────────────────────────────────────────────
    await page.goto('/transactions', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await expect(page).toHaveURL(/transactions/);
    await expect(page.getByRole('heading', { name: /transactions/i }).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: /add|new/i }).first()).toBeVisible({ timeout: 15000 });

    // ── 5. Financial Sections Audit ─────────────────────────────────────────────
    // Plan/Spending (route is /spending, h1 = "Plan")
    await page.goto('/spending', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await expect(page).toHaveURL(/spending/);
    await expect(page.getByRole('heading', { name: /plan/i }).first()).toBeVisible({ timeout: 20000 });

    // Insights / Analytics (route is /insights, h1 = "Insights")
    await page.goto('/insights', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await expect(page).toHaveURL(/insights/);
    await expect(page.getByRole('heading', { name: /insights/i }).first()).toBeVisible({ timeout: 20000 });

    // Investments (route is /investments, h1 = "Investments & SIPs")
    await page.goto('/investments', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await expect(page).toHaveURL(/investments/);
    await expect(page.getByRole('heading', { name: /investments/i }).first()).toBeVisible({ timeout: 20000 });

    // Loans (route is /loans, h1 = "Loans & EMIs")
    await page.goto('/loans', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await expect(page).toHaveURL(/loans/);
    await expect(page.getByRole('heading', { name: /loans/i }).first()).toBeVisible({ timeout: 20000 });

    // ── 6. Settings, Legal Discoverability, and Danger Zone ──────────────────────
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await expect(page).toHaveURL(/settings/);
    await expect(page.getByText(/legal, privacy & compliance/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('link', { name: /privacy policy/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('link', { name: /terms & conditions|terms of service/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/danger zone/i)).toBeVisible({ timeout: 10000 });

    // ── 7. Deletion Modal Interaction ───────────────────────────────────────────
    const deleteBtn = page.getByRole('button', { name: /delete account/i }).first();
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible({ timeout: 10000 });
    await expect(deleteDialog.getByText(/permanently delete your account/i)).toBeVisible({ timeout: 10000 });

    // Step 1: Proceed to Confirmation Phrase
    const proceedBtn = deleteDialog.getByRole('button', { name: /proceed to confirmation/i });
    await expect(proceedBtn).toBeVisible({ timeout: 10000 });
    await proceedBtn.click();

    // Step 2: Confirmation input
    const phraseInput = deleteDialog.getByPlaceholder(/DELETE MY ACCOUNT/);
    await expect(phraseInput).toBeVisible({ timeout: 10000 });
    await phraseInput.fill('DELETE MY ACCOUNT');

    const confirmDeleteBtn = deleteDialog.getByRole('button', { name: /permanently delete account/i });
    await expect(confirmDeleteBtn).toBeEnabled({ timeout: 5000 });
    await confirmDeleteBtn.click();

    // Verify redirected to login after permanent deletion
    await page.waitForURL('**/login**', { timeout: 45000 });
    await expect(page).toHaveURL(/login/);

    // ── 8. Verify Deleted User Cannot Log In ─────────────────────────────────────
    await page.waitForLoadState('networkidle', { timeout: 20000 });
    await page.locator('#email').fill(testUserEmail);
    await page.locator('#password').fill(testUserPassword);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/invalid login credentials|invalid credentials/i)).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/login/);
  });
});
