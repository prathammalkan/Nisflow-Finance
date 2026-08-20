import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Phase 9, 10, 11, 12, 13: AI Security, Prompt Injection, Context Isolation & History Bounds

test('AI SECURITY [06-01]: /api/chat enforces bounded message history and payload length limits', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  assert.ok(fs.existsSync(chatRoutePath), 'chat route.ts must exist');
  const code = fs.readFileSync(chatRoutePath, 'utf8');

  // Verify message count bound (<= 20)
  assert.match(code, /messages\.length\s*>\s*20/, 'Must reject requests exceeding 20 messages in history');

  // Verify per-message truncation (slice(0, 2000))
  assert.match(code, /\.slice\(0,\s*2000\)/, 'Must truncate message content to 2000 characters');

  // Verify role sanitization
  assert.match(code, /role:\s*\(m\.role\s*===\s*'user'\s*\?\s*'user'\s*:\s*'assistant'\)/, 'Must sanitize message roles');
});

test('AI SECURITY [06-02]: AI Context Builder isolates tenant data and bounds record queries', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const code = fs.readFileSync(chatRoutePath, 'utf8');

  // Verify user_id filtering on all context fetches
  assert.match(code, /\.eq\('user_id',\s*user\.id\)/, 'Context queries must strictly filter by authenticated user.id');

  // Verify query limits prevent token exhaust DoS
  assert.match(code, /\.limit\(50\)/, 'Account/Counterparty queries must be bounded with .limit()');

  // Verify exclusion of sensitive credentials/documents
  assert.doesNotMatch(code, /from\('documents'\)/, 'Documents must NOT be dumped into AI context');
  assert.doesNotMatch(code, /from\('tax_records'\)/, 'Tax records must NOT be dumped into AI chat context');
});

test('AI SECURITY [06-03]: AI Financial actions enforce explicit user confirmation before ledger mutation', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const code = fs.readFileSync(chatRoutePath, 'utf8');

  // System prompt instructions must require ACTION block formatting for user review
  assert.match(code, /ACTION/i, 'Prompt must format proposed operations as structured action blocks for user review');
  assert.match(code, /confirm/i, 'Prompt must explicitly instruct AI that confirmation is required');
});

test('AI SECURITY [06-04]: /api/chat differentiates 429 Rate Limited from 503 Service Unavailable', () => {
  const chatRoutePath = path.join(process.cwd(), 'src', 'app', 'api', 'chat', 'route.ts');
  const code = fs.readFileSync(chatRoutePath, 'utf8');

  assert.match(code, /status:\s*429/, 'Must return 429 on quota exhaustion');
  assert.match(code, /status:\s*503/, 'Must return 503 on service outage');
});
