const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function test() {
  const email = 'test_tester_' + Date.now() + '@example.com';
  const { data: authData } = await supabase.auth.signUp({
    email, password: 'Password123!', options: { data: { full_name: 'Test' } }
  });

  console.log('User signed up:', authData.user?.id);

  console.log('Testing useDashboardStats queries...');
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const queries = [
    supabase.from('accounts').select('balance, ownership, type, is_active'),
    supabase.from('transactions').select('type, amount, direction').gte('date', startOfMonth.toISOString()),
    supabase.from('third_party_funds').select('amount, status'),
    supabase.from('receivables').select('remaining_amount, status'),
    supabase.from('payables').select('remaining_amount, status'),
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('status', 'needs_review')
  ];

  try {
    const results = await Promise.all(queries);
    console.log('Queries executed without crashing!', results.map(r => r.error));
  } catch(e) {
    console.error('Crash in queries:', e);
  }
}
test();
