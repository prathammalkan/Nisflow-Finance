import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================
// Notifications RLS & AI Hardening Regression Tests
// ============================================================

function readRoute(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'src', relPath), 'utf8');
}

// ── Notifications hook correctness ───────────────────────────
test('NOTIF RLS [13-01]: useNotifications does NOT expose table without user scope', () => {
  const code = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-notifications.ts'), 'utf8'
  );
  const fnStart = code.indexOf('export function useNotifications(');
  const fnEnd = code.indexOf('export function useMarkNotificationRead');
  const body = code.slice(fnStart, fnEnd);
  // Must NOT have a bare .select without user_id filter
  assert.match(body, /eq\('user_id'/, 'useNotifications must filter by user_id');
  assert.match(body, /getUser/, 'useNotifications must call getUser');
});

test('NOTIF RLS [13-02]: useMarkNotificationRead requires auth and user ownership', () => {
  const code = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-notifications.ts'), 'utf8'
  );
  const fnStart = code.indexOf('export function useMarkNotificationRead');
  const fnEnd = code.indexOf('export function useMarkAllRead');
  const body = code.slice(fnStart, fnEnd);
  assert.match(body, /getUser/, 'useMarkNotificationRead must authenticate');
  assert.match(body, /eq\('user_id'/, 'useMarkNotificationRead must scope update by user_id');
  assert.match(body, /Not authenticated/, 'Must throw on unauthenticated call');
});

test('NOTIF RLS [13-03]: useMarkAllRead scopes by user_id (existing, verify not regressed)', () => {
  const code = fs.readFileSync(
    path.join(process.cwd(), 'src', 'lib', 'hooks', 'use-notifications.ts'), 'utf8'
  );
  const fnStart = code.indexOf('export function useMarkAllRead');
  const fnBody = code.slice(fnStart, fnStart + 600);
  assert.match(fnBody, /eq\('user_id'/, 'useMarkAllRead must filter by user_id');
});

test('NOTIF RLS [13-04]: Migration 024 applies FORCE ROW LEVEL SECURITY to notifications', () => {
  const migDir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = fs.readdirSync(migDir).filter(f => f.startsWith('024'));
  assert.ok(files.length > 0, 'Migration 024 must exist');
  const content = fs.readFileSync(path.join(migDir, files[0]), 'utf8');
  assert.match(content, /notifications.*ENABLE ROW LEVEL SECURITY|ENABLE ROW LEVEL SECURITY.*notifications/is, 
    'notifications must have RLS enabled');
  assert.match(content, /notifications.*FORCE ROW LEVEL SECURITY|FORCE ROW LEVEL SECURITY.*notifications/is,
    'notifications must have FORCE RLS');
});

test('NOTIF RLS [13-05]: Notifications RLS SELECT policy uses auth.uid() = user_id', () => {
  const migDir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = fs.readdirSync(migDir).filter(f => f.startsWith('024'));
  const content = fs.readFileSync(path.join(migDir, files[0]), 'utf8');
  assert.match(content, /auth\.uid\(\)\s*=\s*user_id/, 'Must use auth.uid() = user_id pattern in RLS policies');
});

test('NOTIF RLS [13-06]: Notifications INSERT policy uses WITH CHECK (auth.uid() = user_id)', () => {
  const migDir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = fs.readdirSync(migDir).filter(f => f.startsWith('024'));
  const content = fs.readFileSync(path.join(migDir, files[0]), 'utf8');
  assert.match(content, /WITH CHECK.*auth\.uid\(\)\s*=\s*user_id/s, 
    'INSERT policy must use WITH CHECK (auth.uid() = user_id)');
});

test('NOTIF RLS [13-07]: Approved-users restrictive policy applied to notifications', () => {
  const migDir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = fs.readdirSync(migDir).filter(f => f.startsWith('024'));
  const content = fs.readFileSync(path.join(migDir, files[0]), 'utf8');
  assert.match(content, /approved_users_only_notifications/, 
    'Restrictive is_user_approved() policy must be applied to notifications');
  assert.match(content, /AS RESTRICTIVE/, 'Policy must be RESTRICTIVE type');
});

// ── AI Hardening Tests ───────────────────────────────────────
test('AI HARDEN [14-01]: escapeForPrompt function exists in chat route (LOW-03)', () => {
  const code = readRoute('app/api/chat/route.ts');
  assert.match(code, /function escapeForPrompt/, 'escapeForPrompt helper must exist');
  assert.match(code, /replace.*&lt;|replace.*&amp;/, 'Must escape HTML entities');
});

test('AI HARDEN [14-02]: User-controlled account names are escaped before prompt embedding', () => {
  const code = readRoute('app/api/chat/route.ts');
  assert.match(code, /escapeForPrompt\(acc\.name\)/, 'Account names must be escaped');
});

test('AI HARDEN [14-03]: Counterparty names are escaped before prompt embedding (LOW-03)', () => {
  const code = readRoute('app/api/chat/route.ts');
  assert.match(code, /escapeForPrompt\(p\.name\)/, 'Counterparty names must be escaped');
});

test('AI HARDEN [14-04]: Transaction descriptions are escaped before prompt embedding', () => {
  const code = readRoute('app/api/chat/route.ts');
  assert.match(code, /escapeForPrompt\(.*description/, 'Transaction descriptions must be escaped');
});

test('AI HARDEN [14-05]: Loan names are escaped before prompt embedding', () => {
  const code = readRoute('app/api/chat/route.ts');
  assert.match(code, /escapeForPrompt\(loanBal\.loanName\)|escapeForPrompt\(.*loanName/, 'Loan names must be escaped');
});

test('AI HARDEN [14-06]: System prompt includes non-disclosure rule (AI-01)', () => {
  const code = readRoute('app/api/chat/route.ts');
  assert.match(code, /Confidentiality.*Never reveal.*system instructions|Never reveal.*paraphrase.*system instructions/is,
    'System prompt must include non-disclosure confidentiality rule');
});

test('AI HARDEN [14-07]: Zod message schema defined in chat route (P5)', () => {
  const code = readRoute('app/api/chat/route.ts');
  assert.match(code, /MessageSchema\s*=\s*z\.object/, 'MessageSchema Zod schema must be defined');
  assert.match(code, /z\.enum\(\[.user.*assistant/, 'MessageSchema must validate role enum');
  assert.match(code, /z\.string\(\)\.max\(2000\)/, 'MessageSchema must limit content to 2000 chars');
});

test('AI HARDEN [14-08]: Body size guard exists before JSON parsing in chat route (LOW-04)', () => {
  const code = readRoute('app/api/chat/route.ts');
  assert.match(code, /MAX_BODY_BYTES|content-length.*50_000|50000/, 'Body size limit must be enforced');
  assert.match(code, /413/, 'Must return 413 when body too large');
});

test('AI HARDEN [14-09]: categorize route uses positional index not UUID in AI prompt (LOW-01)', () => {
  const code = readRoute('app/api/ai/categorize/route.ts');
  // Must NOT send UUIDs to the AI
  assert.doesNotMatch(code, /`- ID: \${c\.id}/, 'Must NOT embed category UUIDs in AI prompt');
  // Must use index format
  assert.match(code, /categoryIndex/, 'Must use categoryIndex positional approach');
  assert.match(code, /\[.*i.*\].*c\.name|\[.*\$\{i\}/, 'Must use index in prompt format');
});

test('AI HARDEN [14-10]: categorize route validates index bounds before resolving UUID (LOW-12)', () => {
  const code = readRoute('app/api/ai/categorize/route.ts');
  assert.match(code, /categoryRows\.length/, 'Must validate index against categoryRows length');
  assert.match(code, /422/, 'Must return 422 on invalid index');
  assert.match(code, /resolvedCategory/, 'Must resolve index to UUID server-side');
});

test('AI HARDEN [14-11]: categorize route resolved categoryId from server-side array (LOW-12)', () => {
  const code = readRoute('app/api/ai/categorize/route.ts');
  // Must resolve from the server-side categories array, not trust AI-generated UUID
  assert.match(code, /resolvedCategory\.id/, 'Must return resolvedCategory.id not model-generated UUID');
});

test('AI HARDEN [14-12]: Zod validates chat messages after body parse (P5)', () => {
  const code = readRoute('app/api/chat/route.ts');
  assert.match(code, /z\.array\(MessageSchema\)\.safeParse/, 'Must Zod-validate messages array');
  assert.match(code, /parseResult\.success/, 'Must check parse result before proceeding');
  assert.match(code, /parseResult\.data/, 'Must use Zod-validated data, not raw messages');
});
