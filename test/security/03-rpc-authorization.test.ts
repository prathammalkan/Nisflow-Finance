import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Phase 6 & 22: RPC Security, Caller Authorization, and Search Path Hardening

test('RPC [03-01]: Migration 010 enforces auth.uid() matching and rejects anonymous callers in post_journal_entry', () => {
  const migration010Path = path.join(process.cwd(), 'supabase', 'migrations', '010_rpc_caller_authorization.sql');
  assert.ok(fs.existsSync(migration010Path), '010_rpc_caller_authorization.sql must exist');
  const sql = fs.readFileSync(migration010Path, 'utf8');

  // Verify post_journal_entry security checks
  assert.match(
    sql,
    /IF\s+auth\.role\(\)\s*=\s*'authenticated'\s+AND\s+\(auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+AND\s+auth\.uid\(\)\s*<>\s*p_user_id\)\s+THEN\s+RAISE\s+EXCEPTION/i,
    'post_journal_entry must reject mismatched auth.uid() caller'
  );

  assert.match(
    sql,
    /IF\s+auth\.role\(\)\s*=\s*'anon'/i,
    'post_journal_entry must reject anonymous callers'
  );
});

test('RPC [03-02]: Migration 010 enforces caller authorization on post_reversal_entry', () => {
  const migration010Path = path.join(process.cwd(), 'supabase', 'migrations', '010_rpc_caller_authorization.sql');
  const sql = fs.readFileSync(migration010Path, 'utf8');

  // Verify post_reversal_entry checks
  assert.match(
    sql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.post_reversal_entry[\s\S]*?IF\s+auth\.role\(\)\s*=\s*'authenticated'\s+AND\s+\(auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+AND\s+auth\.uid\(\)\s*<>\s*p_user_id\)\s+THEN/i,
    'post_reversal_entry must enforce caller auth.uid()'
  );
});

test('RPC [03-03]: Migration 010 enforces caller authorization on reconcile_ledger_balances', () => {
  const migration010Path = path.join(process.cwd(), 'supabase', 'migrations', '010_rpc_caller_authorization.sql');
  const sql = fs.readFileSync(migration010Path, 'utf8');

  assert.match(
    sql,
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.reconcile_ledger_balances[\s\S]*?IF\s+auth\.role\(\)\s*=\s*'authenticated'\s+AND\s+\(auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+AND\s+auth\.uid\(\)\s*<>\s*p_user_id\)\s+THEN/i,
    'reconcile_ledger_balances must enforce caller auth.uid()'
  );
});

test('RPC [03-04]: All SECURITY DEFINER functions have explicit safe search_path = public, extensions', () => {
  const migrationFiles = [
    '005_security_hardening.sql',
    '007_double_entry_ledger.sql',
    '009_forensic_remediation.sql',
    '010_rpc_caller_authorization.sql',
    '012_security_and_schema_alignment.sql'
  ];

  for (const file of migrationFiles) {
    const filePath = path.join(process.cwd(), 'supabase', 'migrations', file);
    if (!fs.existsSync(filePath)) continue;
    const sql = fs.readFileSync(filePath, 'utf8');

    // Find all SECURITY DEFINER function declarations
    const secDefinerMatches = sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_.]+)\s*\([\s\S]*?SECURITY\s+DEFINER([\s\S]*?);/gi);
    for (const match of secDefinerMatches) {
      const funcName = match[1];
      const funcBody = match[2];
      assert.match(
        funcBody,
        /SET\s+search_path\s*=\s*public/i,
        `SECURITY DEFINER function ${funcName} in ${file} must set safe search_path`
      );
    }
  }
});
