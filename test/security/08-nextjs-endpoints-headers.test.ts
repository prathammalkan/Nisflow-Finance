import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Phase 14, 15, 18: Next.js Endpoints, SSRF Defense, and Headers Hardening

test('NEXTJS [08-01]: next.config.ts configures comprehensive security headers', () => {
  const configPath = path.join(process.cwd(), 'next.config.ts');
  assert.ok(fs.existsSync(configPath), 'next.config.ts must exist');
  const code = fs.readFileSync(configPath, 'utf8');

  // Verify headers
  assert.match(code, /'Strict-Transport-Security'/, 'HSTS header must be configured');
  assert.match(code, /'X-Content-Type-Options'/, 'X-Content-Type-Options must be configured');
  assert.match(code, /'X-Frame-Options'/, 'X-Frame-Options must be configured');
  assert.match(code, /'Content-Security-Policy'/, 'CSP must be configured');
  assert.match(code, /frame-ancestors 'none'/, 'frame-ancestors must be locked to none');
  assert.match(code, /object-src 'none'/, 'object-src must be none');
  assert.match(code, /poweredByHeader:\s*false/, 'poweredByHeader must be false');
});

test('NEXTJS [08-02]: Production CSP excludes unsafe-eval', () => {
  const configPath = path.join(process.cwd(), 'next.config.ts');
  const code = fs.readFileSync(configPath, 'utf8');

  // Verify unsafe-eval conditional on production
  assert.match(code, /isProd\s*\?\s*"script-src 'self' 'unsafe-inline'"/, 'Production CSP must omit unsafe-eval');
});

test('NEXTJS [08-03]: Image optimization remote patterns restrict allowed hosts (dynamically from env)', () => {
  const configPath = path.join(process.cwd(), 'next.config.ts');
  const code = fs.readFileSync(configPath, 'utf8');

  // Verify remotePatterns is configured from NEXT_PUBLIC_SUPABASE_URL env var, not hardcoded
  assert.match(code, /remotePatterns/, 'next.config.ts must have remotePatterns configured');
  // Must NOT use a hardcoded project-specific hostname (security: no project ref in source)
  assert.doesNotMatch(code, /hostname:\s*["'][\w-]+\.supabase\.co["']/, 'remotePatterns must NOT hardcode a project-specific hostname — use env-derived supabaseHost');
  // Must NOT allow wildcards
  assert.doesNotMatch(code, /hostname:\s*["']\*["']/, 'Wildcard domains in image loader must NOT be allowed');
  // supabaseHost must be derived from the env variable
  assert.match(code, /NEXT_PUBLIC_SUPABASE_URL/, 'next.config.ts must derive the Supabase host from NEXT_PUBLIC_SUPABASE_URL env var');
});


test('NEXTJS [08-04]: /api/recurring/execute applies timing-safe comparison to prevent secret enumeration', () => {
  const routePath = path.join(process.cwd(), 'src', 'app', 'api', 'recurring', 'execute', 'route.ts');
  assert.ok(fs.existsSync(routePath), 'recurring execute route.ts must exist');
  const code = fs.readFileSync(routePath, 'utf8');

  assert.match(code, /timingSafeEqual/, 'Must use crypto.timingSafeEqual for constant-time bearer validation');
  assert.match(code, /Bearer \$\{cronSecret\}/, 'Must require Bearer token authorization');
});
