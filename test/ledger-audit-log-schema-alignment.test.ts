import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';

test('AUDIT SCHEMA [AUD-01]: Migration 016 uses canonical action column in post_journal_entry', () => {
  const m16Path = path.resolve(process.cwd(), 'supabase/migrations/016_fix_ledger_audit_log_column_alignment.sql');
  const sql = fs.readFileSync(m16Path, 'utf8');

  // Must not reference event_type anywhere
  assert.strictEqual(sql.includes('event_type'), false, 'Migration 016 must NOT contain event_type');
  
  // Must insert into action column
  assert.strictEqual(sql.includes('INSERT INTO public.ledger_audit_log'), true);
  assert.strictEqual(sql.includes('action,'), true);
  assert.strictEqual(sql.includes("'POST'"), true);
  assert.strictEqual(sql.includes("'REVERSE'"), true);
});

test('AUDIT SCHEMA [AUD-02]: APPLY_MIGRATIONS_012_013.sql contains zero occurrences of event_type', () => {
  const bundlePath = path.resolve(process.cwd(), 'supabase/APPLY_MIGRATIONS_012_013.sql');
  const sql = fs.readFileSync(bundlePath, 'utf8');

  assert.strictEqual(sql.includes('event_type'), false, 'APPLY_MIGRATIONS_012_013.sql must NOT contain event_type');
  assert.strictEqual(sql.includes('INSERT INTO public.ledger_audit_log'), true);
});

test('AUDIT SCHEMA [AUD-03]: Database TypeScript types strictly define ledger_audit_log with action', () => {
  const dbTypesPath = path.resolve(process.cwd(), 'src/types/database.ts');
  const code = fs.readFileSync(dbTypesPath, 'utf8');

  assert.strictEqual(code.includes('ledger_audit_log: {'), true);
  assert.strictEqual(code.includes('action: string'), true);
  assert.strictEqual(code.includes('event_type: string'), false, 'Database types must NOT define event_type on ledger_audit_log');
});

test('AUDIT SCHEMA [AUD-04]: /api/chat queries canonical columns for recurring_transactions', () => {
  const chatPath = path.resolve(process.cwd(), 'src/app/api/chat/route.ts');
  const code = fs.readFileSync(chatPath, 'utf8');

  // Must not query non-existent columns (name, is_active) on recurring_transactions
  assert.strictEqual(code.includes("from('recurring_transactions').select('id, name"), false);
  assert.strictEqual(code.includes("from('recurring_transactions').select('id, description, amount, type, next_date, status')"), true);
});

test('AUDIT SCHEMA [AUD-05]: Migration chain 001-016 maintains immutable ledger audit log contract', () => {
  const migrationsDir = path.resolve(process.cwd(), 'supabase/migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

  for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    if (content.includes('INSERT INTO public.ledger_audit_log')) {
      assert.strictEqual(content.includes('event_type'), false, `${file} must not contain event_type`);
      assert.strictEqual(content.includes('action'), true, `${file} must reference action`);
    }
  }
});
