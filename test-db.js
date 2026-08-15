const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf-8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

async function test() {
  if (!key) {
    console.log('No service role key, cannot execute raw SQL');
    return;
  }
  const supabase = createClient(url, key[1].trim());

  const { error } = await supabase.rpc('exec_sql', { 
    query: 'ALTER TABLE public.accounts ALTER COLUMN user_id SET DEFAULT auth.uid();' 
  });
  console.log('RPC Error:', error);
}
test();
