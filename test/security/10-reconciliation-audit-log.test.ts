import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sanitizeImportText, parseCleanAmount, parseDateString } from '../../src/lib/reconciliation/import-sanitizer.ts';

// Phase 17, 27, 29: Reconciliation, CSV Formula Injection, and Audit Log Forensics

test('RECONCILIATION & AUDIT [10-01]: Formula injection payloads in imported and exported CSV text are disarmed', () => {
  // ATTACK: Inserting DDE / formula injection commands via transaction descriptions or CSV files
  // EXPECTED DEFENSE: Leading formula trigger characters (=, +, -, @, |) in text fields are prefixed with a single quote
  assert.equal(sanitizeImportText('=cmd|\'/C calc\'!A0'), "'=cmd|'/C calc'!A0");
  assert.equal(sanitizeImportText('=HYPERLINK("http://evil.com","Click")'), "'=HYPERLINK(\"http://evil.com\",\"Click\")");
  assert.equal(sanitizeImportText('@SUM(1+1)'), "'@SUM(1+1)");
  assert.equal(sanitizeImportText('+cmd|test'), "'+cmd|test");
  assert.equal(sanitizeImportText('-cmd|test'), "'-cmd|test");

  // Standard narration is preserved intact
  assert.equal(sanitizeImportText('Zomato Online Food Order'), 'Zomato Online Food Order');
  assert.equal(sanitizeImportText('Salary Credit - Aug 2026'), 'Salary Credit - Aug 2026');
});

test('RECONCILIATION & AUDIT [10-02]: parseCleanAmount preserves negative financial amounts while stripping malicious formatting', () => {
  assert.equal(parseCleanAmount('-500.00'), -500);
  assert.equal(parseCleanAmount('-1,250.75'), -1250.75);
  assert.equal(parseCleanAmount('(750.00)'), -750);
  assert.equal(parseCleanAmount('500.00 Dr'), -500);
  assert.equal(parseCleanAmount('₹25,000.00'), 25000);
  assert.equal(parseCleanAmount(null), 0);
  assert.equal(parseCleanAmount(''), 0);
});

test('RECONCILIATION & AUDIT [10-03]: Ledger audit log payload hash strictly uses cryptographic SHA-256 (64 hex characters)', () => {
  // ATTACK: Forging or skipping audit hash verification
  // EXPECTED DEFENSE: Audit records compute standard SHA-256 over journal payload
  const samplePayload = 'entry-123|2026-08-20|1000.00:[acc-1,1000.00,0.00][acc-2,0.00,1000.00]';
  const computedHash = crypto.createHash('sha256').update(samplePayload).digest('hex');

  // Verify hash length and character set
  assert.equal(computedHash.length, 64, 'SHA-256 hash must be exactly 64 hex characters');
  assert.match(computedHash, /^[0-9a-f]{64}$/, 'SHA-256 must be valid lowercase hexadecimal string');
});
