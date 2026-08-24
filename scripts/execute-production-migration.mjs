import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

// READ-ONLY migration verification helper.
// Credentials must be supplied through the process environment; never read .env files directly.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in the process environment.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function runProductionMigration() {
  console.log('=== TASK 4B PRODUCTION DATABASE VERIFICATION ===');
  console.log('Target Endpoint:', supabaseUrl);

  const tables = ['ledger_accounts', 'journal_entries', 'journal_lines', 'ledger_audit_log'];
  const preflightCounts = {};
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`Preflight error on ${t}:`, error.message);
      process.exit(1);
    }
    preflightCounts[t] = count ?? 0;
  }
  console.log('Pre-flight ledger counts:', preflightCounts);

  console.log('Verification complete. No credentials are read from repository files.');
}

runProductionMigration();
