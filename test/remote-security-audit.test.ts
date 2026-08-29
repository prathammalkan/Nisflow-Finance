import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyTableRead,
  classifyInsertProbe,
  classifyRpcProbe,
  classifyArtifactCheck,
  validateAnonKey,
} from '../src/lib/security/remote-audit-classifier.ts';

// 1. 0-row anonymous response is NOT automatically classified as "RLS active"
test('1. Table Read: 0-row response is classified as EMPTY DATASET, not proven RLS', () => {
  const result = classifyTableRead('ledger_accounts', 200, []);
  assert.equal(result.classification, 'EMPTY DATASET');
  assert.equal(result.verdict, 'PASS');
  assert.equal(result.rowsReturned, 0);
  assert.match(result.details, /cannot be proven from row count alone/);
});

// 2. Anonymous 401/403 is classified as authorization rejection
test('2. Table Read: 401/403 response is classified as AUTHORIZATION REJECTION', () => {
  const result401 = classifyTableRead('ledger_accounts', 401, { message: 'Unauthorized' });
  assert.equal(result401.classification, 'AUTHORIZATION REJECTION');
  assert.equal(result401.verdict, 'PASS');

  const result403 = classifyTableRead('journal_entries', 403, { message: 'Forbidden' });
  assert.equal(result403.classification, 'AUTHORIZATION REJECTION');
  assert.equal(result403.verdict, 'PASS');
});

// 3. Anonymous successful row exposure is classified as failure (DATA EXPOSURE)
test('3. Table Read: Exposing rows to anonymous request is classified as DATA EXPOSURE (FAIL)', () => {
  const result = classifyTableRead('ledger_accounts', 200, [{ id: '1', name: 'Private Account' }]);
  assert.equal(result.classification, 'DATA EXPOSURE');
  assert.equal(result.verdict, 'FAIL');
  assert.equal(result.rowsReturned, 1);
  assert.match(result.details, /CRITICAL SECURITY FAILURE/);
});

// 4. Anonymous INSERT success is classified as failure (UNAUTHORIZED INSERT SUCCEEDED)
test('4. Insert Probe: Successful anonymous insert is classified as UNAUTHORIZED INSERT SUCCEEDED (FAIL)', () => {
  const result = classifyInsertProbe('ledger_accounts', 201, [{ id: 'probe-1' }], 'AST-SECURITY-PROBE-123');
  assert.equal(result.classification, 'UNAUTHORIZED INSERT SUCCEEDED');
  assert.equal(result.verdict, 'FAIL');
});

// 5. RPC business validation error is NOT classified as authorization rejection
test('5. RPC Probe: Business validation error is classified as BUSINESS VALIDATION REACHED (REVIEW), not auth rejection', () => {
  const result = classifyRpcProbe('post_journal_entry', 400, {
    message: 'Financial Integrity Error: A journal entry must have at least 2 lines.',
  });
  assert.equal(result.classification, 'BUSINESS VALIDATION REACHED');
  assert.equal(result.verdict, 'REVIEW');
  assert.match(result.details, /reached stored procedure body/);
});

// 6. RPC 401/403/404 is classified as authorization rejection
test('6. RPC Probe: 401/403/404 is classified as AUTHORIZATION REJECTION (PASS)', () => {
  const result401 = classifyRpcProbe('post_journal_entry', 401, { message: 'Unauthorized' });
  assert.equal(result401.classification, 'AUTHORIZATION REJECTION');
  assert.equal(result401.verdict, 'PASS');

  const result404 = classifyRpcProbe('post_journal_entry', 404, { message: 'Function not found or unexposed' });
  assert.equal(result404.classification, 'AUTHORIZATION REJECTION');
  assert.equal(result404.verdict, 'PASS');
});

// 7. Probe artifacts detected is classified as FAIL
test('7. Artifact Check: Detected probe artifacts trigger FAIL', () => {
  const cleanResult = classifyArtifactCheck(0, []);
  assert.equal(cleanResult.verdict, 'PASS');
  assert.equal(cleanResult.artifactsFound, 0);

  const dirtyResult = classifyArtifactCheck(1, ['ledger_accounts:AST-SECURITY-PROBE-123']);
  assert.equal(dirtyResult.verdict, 'FAIL');
  assert.equal(dirtyResult.artifactsFound, 1);
  assert.match(dirtyResult.details, /SECURITY ARTIFACT ALERT/);
});

// 8. Service-role key usage is rejected
test('8. Key Validation: Service-role key is strictly detected and rejected', () => {
  // Construct a dummy JWT with role: "service_role"
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
  const payloadService = Buffer.from(JSON.stringify({ role: 'service_role', sub: 'admin' })).toString('base64');
  const serviceKey = `${header}.${payloadService}.fake_signature`;

  const validation = validateAnonKey(serviceKey);
  assert.equal(validation.isValidAnon, false);
  assert.match(validation.error || '', /SUPABASE_SECRET_KEY was provided/);

  const payloadAnon = Buffer.from(JSON.stringify({ role: 'anon', sub: 'guest' })).toString('base64');
  const anonKey = `${header}.${payloadAnon}.fake_signature`;
  const anonValidation = validateAnonKey(anonKey);
  assert.equal(anonValidation.isValidAnon, true);
});
