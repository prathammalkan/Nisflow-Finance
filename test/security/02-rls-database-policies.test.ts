import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Phase 5: Row-Level Security (RLS) Forensic Audit

test('RLS [02-01]: Migration 001 enables Row Level Security on all core financial tables', () => {
  const migration001Path = path.join(process.cwd(), 'supabase', 'migrations', '001_initial_schema.sql');
  assert.ok(fs.existsSync(migration001Path), '001_initial_schema.sql must exist');
  const sql = fs.readFileSync(migration001Path, 'utf8');

  const requiredRlsTables = [
    'accounts',
    'transactions',
    'transaction_categories',
    'counterparties',
    'ipos',
    'investments',
    'tags',
    'transfers',
    'receivables',
    'payables',
    'loans',
    'third_party_funds',
    'ipo_applications',
    'investment_transactions',
    'budgets',
    'savings_goals',
    'documents',
    'bank_statements',
    'reconciliations',
    'monthly_closings',
    'automation_rules',
    'notifications',
    'tax_records',
    'split_expenses',
    'split_expense_shares',
    'transaction_tags',
    'budget_categories',
    'bank_statement_transactions',
    'audit_logs'
  ];

  for (const table of requiredRlsTables) {
    const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
    assert.match(sql, rlsRegex, `Table public.${table} must have RLS explicitly enabled in 001_initial_schema.sql`);
  }
});

test('RLS [02-02]: Double-Entry Ledger migration 007 enables RLS on all ledger primitives', () => {
  const migration007Path = path.join(process.cwd(), 'supabase', 'migrations', '007_double_entry_ledger.sql');
  assert.ok(fs.existsSync(migration007Path), '007_double_entry_ledger.sql must exist');
  const sql = fs.readFileSync(migration007Path, 'utf8');

  const ledgerTables = ['ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_audit_log'];
  for (const table of ledgerTables) {
    const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+public\\.${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
    assert.match(sql, rlsRegex, `Ledger table public.${table} must have RLS enabled in 007_double_entry_ledger.sql`);
  }
});

test('RLS [02-03]: Migration 009 eliminates any unrestricted WITH CHECK (true) on audit_logs', () => {
  const migration009Path = path.join(process.cwd(), 'supabase', 'migrations', '009_forensic_remediation.sql');
  assert.ok(fs.existsSync(migration009Path), '009_forensic_remediation.sql must exist');
  const sql = fs.readFileSync(migration009Path, 'utf8');

  // Verify that the old permissive policy is dropped and replaced with auth.uid() = user_id
  assert.match(sql, /DROP\s+POLICY\s+IF\s+EXISTS\s+"System can insert audit logs"\s+ON\s+public\.audit_logs/i);
  assert.match(sql, /CREATE\s+POLICY\s+"Users can insert own audit logs"\s+ON\s+public\.audit_logs\s+FOR\s+INSERT\s+WITH\s+CHECK\s+\(auth\.uid\(\)\s*=\s*user_id\)/i);
});

test('RLS [02-04]: Storage Objects RLS strictly binds document folder path to caller auth.uid()', () => {
  const storageSqlPath = path.join(process.cwd(), 'supabase', 'migrations', '006_storage_security.sql');
  assert.ok(fs.existsSync(storageSqlPath), '006_storage_security.sql must exist');
  const sql = fs.readFileSync(storageSqlPath, 'utf8');

  // Ensure documents bucket is private
  assert.match(sql, /public\s*=\s*false/i, 'Storage bucket must be private');

  // Ensure folder name isolation
  assert.match(sql, /\(auth\.uid\(\)\)::text\s*=\s*\(storage\.foldername\(name\)\)\[1\]/, 'Storage access must require folder path match to auth.uid()');
});
