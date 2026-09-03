/**
 * NisFlow Finance — Playwright Global Teardown
 *
 * Auth state (playwright/.auth/user.json) is preserved between runs so that
 * login is fast (~0ms) on re-runs within the same day.
 *
 * The test user is NOT deleted here — it is a disposable account created
 * once and reused. To delete it, remove it from the Supabase dashboard.
 */
async function globalTeardown() {
  // Nothing to clean up. Auth state is intentionally preserved.
  console.log('[globalTeardown] Done. Auth state preserved for next run.');
}

export default globalTeardown;
