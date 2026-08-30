# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: adversarial-security-audit.spec.ts >> AUTH boundary >> E2E-AUTH-05: /api/account/reset-data GET returns 405
- Location: playwright\e2e\adversarial-security-audit.spec.ts:92:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 405
Received: 401
```

# Test source

```ts
  1   | /**
  2   |  * NisFlow Finance — Adversarial Multi-User PLAYWRIGHT Audit
  3   |  *
  4   |  * BROWSER-ONLY tests: login, logout, UI isolation, security headers,
  5   |  * AI injection via browser fetch (credentials:include), session expiry.
  6   |  *
  7   |  * The REST/Supabase IDOR probes run separately in:
  8   |  *   test/security/15-adversarial-idor-rest.test.ts  (node --test runner)
  9   |  *
  10  |  * Prerequisites:
  11  |  *   - npm run dev running on http://localhost:3000
  12  |  *   - TEST_USER_A_EMAIL / TEST_USER_A_PASS  (must be pre-existing approved accounts)
  13  |  *   - TEST_USER_B_EMAIL / TEST_USER_B_PASS
  14  |  *   - TEST_ADMIN_EMAIL  / TEST_ADMIN_PASS
  15  |  *
  16  |  *   OR: run with default disposable creds defined below (requires public registration mode)
  17  |  */
  18  | 
  19  | import { test, expect, Page } from '@playwright/test';
  20  | 
  21  | const BASE_URL   = process.env.BASE_URL          || 'http://localhost:3000';
  22  | const A_EMAIL    = process.env.TEST_USER_A_EMAIL || 'e2e-test-user@nisflow.test';
  23  | const A_PASS     = process.env.TEST_USER_A_PASS  || 'E2eTestPassword!2026';
  24  | const B_EMAIL    = process.env.TEST_USER_B_EMAIL || 'e2e-test-user2@nisflow.test';
  25  | const B_PASS     = process.env.TEST_USER_B_PASS  || 'E2eTestPassword!2026';
  26  | 
  27  | // ── helpers ──────────────────────────────────────────────────────────────────
  28  | 
  29  | async function loginUI(page: Page, email: string, pass: string) {
  30  |   await page.goto('/login');
  31  |   await page.waitForLoadState('networkidle');
  32  |   await page.getByLabel(/email/i).first().fill(email);
  33  |   await page.getByLabel(/password/i).first().fill(pass);
  34  |   await page.getByRole('button', { name: /sign in|login/i }).click();
  35  |   await page.waitForURL('**/dashboard', { timeout: 20000 });
  36  | }
  37  | 
  38  | async function apiCall(
  39  |   page: Page,
  40  |   path: string,
  41  |   body: object
  42  | ): Promise<{ status: number; text: string }> {
  43  |   return page.evaluate(
  44  |     async ({ BASE_URL, path, body }) => {
  45  |       const res = await fetch(`${BASE_URL}${path}`, {
  46  |         method: 'POST',
  47  |         headers: { 'Content-Type': 'application/json' },
  48  |         credentials: 'include',
  49  |         body: JSON.stringify(body),
  50  |       });
  51  |       const text = await res.text();
  52  |       return { status: res.status, text };
  53  |     },
  54  |     { BASE_URL, path, body }
  55  |   );
  56  | }
  57  | 
  58  | // ── AUTHENTICATION BOUNDARY ───────────────────────────────────────────────────
  59  | 
  60  | test.describe('AUTH boundary', () => {
  61  | 
  62  |   test('E2E-AUTH-01: Unauthenticated /api/chat returns 401 JSON (not HTML)', async ({ request }) => {
  63  |     const res = await request.post(`${BASE_URL}/api/chat`, {
  64  |       data: { messages: [{ role: 'user', content: 'test' }] },
  65  |     });
  66  |     expect(res.status()).toBe(401);
  67  |     expect(res.headers()['content-type']).toMatch(/application\/json/);
  68  |     const body = await res.json();
  69  |     expect(body).toHaveProperty('error');
  70  |     expect(body.error).not.toMatch(/stack|at Object|at process/i);
  71  |   });
  72  | 
  73  |   test('E2E-AUTH-02: Unauthenticated /api/ai/categorize returns 401', async ({ request }) => {
  74  |     const res = await request.post(`${BASE_URL}/api/ai/categorize`, {
  75  |       data: { description: 'Starbucks' },
  76  |     });
  77  |     expect(res.status()).toBe(401);
  78  |   });
  79  | 
  80  |   test('E2E-AUTH-03: Unauthenticated /api/ai/insights returns 401', async ({ request }) => {
  81  |     const res = await request.post(`${BASE_URL}/api/ai/insights`, { data: {} });
  82  |     expect(res.status()).toBe(401);
  83  |   });
  84  | 
  85  |   test('E2E-AUTH-04: Unauthenticated /api/account/reset-data returns 401', async ({ request }) => {
  86  |     const res = await request.post(`${BASE_URL}/api/account/reset-data`, {
  87  |       data: { confirmation: 'RESET MY DATA' },
  88  |     });
  89  |     expect(res.status()).toBe(401);
  90  |   });
  91  | 
  92  |   test('E2E-AUTH-05: /api/account/reset-data GET returns 405', async ({ request }) => {
  93  |     const res = await request.get(`${BASE_URL}/api/account/reset-data`);
> 94  |     expect(res.status()).toBe(405);
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  95  |   });
  96  | 
  97  |   test('E2E-AUTH-06: /api/recurring/execute with wrong bearer returns 401', async ({ request }) => {
  98  |     const res = await request.post(`${BASE_URL}/api/recurring/execute`, {
  99  |       headers: { Authorization: 'Bearer WRONG-SECRET-XYZ' },
  100 |       data: {},
  101 |     });
  102 |     expect(res.status()).toBe(401);
  103 |   });
  104 | 
  105 |   test('E2E-AUTH-07: All financial routes redirect unauthenticated browser to /login', async ({ page }) => {
  106 |     const routes = [
  107 |       '/dashboard', '/accounts', '/transactions', '/investments',
  108 |       '/loans', '/people', '/documents', '/settings', '/admin',
  109 |     ];
  110 |     for (const route of routes) {
  111 |       await page.goto(route);
  112 |       await page.waitForURL(/login/, { timeout: 8000 });
  113 |       expect(page.url(), `Route ${route} must redirect to login`).toMatch(/login/);
  114 |     }
  115 |   });
  116 | 
  117 |   test('E2E-AUTH-08: After clearing cookies, API returns 401', async ({ page }) => {
  118 |     await loginUI(page, A_EMAIL, A_PASS);
  119 |     await page.context().clearCookies();
  120 |     const result = await apiCall(page, '/api/chat', {
  121 |       messages: [{ role: 'user', content: 'hello' }],
  122 |     });
  123 |     expect(result.status).toBe(401);
  124 |   });
  125 | 
  126 |   test('E2E-AUTH-09: After logout, dashboard redirects to login', async ({ page }) => {
  127 |     await loginUI(page, A_EMAIL, A_PASS);
  128 |     // Clear session by clearing cookies (simulates expiry/logout)
  129 |     await page.context().clearCookies();
  130 |     await page.goto('/dashboard');
  131 |     await page.waitForURL(/login/, { timeout: 8000 });
  132 |     expect(page.url()).toMatch(/login/);
  133 |   });
  134 | 
  135 |   test('E2E-AUTH-10: Invalid login shows generic error (no account enumeration)', async ({ page }) => {
  136 |     await page.goto('/login');
  137 |     await page.getByLabel(/email/i).first().fill('nonexistent-audit@nisflow-audit.invalid');
  138 |     await page.getByLabel(/password/i).first().fill('wrongpassword');
  139 |     await page.getByRole('button', { name: /sign in|login/i }).click();
  140 |     await page.waitForTimeout(3000);
  141 |     expect(page.url()).not.toMatch(/dashboard/);
  142 |     const pageText = await page.textContent('body');
  143 |     expect(pageText).not.toMatch(/not found|not registered|does not exist|no user/i);
  144 |   });
  145 | });
  146 | 
  147 | // ── SECURITY HEADERS ──────────────────────────────────────────────────────────
  148 | 
  149 | test.describe('Security headers', () => {
  150 |   test('E2E-HDR-01: All required security headers are present on /login', async ({ request }) => {
  151 |     const res = await request.get(`${BASE_URL}/login`);
  152 |     const h = res.headers();
  153 |     expect(h['x-frame-options'],          'X-Frame-Options missing').toMatch(/DENY/i);
  154 |     expect(h['x-content-type-options'],   'X-Content-Type-Options missing').toMatch(/nosniff/i);
  155 |     expect(h['strict-transport-security'],'HSTS missing').toMatch(/max-age/i);
  156 |     expect(h['content-security-policy'],  'CSP missing').toBeTruthy();
  157 |     expect(h['referrer-policy'],          'Referrer-Policy missing').toBeTruthy();
  158 |     expect(h['x-powered-by'],             'X-Powered-By must be absent').toBeUndefined();
  159 |   });
  160 | 
  161 |   test('E2E-HDR-02: CSP does not allow unsafe-eval in production mode', async ({ request }) => {
  162 |     const res = await request.get(`${BASE_URL}/login`);
  163 |     const csp = res.headers()['content-security-policy'] ?? '';
  164 |     // In dev turbopack mode unsafe-eval is present; this test notes the state
  165 |     if (process.env.NODE_ENV === 'production') {
  166 |       expect(csp).not.toContain("'unsafe-eval'");
  167 |     } else {
  168 |       // Dev mode — note presence, do not fail
  169 |       console.info('CSP unsafe-eval present in dev mode (expected):', csp.includes("'unsafe-eval'"));
  170 |     }
  171 |   });
  172 | 
  173 |   test('E2E-HDR-03: frame-ancestors none is set (clickjacking prevention)', async ({ request }) => {
  174 |     const res = await request.get(`${BASE_URL}/login`);
  175 |     const csp = res.headers()['content-security-policy'] ?? '';
  176 |     expect(csp).toMatch(/frame-ancestors\s+'none'/i);
  177 |   });
  178 | 
  179 |   test('E2E-HDR-04: Security headers present on API routes', async ({ request }) => {
  180 |     const res = await request.post(`${BASE_URL}/api/chat`, { data: {} });
  181 |     const h = res.headers();
  182 |     // API routes get the same headers from next.config.ts catch-all
  183 |     expect(h['x-frame-options']).toMatch(/DENY/i);
  184 |     expect(h['x-content-type-options']).toMatch(/nosniff/i);
  185 |   });
  186 | });
  187 | 
  188 | // ── API INPUT VALIDATION ──────────────────────────────────────────────────────
  189 | 
  190 | test.describe('API input validation', () => {
  191 |   test('E2E-API-01: /api/chat rejects oversized body (413 or 401)', async ({ request }) => {
  192 |     const huge = 'x'.repeat(55000);
  193 |     const res = await request.post(`${BASE_URL}/api/chat`, {
  194 |       data: { messages: [{ role: 'user', content: huge }] },
```